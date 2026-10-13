# bitburner-automation

Current release: [v2.2.0](https://github.com/J4ckGl33s0n/bitburner-automation/releases/tag/v2.2.0).

Automate hacking and coding contracts, explore the darknet and collect caches, and coordinate port-program, purchased-server, and money-producing Hacknet purchases with a shared cash reserve. Develop JavaScript, TypeScript, and React scripts locally and sync source directly to Bitburner's home server. Supports the browser and Steam versions.

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
run /scripts/start.js
```

The master launcher starts purchasing with the default $100,000 reserve and 10% investment budget, starts darknet exploration if TOR and `DarkscapeNavigator.exe` are owned and RAM permits, starts contract solving when RAM permits, then starts hacking. Buy darknet access and programs manually. Run launcher and manager scripts with one thread; hacking worker threads are allocated automatically. To check source sync independently, run `template.ts`, which prints `Hello Remote API!`.

On Windows, use `npm.cmd` instead of `npm` if PowerShell blocks `npm.ps1`. See the [beginner guide](BeginnersGuide.md) for detailed setup.

## Available scripts

| Script | Purpose |
| --- | --- |
| `/scripts/start.js` | Start purchasing, eligible darknet exploration, and contracts, then hand off to hacking |
| `/scripts/hack.js` | Root available servers and start the hacking controller |
| `/scripts/hack-manager.js` | Coordinate hacking workers; normally started by the launcher |
| `/scripts/root-hosts.js` | Root servers independently, then run the scanner |
| `/scripts/scan-hosts.js` | Save network details, including RAM and cores, to `hosts.txt` in-game |
| `/scripts/purchase-manager.js` | Coordinate TOR, port programs, server growth, and Hacknet spending; opt-in |
| `/scripts/program-buyer.js` | Internal Singularity child started by the purchase manager |
| `/scripts/darknet-manager.js` | Explore supported darknet servers and collect cache rewards |
| `/scripts/darknet-worker.js` | Internal explorer deployed by the darknet manager |
| `/scripts/contract-manager.js` | Discover coding contracts and solve 16 supported types automatically |
| `/scripts/hacknet-manager.js` | Purchase and upgrade money-producing Hacknet Nodes; use `--help` for settings |
| `template.ts` | Minimal source-sync example |

### Master start

```text
run /scripts/start.js [max-targets=3] [thread-cap=0]
```

Run on home with one thread. The master starts the purchase manager with its defaults, or reuses one already running with its existing settings. It gives purchasing a game cycle to initialise, then starts eligible darknet exploration and contract solving, or reuses their active managers. It exits by handing off to `hack.js`, forwarding the two optional hacking arguments. The hacking launcher handles controller placement and duplicate controllers.

Darknet startup requires TOR, `DarkscapeNavigator.exe`, all explorer source files, and enough free home RAM for its coordinator while retaining the hacking launcher handoff and 4 GB reserve. If prerequisites are missing or darknet cannot start, the master prints a reminder and continues hacking. Rerun the master or start the darknet manager separately after buying access or freeing RAM.

Contract startup requires `contract-manager.js`, `contracts.js`, and enough free home RAM while retaining the hacking handoff and 4 GB reserve. It is checked after darknet startup using the current free RAM. Missing files, insufficient RAM, or a failed contract launch produce a reminder and allow hacking to continue. Rerun the master or launch the contract manager separately to retry.

If purchases cannot start, the master prints a warning and continues to hacking so income can begin. Free home RAM or stop standalone Hacknet, then rerun the master to retry purchases. The master checks startup only; later manager failures appear in their own logs. With Singularity access and missing programs, leave enough home RAM for the purchase manager and its program buyer before starting. For custom purchase settings, start the purchase manager separately before running the master.

### Hacking

```text
run /scripts/hack.js [max-targets=3] [thread-cap=0]
```

Both arguments are optional. A thread cap of `0` enables automatic sizing; a positive cap limits each target's action phase across all workers. For example, `run /scripts/hack.js 5 0` allows five targets with automatic sizing.

The launcher places one controller on home when it fits while leaving 4 GB free, otherwise on a rooted remote server. Workers use remote capacity first, then home RAM above the same reserve. Hacking targets must meet the player's hacking level; rooting only requires sufficient open ports and NUKE.exe.

The controller checks jobs every second and refreshes discovery, owned port programs, target eligibility, and capacity every 30 seconds. It sizes work for available RAM and runner cores, waits when resources are unavailable, and finishes every worker in a target's action phase before starting the next. No Singularity or Formulas access is required. Hash-producing Hacknet Servers are excluded, including renamed servers.

The startup message identifies the controller's host and PID. Stopping it stops only workers it launched. Restart after source edits to refresh remote worker copies; RAM upgrades expand capacity automatically without moving the controller.

Target ranking is a heuristic. Grow sizing is conservative for empty targets, and one hack thread can exceed the 10% goal. The scheduler runs sequential action phases rather than timed batches.

### Coding contracts

The master starts the contract manager when it fits. To run it separately:

```text
home
run /scripts/contract-manager.js
```

Run on home with one thread and no arguments. No Singularity, Formulas, TOR, or root access is required. It scans the ordinary network, including home and unrooted servers, immediately and after each 30-second wait. It does not discover darknet servers. Discovery, file-listing, and contract-read errors are logged and retried on later passes. Unsupported `.cct` files remain untouched and are reported once per manager run in its Active Scripts logs. Solved contracts print their host, filename, type, and reward to the terminal.

The 16 supported types are Find Largest Prime Factor; Subarray with Maximum Sum; Total Ways to Sum and II; Spiralize Matrix; Array Jumping Game and II; Merge Overlapping Intervals; Generate IP Addresses; Algorithmic Stock Trader I–IV; Minimum Path Sum in a Triangle; and Unique Paths in a Grid I–II. Solvers submit native numbers and arrays and preserve their input data. Local RAM checks enforce a conservative 32 GB manager budget; the master uses the game's actual script RAM requirement. Measured on Bitburner v3.0.1: 17.35 GB for the manager and 5.60 GB for the master. The saved manager restarts automatically after a game reload and reads its persisted disabled types before scanning.

**Supported contracts are submitted even on their last attempt. A wrong answer can destroy the contract.** A rejected answer disables the entire solver type before processing another contract and saves disabled names as a JSON array in `/data/contract-disabled-types.txt` on home. Solver exceptions and submission errors also disable that type; other enabled types continue. Failed input and answer, when available, are printed for reproduction. Disabled types stay disabled across manager restarts and game reloads. Malformed saved state or a failed persistence write stops the manager with a repair message.

To recover, fix and test the solver, stop the manager, open `/data/contract-disabled-types.txt` in the game's editor, remove that type's entry while retaining valid JSON (use `[]` if none remain), then restart the manager. Keep this generated state file in-game; do not add it under local `home/`, where source sync could overwrite it. Stopping and restarting alone does not clear disabled types. Restart after source edits to load new solvers. The manager has no child processes; stopping it leaves other automation running.

For in-game solver validation, stop the manager and use a scratch script to call `ns.codingcontract.createDummyContract(type)` for each supported type, read it with `getContract`, then submit `SOLVERS[contract.type](contract.data)` from `contracts.js`. Dummy contracts have no reward. Check that every submission succeeds before testing discovery with the manager. Do not clear a failed type until the corrected solver passes these checks.

### Darknet exploration

Buy TOR and `DarkscapeNavigator.exe` manually, then rerun the master or launch the coordinator directly:

```text
home
run /scripts/darknet-manager.js
```

Run on home with one thread and no arguments. No Singularity or Formulas access is required. The existing TOR/port-program buyer keeps its normal behavior; no buyer purchases darknet access or programs, and no extra money is reserved for them. Raise the purchase manager's `--reserve` when saving for a manual purchase.

The coordinator deploys one explorer per server, beginning on `darkweb`. Explorers authenticate their neighbours using their own sessions, copy explorer source from home, and deploy further explorers when RAM permits. They reclaim blocked RAM only when needed to fit an explorer. Discovery and failed operations retry after each pass with a 30-second wait; authentication and RAM reclamation can make a pass longer. The coordinator checks explorer registrations every second and retries the entry point every 30 seconds. Darknet servers remain separate from ordinary hacking discovery and workers.

Supported password models are `ZeroLogon` (empty), `DeskMemo_3.1` (literal hint), `CloudBlare(tm)` (CAPTCHA digits), `110100100` (binary encoding), and `FreshInstall_1.0` (four default-password candidates). Decoded candidates must match the reported length and character format. Hints are never evaluated as code. Unsupported models and malformed hints are logged and skipped; authentication rejection advances to the next candidate, while timeouts wait for the next pass. Unsupported passwords and servers too small to fit an explorer can prevent reaching deeper servers.

Explorers open `.cache` files on the server holding them and log the reward and karma change in their own Active Scripts logs. **Opening a cache consumes it and reduces karma.** Other files are preserved. Cache rewards can include programs or stock access through the game's reward system; this does not purchase them. Authentication, insufficient RAM, or server movement can delay exploration.

Stopping the coordinator stops its registered explorers. Explorers also check that the coordinator is still running between requests and passes. Explorer processes are temporary and are rebuilt automatically by the saved coordinator after a game reload, with its new PID. Stop and restart the darknet manager after source edits to refresh remote copies. Local checks enforce conservative RAM budgets of 8 GB for the coordinator and 12 GB for an explorer; actual in-game requirements use the game's reported RAM.

This version does not automate advanced password puzzles, phishing, stock manipulation, backdoors, stasis links, migration actions, or story progression.

### Purchases with a shared reserve

Purchases are opt-in. Run the coordinator on home with one thread, before starting hacking so its program buyer can claim RAM:

```text
home
run /scripts/purchase-manager.js --help
run /scripts/purchase-manager.js --reserve 100000 --budget 0.1 --payback 120 --nodes 20
run /scripts/hack.js
```

The coordinator checks Singularity access before starting its program buyer: BitNode 4 or an active Source-File 4 enables automatic purchases. Without access, it logs a reminder to buy TOR and port programs manually and continues server/Hacknet spending with the configured cash reserve. It does not launch the child or reserve money for missing programs in this mode; raise `--reserve` when saving for a manual purchase.

With Singularity access, the coordinator buys TOR, then missing BruteSSH, FTPCrack, relaySMTP, HTTPWorm, and SQLInject programs. Their separate child stays loaded until all five programs are owned, then exits and releases RAM. When programs are missing and access is available, start hacking after the buyer appears in Active Scripts. Leave enough free home RAM for both purchasing processes; the child uses the game's reported script RAM, including the Source-File 4 multiplier. If it cannot start, investments pause and the coordinator logs how much free RAM it needs. Free home RAM and it retries automatically. When all five programs are already owned, no Singularity child is needed.

`--reserve` is the cash floor. Automatic program purchases may spend all cash above it. When automatic programs are enabled, the next missing program's full cost is also protected before investing; `--budget` limits each investment to a fraction of unreserved cash. The default is 10%. Every cycle checks programs when enabled, then attempts at most one server or Hacknet investment, alternating which category gets first opportunity and falling back if it cannot buy. Cycles wait two seconds after processing. Failed purchases retry on later opportunities; buyer crashes, invalid replies, and unexpected Singularity errors stop the coordinator safely.

Server automation fills the game's available slots with 16 GB `pserv-N` servers, then doubles the smallest servers up to the live RAM limit. Existing purchased servers are upgraded in place, preserving scripts and processes. The hacking controller discovers new programs and server capacity at its next normal refresh, within 30 seconds.

`--payback` limits the repayment time in minutes for Hacknet level, RAM, and core upgrades; every new-node purchase is exempt. New nodes still respect the reserve, investment budget, and `--nodes` count cap, and compete with eligible upgrades by income gained per dollar. Later nodes can take longer to repay than the limit or fail to repay before your next reset. Hash-producing Hacknet Servers are skipped while program and purchased-server automation continues.

Run either the purchase coordinator or standalone Hacknet manager; both reject simultaneous or duplicate buyers. Stopping the coordinator stops only its program child and clears their PID-numbered communication ports. Restart after source edits. The reserve applies to these buyers; manual purchases and unrelated scripts can still spend it. Program saving can pause investments until enough income arrives.

### Standalone Hacknet

Hacknet spending is separate from hacking and must be started explicitly:

```text
run /scripts/hacknet-manager.js --help
run /scripts/hacknet-manager.js --reserve 100000 --budget 0.1 --payback 120 --nodes 20
```

These settings control the cash reserve, fraction of spare cash spent per purchase, maximum upgrade payback time in minutes, and node limit. Every new-node purchase is exempt from the payback filter, while still respecting the reserve, budget, and node cap and competing with eligible upgrades by income gained per dollar. Hash-producing Hacknet Servers need a different manager. Do not run this alongside the purchase coordinator.

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
