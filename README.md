# bitburner-automation

Current release: [v2.3.0](https://github.com/J4ckGl33s0n/bitburner-automation/releases/tag/v2.3.0).

Automate hacking, coding contracts, 4S stock trading, and IPvGO, explore the darknet and collect caches, and coordinate infrastructure, unlock, purchased-server, and money/hash Hacknet purchases with a shared cash reserve. Develop JavaScript, TypeScript, and React scripts locally and sync source directly to Bitburner's home server. Supports the browser and Steam versions.

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

The master launcher starts purchasing with the default $100,000 reserve and 10% investment budget, starts darknet exploration if TOR and `DarkscapeNavigator.exe` are owned and RAM permits, starts contract solving when RAM permits, starts stocks if TIX and 4S API access are owned and RAM permits, starts IPvGO when RAM permits, then starts hacking. The purchase manager buys eligible access automatically; startup retries detect later access and RAM. Run launcher and manager scripts with one thread; hacking worker threads are allocated automatically. To check source sync independently, run `template.ts`, which prints `Hello Remote API!`.

On Windows, use `npm.cmd` instead of `npm` if PowerShell blocks `npm.ps1`. See the [beginner guide](BeginnersGuide.md) for detailed setup.

## Available scripts

| Script | Purpose |
| --- | --- |
| `/scripts/start.js` | Start purchasing, eligible darknet exploration, contracts, eligible stocks, and IPvGO, then hand off to hacking |
| `/scripts/hack.js` | Root available servers and start the hacking controller |
| `/scripts/hack-manager.js` | Coordinate hacking workers; normally started by the launcher |
| `/scripts/root-hosts.js` | Root servers independently, then run the scanner |
| `/scripts/scan-hosts.js` | Save network details, including connection paths, RAM and cores, to `hosts.txt` in-game |
| `/scripts/purchase-manager.js` | Coordinate infrastructure, unlock savings, worker capacity, and money/hash Hacknet spending |
| `/scripts/startup-retry.js` | Retry managers skipped by the master; leaves later stops alone |
| `/scripts/program-buyer.js` | Internal Singularity child for TOR and programs |
| `/scripts/home-buyer.js` | Internal Singularity child for home RAM and cores |
| `/scripts/market-buyer.js` | Internal stock API unlock buyer; no Singularity required |
| `/scripts/darknet-manager.js` | Explore supported darknet servers and collect cache rewards |
| `/scripts/darknet-worker.js` | Internal explorer deployed by the darknet manager |
| `/scripts/contract-manager.js` | Discover coding contracts and solve all 30 current types automatically |
| `/scripts/stock-manager.js` | Trade all longs using 4S forecasts, a 10% purchase cap, and protected cash |
| `/scripts/go-manager.js` | Resume normal IPvGO games, then cycle all six opponents on 5x5 boards |
| `/scripts/hacknet-manager.js` | Purchase/upgrade money Nodes or hash Servers and spend hashes; use `--help` for settings |
| `template.ts` | Minimal source-sync example |

Each `hosts.txt` entry includes a shortest connection `path` from home, such as `"joesguns > CSEC"`. The starting home is omitted; direct neighbours show their hostname and home shows `"home"`. Run `/scripts/scan-hosts.js` again after network changes to refresh the report.

### Master start

```text
run /scripts/start.js [max-targets=0] [thread-cap=0] [idle-xp=0]
```

Run on home with one thread. No arguments are needed for automatic money-target and worker-thread allocation. The master starts purchasing first, or reuses an active purchase manager with its existing settings. It then starts a small retry script when RAM permits, eligible darknet exploration, contracts, eligible stocks, and IPvGO, reusing active managers. It exits by spawning `hack.js` with all three hacking arguments. Each launch checks fresh RAM while protecting the hacking handoff and 4 GB home reserve. For custom spending settings, start purchasing separately before running the master.

Darknet needs TOR, `DarkscapeNavigator.exe`, and explorer source files. Stocks need TIX and 4S API access. Contracts and IPvGO need their respective helper files. Missing prerequisites or failed optional starts never prevent hacking. Practice and special Go boards remain intact and are excluded from retries; select a normal opponent and explicitly rerun the master or Go manager to enable play.

The retry script checks skipped managers every 30 seconds, including access gained through purchases or darknet rewards. Missing files/access/RAM remain eligible for later checks. Failed launches get three retries after 30, 60, and 120 seconds, then a terminal diagnostic suspends that entry. Repeated unchanged blockers are reported at most every five minutes. Once a manager is observed running, its entry is removed: subsequent deliberate stops and safety exits are left alone. Later failures remain visible in each manager's own logs.

Pending entries and failure counts live in `/data/startup-retry-state.txt`, keyed to the augmentation reset and without saved PIDs. Reloads preserve retry progress. Explicitly rerunning the master rearms absent managers. If the retry script cannot fit, hacking continues and the terminal explains how to restore retries. Stop the retry script to pause outstanding retries; this leaves running managers intact.

P0 live validation remains in progress. Capture its outstanding evidence before activating P1 changes. After that, stop the old purchase manager before restarting it and its changed children, restart hacking through `hack.js` to refresh remote workers, restart darknet to refresh explorers, then rerun `start.js` to arm retries. Restart the purchase manager and its children together: their internal quote/approval protocol changed. No live managers were restarted by this implementation.

### Hacking

```text
run /scripts/hack.js [max-targets=0] [thread-cap=0] [idle-xp=0]
```

All arguments are optional. A target count of `0` chooses targets automatically from usable resources; a positive value retains the previous capped scheduling behavior. A thread cap of `0` enables automatic sizing; a positive cap limits each target's action wave across all workers, including each of the four waves in a timed batch and the XP farm. Preparation and sequential fallback phases use the same cap. `idle-xp` accepts only `0` (disabled, the default) or `1` (enabled).

```text
run /scripts/start.js          // automatic targets and threads
run /scripts/start.js 0 0 1    // automatic allocation plus spare-RAM XP
run /scripts/start.js 3 100    // optional manual target/thread caps
```

Automatic mode considers ready money targets in ranked order and launches complete batches against fresh per-host RAM and core counts. It also prepares multiple targets or runs their sequential fallback phases in parallel, sharing the remaining RAM between waiting targets. Ongoing preparation takes priority over admitting new batches so it can progress. Running money jobs finish before ranking or resource changes replace them. New access and hosts are discovered on the existing 30-second refresh; released RAM and upgrades to known hosts are reconsidered every scheduling pass. Allocation logs show the mode, active money-target count, money/XP threads, and changing waiting reasons. This is adaptive allocation, not a guarantee of globally optimal profit.

The launcher places one controller on home when it fits while leaving 4 GB free, otherwise on a rooted remote server. Workers use remote capacity first, then home RAM above the same reserve. Hacking targets must meet the player's hacking level; rooting only requires sufficient open ports and NUKE.exe.

The controller checks jobs every 100 ms and refreshes discovery, owned port programs, target eligibility, and capacity every 30 seconds. Targets must first reach minimum security (within 0.000001) and at least 99.9% maximum money. With enough RAM, it launches one complete hack–weaken–grow–weaken batch per target, coordinating finishes 200 ms apart. The first finish includes a one-second launch allowance after the longest action duration. Automatic mode aims to steal up to 90%; positive manual target caps retain the previous 10% goal. Both modes halve the hack size until all four waves fit and size restoration for the actual planned theft. Ranking uses the matching theft goal. One hack thread can exceed the goal. Small or fragmented networks fall back to sequential phases and continue making progress.

Target ranking gives equal weight to estimated money and hacking XP per GB of batch RAM per second. Both estimates include restoration costs, and XP includes grow, weaken, and failed hacks. Each efficiency is normalized against the best eligible target; ties favor money efficiency, then XP efficiency, then hostname. The selected-target matrix logs the score, efficiencies, chance, duration, RAM, and estimation method. Estimates use a standard one-core cycle; actual worker allocation accounts for runner cores and prefers remote RAM. Active work finishes before ranking changes replace a target.

When `Formulas.exe` is on home, ranking evaluates copied servers at minimum security and maximum money. Without it, ordinary analyses use current security and XP is relative, omitting common player and BitNode multipliers. Acquiring Formulas is detected on the next refresh. Ranking remains an estimate rather than a guarantee of maximum income or XP. No Singularity or Formulas access is required. Hash-producing Hacknet Servers are excluded, including renamed servers.

The startup message identifies the controller's host and PID. Stopping it stops only workers it launched. Partial launch failures or unexpected early worker exits cancel the remaining owned batch workers. The controller waits for every worker, then rechecks money and security before further hacking; drift triggers preparation. Managed workers are temporary, so saved reloads discard obsolete deadlines and the restored controller prepares the live target state. Timer stalls, outside workers, and player changes can still disrupt a batch.

Stop the old hacking controller, then run `hack.js` or `start.js` after source sync to load these changes and refresh remote workers. An already-running controller keeps its existing arguments and code. RAM upgrades expand capacity automatically without moving the controller. Existing positive argument caps and other managers' settings are preserved; omitted target counts now select automatic mode. Workers can also run directly with a target and optional absolute finish timestamp: `run /scripts/hack-worker.js <target> [finish-at-ms]` (likewise grow/weaken). Target-only runs start immediately; invalid or unreachable deadlines skip the action. RAM ceilings are 8 GB for the launchers, 16 GB for the controller, 1.75 GB for hack workers, and 1.80 GB for grow/weaken workers. Live timing and reload checks for this change remain pending.

For the large-fleet update, also restart the purchase manager with its existing flags, then rerun `start.js` to refresh startup retries. Purchase helpers and delayed starts can now request free home RAM from the hacking controller. It validates the live requester, reclaims only its own home XP workers, and protects the requested space for five seconds. The requester polls for up to one second and launches only after rechecking actual RAM; otherwise its existing retry behavior continues. Other scripts and running money jobs are preserved. The temporary reservation expires automatically, so there is no permanent extra home-RAM allowance.

Every 30 seconds the controller logs actual owned-worker money/XP, allocated GB-seconds, average idle RAM, preparation target-seconds, completed/cancelled batches, and recovery counts beside its ranking estimates. Workers report their script accounting to the controller's PID port; missing or interrupted reports mark the window incomplete. The latest summary is saved to `/data/hacking-metrics.txt` and copied to home when the controller runs remotely. Buyers accept only complete, positive-income windows no older than 60 seconds from the live controller and current augmentation reset. These measurements are estimates for investment choices; scheduling remains one batch per target with sequential fallback.

With `idle-xp=1`, the same controller fills spare RAM with XP workers, including while other XP workers are still running. It ranks rooted foreign money servers by estimated grow XP per GB-second, including servers above the player's hacking level: grow/weaken do not require that level. Formulas uses prepared snapshots; the fallback uses live action times and relative XP. A grow farm must be outside selected money targets, at minimum security and **100%** maximum money. The controller prepares a candidate when necessary and fills spare capacity with weaken workers until a safe grow target is ready. Weaken filler may share a money target: it cannot remove money or increase security. This also keeps XP work available when every eligible server has a money job. Targets used by external HGW workers are excluded from both XP strategies. Explicit thread caps cover active XP workers per target/action, including preparation and top-ups.

Money launches reclaim XP workers only on hosts that need their RAM. XP grow workers on a target about to receive money work must also stop, because an extra grow could interfere with its batch. Other XP workers keep their progress. Reclamation stops whole worker processes, so it can release more RAM than the new job needs; the next XP top-up refills the surplus. Unfinished actions earn no XP. With unlimited threads and a safe XP target, each copied runner should retain less than one XP worker's RAM unused, plus the 4 GB home reserve, temporary requested startup/buyer headroom, and RAM occupied by other scripts. Disabled XP farming, explicit caps, unavailable targets/files, and failed launches can leave more capacity idle.

Farm measurements are separate: `farmXp`, `farmRamSeconds`, `farmReports`, `farmMissing`, and `farmPreemptions` (now individual stopped XP workers, rather than whole waves). The normal money/XP/RAM and home-core investment measurements exclude farm workers. Intentional XP preemptions do not mark financial windows incomplete. Automatic unmet money-RAM demand includes the next waiting ranked target's estimate, treating reclaimable XP RAM as available capacity. Stopping the controller cleans up its money and farm workers; temporary waves are rebuilt from live state after reload.

For a hacking-level wall, also consider hacking-skill augmentations: level growth is logarithmic in XP. Algorithms classes at ZB Institute in Volhaven can supplement scripts when player work is available; hash-producing Hacknet Servers can improve studying or reduce a chosen server's minimum security. Security reduction is already supported by the purchase manager; studying is currently manual, and `Improve Studying` is not an accepted automatic hash reward. These changes add no player-action automation or oversized hack XP batching. Mechanics were checked against [v3.0.1 hacking](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacking.ts), [grow/security handling](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/ServerHelpers.ts), and the [skill formula](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/skill.ts).

### Stock market

The purchase manager can buy TIX API and 4S Market Data TIX API access automatically, or you can unlock them manually. Startup retries detect access when armed. The master starts stocks after its other optional managers when source files and home RAM permit, retaining the hacking handoff and 4 GB reserve. Missing market access never prevents the other automation from running. To start stocks separately:

```text
home
run /scripts/stock-manager.js --reserve 100000
```

Run one instance on home with one thread. Formulas.exe and Singularity are not required. Without market access, a standalone manager waits and rechecks every 30 seconds. A running manager evaluates holdings immediately and on each market tick, including accelerated bonus-time ticks, and pauses if API access is lost.

The manager takes over **all long positions, including manual holdings**. It sells at forecasts of 50% or below and buys at 60% or above, preferring higher forecast edge times volatility, with symbol ordering for ties. It never trades shorts or purchases unlocks. Existing shorts count against allocation at their opening collateral value; longs count at current bid value. Sales release cash before new purchases and can realize losses. Positions whose entire bid value cannot cover the sale commission remain held until a sale has positive proceeds.

New order costs, including commission, must fit 10% of cash plus those holdings above protected cash, less existing exposure. Market gains, manual positions, or other spending can push holdings above this purchase cap; the manager stops buying rather than selling solely to rebalance. Whole-share orders respect remaining share capacity and live cash. The entry filter estimates 30 ticks of linear price drift using `(2 * forecast - 1) * volatility / 2` per tick and requires it to exceed the spread plus both commissions. This is a heuristic: forecasts change, and trades can lose game money.

While a purchase or standalone Hacknet manager runs, stocks use that manager's configured reserve. The purchase manager also protects savings for the next home/access/program/market goal and pauses stock buys during quotes, approvals, or buyer RAM waiting. A missing, invalid, or more than 10-second-old spending policy blocks buys; forecast-based exits remain available. With no spending manager, `--reserve` is the cash floor (default $100,000). Restart already-running spending managers after syncing this feature so they publish policies; otherwise stock buying waits safely. Manual purchases and unrelated scripts remain outside this protection.

Stopping stocks leaves positions intact. Reloads reconstruct holdings from game state, clear obsolete PID-port policy data, and wait for a current spending policy before buying. No ownership files or price history are saved. Restart stocks after source edits. The user confirmed stock automation working in-game on 2026-10-27. The local RAM ceiling is 32 GB; measured game RAM and controlled trading/reload validation remain pending.

### IPvGO

The master starts IPvGO when it fits. To run it separately:

```text
home
run /scripts/go-manager.js
```

Run on home with one thread and no arguments. No Formulas.exe, Singularity, stock access, or Source-File is required. Only one instance can run. The manager **takes over an existing normal AI game**, finishes it at its current board size, then starts 5x5 games in this repeating order: Netburners, Slum Snakes, The Black Hand, Tetrads, Daedalus, Illuminati. An untouched board on black's turn can be replaced with a 5x5 board against the same opponent. Practice (`No AI`) and special boards remain unchanged, and selecting one during play stops the manager.

The bot plays black using bounded Monte Carlo tree search (UCT), simulating both colors with captures, suicide checks, the full positional repetition history, passes, and two-pass game termination. Simulated outcomes use stones plus enclosed territory and the opponent's komi. Tactical features guide expansion and seeded rollouts rather than excluding sacrifices or moves in friendly territory from the tree. The most-visited root move wins, with estimated win rate and coordinates breaking ties. A pass that immediately wins the game is taken without further search. The game's current legal mask remains authoritative; the original tactical selector supplies a legal fallback if no simulation completes. No cheat moves or automatic difficulty changes are used.

Each move gets up to 2,000 ms and 10,000 tree nodes, yielding about every 10 ms of work, including during rollouts. Rollouts stop after two passes or four times the board area, using the current area score at that cutoff. Each turn starts a new tree. Searches log completed simulations, node count, and elapsed milliseconds. Local timing probes on 5x5, 9x9, and 13x13 boards reached the 2,000 ms deadline and yielded at intervals of at most 13 ms in that run; actual game scheduling and hardware can differ. Larger resumed boards fit the same limits and therefore receive fewer simulations.

Moves await the AI response; a restored white turn waits for the opponent without discarding the board. After thinking, the manager rechecks opponent, turn, komi, previous move, board, history, and legality; changed positions discard the result before another search. Fresh turn state determines when a game is complete, and only then does the cycle advance. Actions retain the 100 ms yield, including during bonus time. Completed games log the score, wins, losses, current streak, and bonus percentage. Unexpected API or board-data errors stop the manager with a diagnostic and leave the current board in place for recovery.

The reproducible local benchmark is separate from `npm run check`: run `node test/go-benchmark.mjs`. Across 20 seeded legal 5x5 openings with colors swapped (40 games), search won **36/40 (90%)** against the unchanged tactical policy at 128 completed simulations per thinking move, above the 60% acceptance threshold. All games ended before the 100-ply limit. That run used 518 searches averaging 32 ms each; it measures the fixed-simulation benchmark rather than the production two-second budget. These are results against the old bot, not the game's six AIs.

Stopping the manager leaves the game intact. Reloads reconstruct progress from live game state without saved files, and ongoing games are not abandoned to restart the cycle. Restart `/scripts/go-manager.js` after changing its source. Stop it before playing manually. The local RAM ceiling remains 24 GB, and the master remains within 8 GB. The user confirmed the original IPvGO bot working in-game on 2026-10-27, but reported frequent losses. Live search win rates, measured game RAM, two full real-AI cycles, and saved-reload validation remain pending because both UI helpers failed during startup. Search can still lose games and win streaks and takes longer per move.

### Coding contracts

The master starts the contract manager when it fits. To run it separately:

```text
home
run /scripts/contract-manager.js
```

Run on home with one thread and no arguments. No Singularity, Formulas, TOR, or root access is required. It scans the ordinary network, including home and unrooted servers, immediately and after each 30-second wait. It does not discover darknet servers. Discovery, file-listing, and contract-read errors are logged and retried on later passes. Unsupported `.cct` files remain untouched and are reported once per manager run in its Active Scripts logs. Solved contracts print their host, filename, type, and reward to the terminal.

All 30 contract types defined by Bitburner v3.0.1 are supported:

- Numeric and arrays: Find Largest Prime Factor; Subarray with Maximum Sum; Total Ways to Sum and II; Spiralize Matrix; Array Jumping Game and II; Merge Overlapping Intervals; Generate IP Addresses; Algorithmic Stock Trader I–IV.
- Paths and graphs: Minimum Path Sum in a Triangle; Unique Paths in a Grid I–II; Shortest Path in a Grid; Proper 2-Coloring of a Graph; Largest Rectangle in a Matrix.
- Expressions: Sanitize Parentheses in Expression; Find All Valid Math Expressions.
- Coding and compression: HammingCodes: Integer to Encoded Binary and Encoded Binary to Integer; Compression I: RLE Compression, II: LZ Decompression, and III: LZ Compression.
- Encryption and remaining numeric types: Encryption I: Caesar Cipher; Encryption II: Vigenère Cipher; Square Root; Total Number of Primes.

Solvers preserve their input data and submit native numbers, arrays, or strings. Square Root retains its approximately 200-digit BigInt input precision and returns the nearest integer as a decimal string; BigInt inputs are also safe to log on failures. LZ compression produces a shortest valid encoding, and prime counts include both endpoints. Future unknown types remain untouched. Local RAM checks enforce a conservative 32 GB manager budget; the master uses the game's actual script RAM requirement. The saved manager restarts automatically after a game reload and reads its persisted disabled types before scanning.

Validated on Bitburner v3.0.1 with five dummy contracts per type (150 successful submissions), followed by manager-only restart and fresh contract discovery after a saved game reload. That earlier validation measured 17.35 GB for the contract manager and 5.60 GB for the then-current master; P1 master RAM still needs live measurement.

**Supported contracts are submitted even on their last attempt. A wrong answer can destroy the contract.** A rejected answer disables the entire solver type before processing another contract and saves disabled names as a JSON array in `/data/contract-disabled-types.txt` on home. Solver exceptions and submission errors also disable that type; other enabled types continue. Failed input and answer, when available, are printed for reproduction. Disabled types stay disabled across manager restarts and game reloads. Malformed saved state or a failed persistence write stops the manager with a repair message.

To recover, fix and test the solver, stop the manager, open `/data/contract-disabled-types.txt` in the game's editor, remove that type's entry while retaining valid JSON (use `[]` if none remain), then restart the manager. Keep this generated state file in-game; do not add it under local `home/`, where source sync could overwrite it. Stopping and restarting alone does not clear disabled types, and expanding solver coverage does not re-enable previously disabled types. Restart after source edits to load new solvers. The manager has no child processes; stopping it leaves other automation running.

For in-game solver validation, stop the manager and use a scratch script to call `ns.codingcontract.createDummyContract(type)` for each supported type, read it with `getContract`, then submit `SOLVERS[contract.type](contract.data)` from `contracts.js`. Dummy contracts have no reward. Check that every submission succeeds before testing discovery with the manager. Do not clear a failed type until the corrected solver passes these checks.

### Darknet exploration

The purchase manager buys TOR and `DarkscapeNavigator.exe` when Singularity access permits, and startup retries detect them. You can also buy access manually and launch the coordinator directly:

```text
home
run /scripts/darknet-manager.js
```

Run on home with one thread and no arguments. No Singularity or Formulas access is required. The purchase manager enables darknet-program buying by default when Singularity is available; `--unlocks false` disables new unlock purchases. Without Singularity, save for manual programs using `--reserve`.

The coordinator deploys one explorer per server, beginning on `darkweb`. Explorers authenticate their neighbours using their own sessions, copy explorer source from home, and deploy further explorers when RAM permits. They reclaim blocked RAM only when needed to fit an explorer. Discovery and failed operations retry after each pass with a 30-second wait; authentication and RAM reclamation can make a pass longer. The coordinator checks explorer registrations every second and retries the entry point every 30 seconds. Darknet servers remain separate from ordinary hacking discovery and workers.

Supported password models are `ZeroLogon` (empty), `DeskMemo_3.1` (literal hint), `CloudBlare(tm)` (CAPTCHA digits), `110100100` (binary encoding), and `FreshInstall_1.0` (four default-password candidates). Decoded candidates must match the reported length and character format. Hints are never evaluated as code. Unsupported models and malformed hints are logged and skipped; authentication rejection advances to the next candidate, while timeouts wait for the next pass. Unsupported passwords and servers too small to fit an explorer can prevent reaching deeper servers.

Explorers open `.cache` files on the server holding them and log the reward and karma change in their own Active Scripts logs. **Opening a cache consumes it and reduces karma.** Other files are preserved. Cache rewards can include programs or stock access through the game's reward system; this does not purchase them. Authentication, insufficient RAM, or server movement can delay exploration.

Stopping the coordinator stops its registered explorers. Explorers also check that the coordinator is still running between requests and passes. Explorer processes are temporary and are rebuilt automatically by the saved coordinator after a game reload, with its new PID. Stop and restart the darknet manager after source edits to refresh remote copies. Local checks enforce conservative RAM budgets of 8 GB for the coordinator and 12 GB for an explorer; actual in-game requirements use the game's reported RAM.

Owned explorers also report unsupported/malformed password models, authentication blockers, insufficient RAM, and operation/pass timings. The coordinator deduplicates these in `/data/darknet-blockers.txt`, retaining hint/data, password constraints, free/required RAM, timings, counts, and first/last observations across reloads. At most 512 distinct records are retained. Malformed files are preserved with a diagnostic; diagnostic write failures leave exploration running. Keep generated `/data/` files in-game, outside local `home/`, and export useful examples before adding a solver.

This version does not automate advanced password puzzles, phishing, stock manipulation, backdoors, stasis links, migration actions, or story progression.

### Purchases with a shared reserve

The master enables purchasing by default. To choose settings, start one coordinator on home before the master:

```text
home
run /scripts/purchase-manager.js --help
run /scripts/purchase-manager.js --reserve 100000 --budget 0.1 --payback 120 --nodes 20
run /scripts/start.js
```

The savings order is RAM for eligible waiting managers/required buyer children, TOR and the five port openers, DarkscapeNavigator.exe, Formulas.exe, TIX API, then 4S API. Owned, unavailable, and disabled goals are skipped. Home/program buying requires BN4 or active SF4; market purchases do not require Singularity. TIX and 4S API access are bought directly without WSE or 4S UI purchases. Prices are checked live; 4S uses game constants and the BitNode multiplier. Without BN5/SF5, a pinned v3.0.1 multiplier fallback covers the fifteen known BitNodes, including repeated BN12. Refresh that fallback when upgrading the game.

New unlocks and home upgrades default on. Pass `--unlocks false` or `--home-upgrades false` to disable them; existing TOR/port-program buying is retained. Home RAM first addresses measured startup/child shortages. Additional home RAM and cores are investments only when fresh worker measurements show usable demand. The program, home-upgrade, and market buyers are separate children; only one is loaded at a time. They quote before approval, recheck price/cash immediately before buying, and never independently advance to another goal. Actual game-reported child RAM governs launch, including SF4 multipliers. If even the home-upgrade child cannot fit, free RAM or upgrade home manually; the coordinator pauses investments and reports the shortage.

`--reserve` is the cash floor. The full next goal is protected above it; goal purchases can use cash above the floor. `--budget` limits each production/storage investment to a fraction of the remaining surplus (10% by default). Stocks use the same protected amount, pausing buys while quotes or approvals are uncertain. Saving for an expensive unlock can therefore pause fleet growth and stock entries. Sales remain available; manual purchases and unrelated scripts are outside this protection.

With complete, fresh hacking measurements, the coordinator compares new 16 GB cloud servers, upgrades to existing servers, home RAM/cores, and Hacknet production by estimated payback, then lower cost. Worker value uses observed dollars per allocated GB-second, capped by unmet batch RAM demand; core value uses home grow/weaken RAM. Existing servers are upgraded in place. Without usable telemetry, the previous alternating server/Hacknet policy remains the fallback: fill 16 GB server slots before doubling the smallest. Estimates are approximate and do not establish profitability or justify overlapping batches.

`--reset-in 120` sets an optional reset countdown in minutes. Its absolute deadline is stored in `/data/spending-reset-deadline.txt` and reused across reloads/restarts with the same setting and augmentation reset. Change the setting or remove that file while buyers are stopped to start a new countdown; zero/unset disables the deadline. When configured, every production investment, including new nodes, must repay before the remaining deadline. Worker investment waits for useful telemetry; a first Hacknet node needs a Formulas estimate or existing production evidence. Without a reset deadline, `--payback` retains its existing upgrade limit and new-node exemption. No automatic reset is performed.

The purchase manager's Active Scripts log shows the current savings goal, its cost, the remaining cash needed while retaining the reserve, or that no goal is active. Status updates appear when the goal or price changes and otherwise every 30 seconds.

The coordinator attempts at most one goal purchase and one investment per cycle, then waits two seconds. Child crashes, timeouts, malformed replies, and unexpected errors stop it with a terminal diagnostic; failed purchase results retry later. Stopping the coordinator stops only its owned child and clears their PID ports. Use either this coordinator or standalone Hacknet, never both. Conservative local RAM ceilings are 24 GB for the coordinator, 80 GB for the program buyer, 160 GB for the home buyer at SF4 level 1, and 16 GB for the market buyer; live measurements remain pending.

Formulas.exe improves Hacknet money/hash production estimates; otherwise current measured production is used. Hacking retains ordinary-analysis fallbacks if Formulas access is lost or estimates fail. Formula ranking accounts for additive grow dollars, and preparation uses exact growth when a complete grow fits one runner; fragmented preparation keeps conservative sizing.

### Standalone Hacknet

```text
run /scripts/hacknet-manager.js --reserve 100000 --budget 0.1 --payback 120 --nodes 20
run /scripts/hacknet-manager.js --hash-reward "Increase Maximum Money" --hash-target n00dles
```

Both the coordinator and standalone manager detect money Nodes versus hash Servers before buying the first node. They share reserve/budget/node/payback/reset checks. Hash Servers stay excluded from hacking workers, including renamed servers. The standalone manager does not buy home upgrades, programs, or market access.

Hash mode defaults to `--hash-reward "Sell for Money"`. The other supported rewards are `"Increase Maximum Money"` and `"Reduce Minimum Security"`, requiring an explicit `--hash-target` rooted money server. Selected rewards use live hash costs and save hashes until affordable; overflow is converted to cash. Security reduction switches to cash once minimum security reaches 1. Upgrade gains use hashes/sec and their cash-conversion opportunity value. Cache is bought only when the selected reward or two seconds of production exceeds storage, choosing the cheapest one-level cache upgrade before further production investment. Failed hash spending does not spin indefinitely. Bonus time, slow quotes, and a full mailbox can still reduce effective production or measurement coverage; live performance needs validation.

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
