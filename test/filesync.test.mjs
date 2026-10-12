import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const config = JSON.parse(await readFile(path.join(root, "filesync.json"), "utf8"));

async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await setTimeout(25);
  }
  assert.fail("Timed out waiting for filesync");
}

test("native source sync, deletion, reconnect, and API definitions", { timeout: 30000 }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bitburner-sync-"));
  let child;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) {
      if (socket.readyState !== WebSocket.CLOSED) {
        const closed = once(socket, "close");
        socket.close();
        await closed;
      }
    }
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill();
      await closed;
    }
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(path.join(directory, config.scriptsFolder, "lib"), { recursive: true });
  const fixtures = {
    "template.ts": "export function main(ns) { ns.tprint('hello'); }",
    "lib/helper.ts": "export const greeting = 'hello';",
    "ui.tsx": "export const content = <span>Hello</span>;",
    "plain.js": "export const value = 1;",
    "ui.jsx": "export const content = <span>Hello</span>;",
    "notes.txt": "hello",
    "legacy.script": "legacy",
  };
  for (const [name, content] of Object.entries(fixtures)) {
    await writeFile(path.join(directory, config.scriptsFolder, name), content);
  }
  await writeFile(path.join(directory, config.scriptsFolder, "ignored.md"), "not uploaded");
  const portProbe = createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const port = portProbe.address().port;
  await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
  await writeFile(path.join(directory, "filesync.json"), JSON.stringify({ ...config, port }));
  child = spawn(process.execPath, [require.resolve("bitburner-filesync")], { cwd: directory });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  await until(() => {
    assert.equal(child.exitCode, null, output);
    return output.includes("Server is ready");
  });

  const definitions = "export interface NS { tprint(message: string): void; }\n";
  async function connect() {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages = [];
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      messages.push(message);
      socket.send(JSON.stringify({
        jsonrpc: "2.0", id: message.id,
        result: message.method === "getDefinitionFile" ? definitions : "OK",
      }));
    });
    sockets.push(socket);
    await once(socket, "open");
    return { socket, messages };
  }
  const { socket, messages } = await connect();
  const pushed = (list, name, content) => list.some((message) =>
    message.method === "pushFile" && message.params.filename.replace(/^\//, "") === name &&
    message.params.content === content);
  await until(() => Object.entries(fixtures).every(([name, content]) => pushed(messages, name, content)));
  assert.ok(messages.filter((message) => message.method === "pushFile").every((message) =>
    message.params.server === "home" && !message.params.filename.endsWith(".md")));
  await until(async () => {
    try { return await readFile(path.join(directory, "NetscriptDefinitions.d.ts"), "utf8") === definitions; }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
  });
  await writeFile(path.join(directory, config.scriptsFolder, "template.ts"), "updated while connected");
  await until(() => pushed(messages, "template.ts", "updated while connected"));
  await writeFile(path.join(directory, config.scriptsFolder, "new.ts"), "new file");
  await until(() => pushed(messages, "new.ts", "new file"));
  await rm(path.join(directory, config.scriptsFolder, "ui.tsx"));
  await until(() => messages.some((message) => message.method === "deleteFile" &&
    message.params.filename.replace(/^\//, "") === "ui.tsx"));
  const disconnected = once(socket, "close");
  socket.close();
  await disconnected;
  await writeFile(path.join(directory, config.scriptsFolder, "template.ts"), "updated while disconnected");
  const reconnected = await connect();
  await until(() => pushed(reconnected.messages, "template.ts", "updated while disconnected"));
  assert.equal(child.exitCode, null, output);
});

test("native imports and React globals typecheck without connecting to a game", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bitburner-types-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "helper.ts"), "export const name = 'Your name';");
  const sample = path.join(directory, "sample.tsx");
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  const example = readme.match(/```tsx\r?\n([\s\S]*?)```/)?.[1];
  assert.ok(example, "README must include its runnable TSX example");
  await writeFile(sample, `${example}
import { name } from './helper.ts';
React.createElement('span', null, name);
React.useState;
ReactDOM.createPortal;`);
  const loaded = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  assert.equal(loaded.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, root);
  const program = ts.createProgram([...parsed.fileNames, sample], parsed.options);
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  assert.equal(diagnostics.length, 0, diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"));
});
