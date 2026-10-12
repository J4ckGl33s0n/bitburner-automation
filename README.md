# bitburner-automation

Automate hacking and manage money-producing Hacknet Nodes with scripts that adapt to available RAM and game progress. Develop JavaScript, TypeScript, and React scripts locally and sync source directly to Bitburner's home server. Supports the browser and Steam versions.

## Quick start

Install [Node.js 24](https://nodejs.org/en/download/) and open a terminal in the project folder containing `package.json`:

```sh
npm ci
npm run check
npm run watch
```

Leave the watcher running. In Bitburner, open **Options > Remote API**, set hostname to `localhost` and port to `12525`, then connect. In the game terminal, run:

```text
home
run /scripts/hack.js
```

Run launcher and manager scripts with one thread; worker threads are allocated automatically. To check source sync independently, run `template.ts`, which prints `Hello Remote API!`.

On Windows, use `npm.cmd` instead of `npm` if PowerShell blocks `npm.ps1`. See the [beginner guide](BeginnersGuide.md) for detailed setup.

## Available scripts

| Script | Purpose |
| --- | --- |
| `/scripts/hack.js` | Root available servers and start the hacking controller |
| `/scripts/hack-manager.js` | Coordinate hacking workers; normally started by the launcher |
| `/scripts/root-hosts.js` | Root servers independently, then run the scanner |
| `/scripts/scan-hosts.js` | Save network details, including RAM and cores, to `hosts.txt` in-game |
| `/scripts/hacknet-manager.js` | Purchase and upgrade money-producing Hacknet Nodes; use `--help` for settings |
| `template.ts` | Minimal source-sync example |

### Hacking

```text
run /scripts/hack.js [max-targets=3] [thread-cap=0]
```

Both arguments are optional. A thread cap of `0` enables automatic sizing; a positive cap limits each target's action phase across all workers. For example, `run /scripts/hack.js 5 0` allows five targets with automatic sizing.

The launcher places one controller on home when it fits while leaving 4 GB free, otherwise on a rooted remote server. Workers use remote capacity first, then home RAM above the same reserve. Hacking targets must meet the player's hacking level; rooting only requires sufficient open ports and NUKE.exe.

The controller checks jobs every second and refreshes discovery, owned port programs, target eligibility, and capacity every 30 seconds. It sizes work for available RAM and runner cores, waits when resources are unavailable, and finishes every worker in a target's action phase before starting the next. No Singularity or Formulas access is required. Hash-producing Hacknet Servers are excluded, including renamed servers.

The startup message identifies the controller's host and PID. Stopping it stops only workers it launched. Restart after source edits to refresh remote worker copies; RAM upgrades expand capacity automatically without moving the controller.

Target ranking is a heuristic. Grow sizing is conservative for empty targets, and one hack thread can exceed the 10% goal. The scheduler runs sequential action phases rather than timed batches.

### Hacknet

Hacknet spending is separate from hacking and must be started explicitly:

```text
run /scripts/hacknet-manager.js --help
run /scripts/hacknet-manager.js --reserve 100000 --budget 0.1 --payback 120 --nodes 20
```

These settings control the cash reserve, fraction of spare cash spent per purchase, maximum payback time in minutes, and node limit. The starter node is exempt from the payback filter. Hash-producing Hacknet Servers need a different manager.

## Development

The `home/` directory maps to the game's home server: `home/scripts/scan-hosts.js` becomes `/scripts/scan-hosts.js`. Automated tests live in `test/` and are not uploaded. API definitions and tooling configuration stay in the project root.

The game runs `.js`, `.jsx`, `.ts`, and `.tsx` source directly. Use relative imports with explicit source extensions; npm dependencies are development tools and are not available to game scripts. Import Netscript types through the type-only `@ns` alias:

```ts
import type { NS } from "@ns";
import { helperFunction } from "./lib/helpers.ts";
```

Keep declaration files outside `home/`. `NetscriptDefinitions.d.ts` is refreshed from the game on connection; review changes before committing.

The game provides React and ReactDOM globally. Save this example as `home/greeting.tsx` and run `greeting.tsx` in-game:

```tsx
import type { NS } from "@ns";

function Greeting({ name }: { name: string }) {
  return <span>Hello {name}</span>;
}

export function main(ns: NS): void {
  ns.tprintRaw(<Greeting name="Your name" />);
}
```

### Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install locked development dependencies |
| `npm run watch` | Sync source and refresh API definitions |
| `npm run typecheck` | Check types without emitting files |
| `npm run lint` | Check source and tooling without rewriting files |
| `npm test` | Test source sync, TSX typing, and hacking behavior |
| `npm run check` | Run all three checks |
| `npm run watch -- --dry` | Preview source sync without connecting |

## Sync behavior

Configure syncing in `filesync.json`. Defaults are source folder `home`, port `12525`, upload-all on connection, and deletion propagation.

- Sync is one-way. In-game edits and generated files such as `hosts.txt` are not copied back locally.
- Connecting uploads local source and overwrites matching game files. Sync does not block invalid code; run checks before executing changes.
- Deleting a local file while the watcher runs deletes its matching game file. Deletions made while the watcher is stopped are not reconciled later. Unrelated game files are preserved.
- Export your save and preserve any game scripts you need before syncing. Filesync listens without authentication; use a trusted machine and network, and connect locally.

## Project documentation

- [Roadmap and change record](ROADMAP.md): planned additions and completed work.
- [Beginner guide](BeginnersGuide.md): detailed installation and troubleshooting.
- [Contributing](CONTRIBUTING.md): development checks and contribution guidance.

Original contributions use the [MIT license](LICENSE). Third-party terms are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
