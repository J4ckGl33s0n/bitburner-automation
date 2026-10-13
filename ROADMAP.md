# bitburner-automation roadmap and change record

Track proposed additions here and record completed changes below with their date, validation, and remaining limits. Planned items are priorities, not release commitments.

## Planned additions

In priority order:

- [ ] **Coding contracts:** extend the 16 core solvers with tested support for remaining types, leaving unsupported contracts untouched.
- [ ] **Timed hacking batches:** coordinate hack, grow, and weaken completion times to improve income once enough RAM is available.
- [ ] **Faction and reset automation:** add progression workflows after the required APIs are unlocked.

## Completed changes

### 2026-10-13 — v2.2.0 release

- [x] Release coding contract discovery and 16 core solvers, darknet exploration and cache collection, and the Hacknet new-node payback exemption.
- [x] Update package and lockfile metadata and link the current release from the README.

Validation: `npm run check` passed type checking, linting, and all 104 tests; `git diff --check` passed. Detailed validation and remaining limits for each change are recorded below.

Remaining limits: no new in-game checks were performed for this release. Existing pending darknet and Hacknet checks remain pending. Contract submissions can consume their last attempt; caches are consumed and reduce karma. Sync source and restart running managers to load the release.

### 2026-10-13 — Coding contract discovery and core solvers

- [x] Home manager scans the ordinary network immediately and every 30 seconds, including home and unrooted hosts, and leaves unsupported contracts untouched.
- [x] Sixteen pure, tested solvers cover prime factors, maximum subarrays, both sum problems, spiral matrices, both jumping games, interval merging, IP addresses, four stock traders, triangle minimum paths, and both grid path counts.
- [x] Native submissions include the last attempt; rejected answers and solver/submission exceptions disable the type, persisting protection across restarts and reloads.
- [x] Master starts contracts after darknet when RAM permits, reuses active managers, and preserves the hacking handoff and 4 GB reserve on launch failures.
- [x] Document standalone usage, supported types, rewards, attempt risks, persistent recovery, and dummy-contract validation.

Validation: `npm run check` passed all 104 tests, including known answers and input preservation for every solver, exhaustive small jumping and stock inputs and obstacle grids, discovery retries, last attempts, unsupported types, persistent failure protection, malformed state and failed writes, master launch failures, and fresh RAM boundaries. Conservative RAM budgets remain 8 GB for the master and 32 GB for the contract manager. On Bitburner v3.0.1, all 80 dummy contracts passed (five per supported type); actual RAM was 17.35 GB for the manager and 5.60 GB for the master. The master started the manager without interrupting existing hacking, and the manager solved seeded contracts on home and unrooted zb-institute plus eight existing reward contracts. After saving and reloading the game, the manager restarted with its new PID. Disabled-type persistence and error paths are covered by mocks; no intentional live submission failures were induced.

Remaining limits: 16 contract types only; darknet discovery is unchanged. A wrong last-attempt submission can destroy a contract before its type is disabled. Disabled types must be manually cleared after fixing and testing the solver. Keep the generated disabled-type file in-game and restart the manager after source edits; retry startup manually if files or RAM were unavailable.

### 2026-10-13 — Darknet exploration and cache collection

- [x] Home coordinator and temporary explorers authenticate adjacent servers with script-specific sessions, deploy recursively, and collect caches locally.
- [x] Solve empty passwords, literal hints, CAPTCHA digits, binary encoding, and four default-password candidates; validate length and character format and report unsupported models.
- [x] Retry discovery and failed operations, reclaim blocked RAM when needed, validate explorer registrations, and stop only owned explorers.
- [x] Optional master startup preserves the hacking handoff and home reserve; darknet purchases remain manual and existing purchasing behavior is preserved.
- [x] Document usage, reward effects, supported models, RAM budgets, restart behavior, and limitations.

Validation: `npm run check` passed all 72 tests, including script-specific sessions, discovery cycles, candidate rejection and timeouts, copy/launch failures, migration and RAM races, local rewards, registration validation, shutdown ownership, and rebuilding temporary explorers after reload. Conservative RAM budgets remain 8 GB for the master and darknet coordinator and 12 GB for each explorer. In-game standalone startup, deployment across multiple darknet servers, and explorer RAM of 8.40 GB were confirmed on Bitburner v3.0.1. Live cache rewards, master integration, shutdown, coordinator RAM, and reload checks remain pending; their behavior is covered by mocks and RAM checks.

Remaining limits: unsupported models and servers too small to fit an explorer can block deeper exploration. Authentication and RAM reclamation lengthen the 30-second refresh passes. Opening caches consumes them and reduces karma; rewards may grant programs or stock access. No advanced puzzles, phishing, stock manipulation, backdoors, stasis links, migration actions, or story automation. Sync source and restart the darknet manager after edits; rerun the master or standalone manager if startup skipped missing prerequisites or RAM.

