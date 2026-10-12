# bitburner-automation roadmap and change record

Track proposed additions here and record completed changes below with their date, validation, and remaining limits. Planned items are priorities, not release commitments.

## Planned additions

In priority order:

- [ ] **Coding contracts:** discover contracts and add tested solvers incrementally, leaving unsupported contracts untouched.
- [ ] **Timed hacking batches:** coordinate hack, grow, and weaken completion times to improve income once enough RAM is available.
- [ ] **Faction and reset automation:** add progression workflows after the required APIs are unlocked.

## Completed changes

### 2026-10-12 — Master start script

- [x] One `/scripts/start.js` command starts the purchase manager, then hands off to the existing hacking launcher and releases its RAM.
- [x] Reuse active purchasing settings, forward optional hacking arguments, and warn while continuing hacking if purchases cannot start.
- [x] Startup regression coverage for ordering, invalid inputs, duplicate starts, failures, and spawn termination.

Validation: `npm run check` passed all 53 tests, including the master launcher's 8 GB RAM budget. In-game startup remains unverified.

Remaining limits: startup requires enough home RAM; the master checks initial launch only and does not supervise managers after handoff.

### 2026-10-12 — Purchases with a shared cash reserve

- [x] Opt-in purchase coordinator with a cash floor, savings for the next port program, and alternating server/Hacknet investment opportunities.
- [x] Separate resident Singularity buyer for TOR and five port openers, with RAM waiting, reply validation, and owned-child cleanup.
- [x] Detect Singularity access before launching the buyer; continue server/Hacknet spending when programs require manual purchases.
- [x] Automatic 16 GB purchased-server fleet growth and in-place RAM upgrades up to live game limits.
- [x] Reused Hacknet payback selection and standalone settings, with mutual exclusion between spending managers.
- [x] Regression coverage for reserve boundaries, fresh balances, purchase failures, fleet limits, RAM isolation, and buyer lifecycle.

Validation: `npm run check` passed all 48 tests, including unavailable/disabled Source-File 4 and BitNode 4 access. No accessible game session was available; in-game purchases and actual script RAM remain unverified.

Remaining limits: automatic programs require Singularity and sufficient home RAM; program saving can pause investments. Without Singularity, only the configured cash reserve is protected; raise it to save for manual program purchases. Manual purchases and unrelated scripts are outside the shared reserve. Hacknet automation supports money-producing Nodes, not hash-producing Servers. TOR's $200,000 price is fixed because there is no price API.

### 2026-10-12 — Dynamic hacking core

- [x] Shared network discovery and rooting without a hacking-level restriction.
- [x] Automatic controller placement and worker sizing across home and rooted remote RAM, with a 4 GB home reserve.
- [x] Periodic discovery and target refresh, fair scheduling, coordinated action phases, and cleanup of owned workers.
- [x] Separate hack, grow, and weaken workers; exclusion of hash-producing Hacknet Servers, including renamed servers.
- [x] Scanner RAM and core details, with nonnegative remaining-port counts.
- [x] Regression coverage for scaling, failures, lifecycle handling, and script RAM budgets.

Validation: `npm run check` passed all 24 tests. In-game operation was confirmed by the user.

Remaining limits: ranking is a heuristic; grow sizing is conservative for empty targets; one hack thread can exceed the 10% goal. The scheduler uses sequential action phases. Hacknet spending remains opt-in and supports money-producing Nodes.

### 2026-10-12 — Documentation cleanup

- [x] General setup and usage guide, without one-off migration instructions.
- [x] Separate roadmap for planned additions and completed changes.

Validation: checked documentation links and the README's runnable TSX example.

### 2026-10-12 — Project rename

- [x] Renamed the project folder and npm package to `bitburner-automation`.
- [x] Updated lockfile metadata, documentation titles, and setup references.

Validation: `npm run check` passed all 24 tests from the renamed folder. In-game paths still map from `home/` and require no changes.
