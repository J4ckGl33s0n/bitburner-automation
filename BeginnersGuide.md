# Beginner setup

Set up bitburner-automation using its native TypeScript workflow. You need current Bitburner, Node.js 24, and an editor such as VS Code.

## 1. Preserve your game files

In Bitburner's Options, export your save. Copy any scripts you want to keep into your local source folder before syncing: connecting uploads local files over matching game files.

## 2. Install Node.js 24

Download Node.js 24 from [nodejs.org](https://nodejs.org/en/download/). Open a new terminal after installation and check:

```sh
node --version
npm --version
```

The Node version should start with `v24.`. If Windows PowerShell blocks `npm.ps1`, use `npm.cmd` wherever this guide says `npm`. You do not need to change the machine's execution policy.

## 3. Open the project

Download or copy this project, extract it if necessary, and open its folder in your editor. Open the editor's terminal in the folder containing `package.json`. For example, replacing `path/to` with your project location:

```sh
cd path/to/bitburner-automation
```

You can use a different location. No Git initialization or remote configuration is required to use this project.

## 4. Install and check

```sh
npm ci
npm run check
```

These install the locked dependencies and check types, lint, and integration tests. API definitions are included, so no game connection is required yet. On Windows PowerShell, use `npm.cmd ci` and `npm.cmd run check` if needed.

## 5. Start sync and connect

```sh
npm run watch
```

Leave the terminal open. Once it reports the server is ready, open **Options → Remote API** in Bitburner, set hostname to `localhost` and port to `12525`, then connect.

## 6. Run your first script

In Bitburner's terminal:

```text
home
ls
run template.ts
```

You should see `Hello Remote API!`. Edit the message in `home/template.ts`, save, and run `template.ts` again. The updated source should already be in the game.

Create scripts under `home/`. TypeScript files retain their `.ts` or `.tsx` extension in the game. See the [README](README.md) for imports, React, and script usage.

## Everyday use

Start `npm run watch`, connect the game, and edit locally. Run `npm run check` to catch errors; sync itself does not block invalid code. Press **Ctrl+C** to stop the watcher.

Local source takes precedence on every connection. In-game edits do not sync back. Local deletions propagate while the watcher is running; deletions made while it was stopped need manual cleanup in the game. Refreshed `NetscriptDefinitions.d.ts` is tracked, so review its changes when preparing commits.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| PowerShell rejects `npm.ps1` | Run the equivalent `npm.cmd` command |
| Connection fails | Start the watcher first; check hostname/port and local firewall settings |
| Port already in use | Stop the other sync process, or change `port` in `filesync.json` and the game settings |
| Script did not update | Reconnect to upload all source; confirm you edited a file under `home/` |
| Cannot find `@ns` | Confirm the root API definitions file exists and use `import type { NS } from "@ns"` |
| Import cannot be resolved in-game | Use relative source paths with extensions; TypeScript aliases are not runtime modules |
| Types disagree with your game | Connect to refresh definitions, then rerun checks; verify the game is current |
| Old `template.js` still exists | Run `template.ts`; remove old compiled files manually after verifying the new workflow |

Filesync binds network interfaces without authentication. Keep it on a trusted machine/network; the game should connect to the local host. For Remote API details, see the [official documentation](https://github.com/bitburner-official/bitburner-src/blob/stable/src/Documentation/doc/en/programming/remote_api.md).