### 2026-10-13 — Hacknet new-node payback exemption

- [x] Exempt every new Hacknet Node from the payback cutoff in both spending managers; retain the cutoff for level, RAM, and core upgrades.
- [x] Preserve reserve and program savings, investment budget, fresh balance checks, node caps, and income-per-dollar ranking against eligible upgrades.
- [x] Clarify CLI help, waiting messages, and README usage without changing settings or defaults.

Validation: `npm run check` passed all 56 tests. Regression coverage reproduces five level-84, 2 GB, one-core nodes earning $138.435/sec each: the roughly $20,414 next node remains eligible at a 120-minute upgrade payback limit. Coverage also verifies invalid prices and production, protected cash, fresh budgets, purchase failures, and better eligible upgrades. In-game confirmation of this change remains pending; earlier in-game and reload results are recorded below.

Remaining limits: new nodes may take longer than the upgrade payback limit to repay or fail to repay before a reset. Future upgrade costs and income are not planned ahead. Sync source and restart the active purchase or standalone Hacknet manager to load this change.

### 2026-10-12 — Master start script

- [x] One `/scripts/start.js` command starts the purchase manager, then hands off to the existing hacking launcher and releases its RAM.
- [x] Reuse active purchasing settings, forward optional hacking arguments, and warn while continuing hacking if purchases cannot start.
- [x] Startup regression coverage for ordering, invalid inputs, duplicate starts, failures, and spawn termination.

Validation: `npm run check` passed all 53 tests, including the master launcher's 8 GB RAM budget. On 2026-10-13, the user confirmed in-game tests passed with no issues observed and scripts continued functioning as intended after a game reload.

Remaining limits: startup requires enough home RAM; the master checks initial launch only and does not supervise managers after handoff.

### 2026-10-12 — Purchases with a shared cash reserve

- [x] Opt-in purchase coordinator with a cash floor, savings for the next port program, and alternating server/Hacknet investment opportunities.
- [x] Separate resident Singularity buyer for TOR and five port openers, with RAM waiting, reply validation, and owned-child cleanup.
- [x] Detect Singularity access before launching the buyer; continue server/Hacknet spending when programs require manual purchases.
- [x] Automatic 16 GB purchased-server fleet growth and in-place RAM upgrades up to live game limits.
- [x] Reused Hacknet payback selection and standalone settings, with mutual exclusion between spending managers.
- [x] Regression coverage for reserve boundaries, fresh balances, purchase failures, fleet limits, RAM isolation, and buyer lifecycle.

Validation: `npm run check` passed all 48 tests, including unavailable/disabled Source-File 4 and BitNode 4 access. On 2026-10-13, the user confirmed in-game operation and successful operation after a game reload, with no issues observed. Actual per-script RAM measurements were not reported.

Remaining limits: automatic programs require Singularity and sufficient home RAM; program saving can pause investments. Without Singularity, only the configured cash reserve is protected; raise it to save for manual program purchases. Manual purchases and unrelated scripts are outside the shared reserve. Hacknet automation supports money-producing Nodes, not hash-producing Servers. TOR's $200,000 price is fixed because there is no price API.

### 2026-10-12 — Dynamic hacking core

- [x] Shared network discovery and rooting without a hacking-level restriction.
- [x] Automatic controller placement and worker sizing across home and rooted remote RAM, with a 4 GB home reserve.
- [x] Periodic discovery and target refresh, fair scheduling, coordinated action phases, and cleanup of owned workers.
- [x] Separate hack, grow, and weaken workers; exclusion of hash-producing Hacknet Servers, including renamed servers.
- [x] Scanner RAM and core details, with nonnegative remaining-port counts.
- [x] Regression coverage for scaling, failures, lifecycle handling, and script RAM budgets.

Validation: `npm run check` passed all 24 tests. In-game operation was confirmed by the user, including successful operation after a game reload on 2026-10-13, with no issues observed.

Remaining limits: ranking is a heuristic; grow sizing is conservative for empty targets; one hack thread can exceed the 10% goal. The scheduler uses sequential action phases. Hacknet spending remains opt-in and supports money-producing Nodes.

### 2026-10-12 — Documentation cleanup

- [x] General setup and usage guide, without one-off migration instructions.
- [x] Separate roadmap for planned additions and completed changes.

Validation: checked documentation links and the README's runnable TSX example.

### 2026-10-12 — Project rename

- [x] Renamed the project folder and npm package to `bitburner-automation`.
- [x] Updated lockfile metadata, documentation titles, and setup references.

Validation: `npm run check` passed all 24 tests from the renamed folder. In-game paths still map from `home/` and require no changes.
