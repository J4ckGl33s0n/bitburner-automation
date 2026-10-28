# bitburner-automation roadmap and change record

Track proposed additions here and record completed changes below with their date, validation, and remaining limits. Planned items are priorities, not release commitments.

## Planned additions

Priorities below come from the 2026-10-27 coverage review. P0 closes validation gaps, P1 improves the existing unattended loop, P2 adds progression, and P3 covers optional systems when unlocked. These are incremental tasks, not a proposal for one manager per API. Unlock-dependent work can move forward when it becomes relevant to the current BitNode.

### P0 — Verify what already exists

- [ ] **Finish live validation:** measure current manager/worker RAM; observe at least five batches per hacking target, stock entries/exits and protected cash, darknet cache collection and cleanup, and a complete IPvGO opponent cycle. Save/reload and verify recovery. Existing mocks and conservative RAM checks do not establish live timing, profitability, or playing strength.
- [x] **Reconcile IPvGO documentation and evidence:** README usage and the search completion record now describe bounded tree search, preserve the historical tactical-policy record, and separate the 36/40 local benchmark result from pending real-AI results. `test/go-benchmark.mjs` is outside `npm run check`; rerun it explicitly after search-policy changes before claiming improved strength.

Live validation attempt (2026-10-27): blocked before selecting or inspecting Bitburner. The requested Computer Use Node runtime failed with `windows sandbox failed: helper_unknown_error: setup refresh had errors`, including after a kernel reset. The alternate UI connection also exited during initialization and failed again after reset. No live checks, manager restarts, or game UI actions were performed. P0 and live verification of the P1 additions remain pending until a working UI connection is available.

### P1 — Improve existing automation

- [x] **Retry skipped startup:** add a small periodic eligibility/RAM retry for managers skipped by `start.js`, including access gained from darknet rewards. Respect deliberate stops and preserved practice/special Go boards; retry transient failures with a delay and leave persistent failures visible. Keep hacking's handoff/reserve and existing manager settings. Do not repeatedly rerun the entire master or load every optional API into the supervisor.
- [x] **Buy missing infrastructure and unlocks:** extend the existing spending workflow with optional home RAM/core upgrades, Formulas.exe, DarkscapeNavigator.exe, and TIX/4S API purchases. Use current costs, prerequisites and a shared savings goal; retain the separate Singularity child and its actual RAM requirement. TIX and 4S API purchases use the [Stock API][bb-stock] directly and do not require Singularity; WSE/4S UI purchases are separate and unnecessary for this trader. [Home upgrades][bb-home] require Singularity access. Prioritize freeing manager RAM over speculative fleet growth.
- [x] **Support hash-producing Hacknet Servers:** detect hash mode before buying the first node; reuse reserve/budget checks, value production upgrades in hashes, and spend hashes before storage fills. Start with cash conversion, then an explicit selected target/reward using live hash costs; add cache only when needed. Keep these machines out of hacking workers unless the hash-production tradeoff is measured. The current money-node manager cannot manage this mode. See [Hacknet][bb-hacknet].
- [x] **Make spending reflect the current bottleneck:** compare additional usable worker RAM with Hacknet payback instead of always filling every server slot at 16 GB before upgrading. Stop new-node investment when it cannot reasonably repay before the planned reset. Extend `spending.js` for each new buyer so stocks, upgrades, and progression cannot spend another goal's reserved cash; no separate budgeting framework is needed.
- [x] **Measure before increasing hacking complexity:** log observed income/XP, idle RAM, preparation time, cancellations, and recovery frequency alongside ranking estimates. Prototype overlapping batches only if one-batch-per-target scheduling demonstrably leaves profitable capacity idle. Retain sequential fallback, ownership cleanup, and reload recovery; dedicated XP farming remains optional.
- [ ] **Extend darknet reach from observed blockers:** collect unsupported model IDs and add tested solvers for those actually encountered. Investigate a smaller discovery worker for servers that cannot fit the current explorer. Consider thread-aware authentication and mutation-driven wakeups after measuring delays. Keep session validation and cache risks; add phishing, stasis, or stock promotion only for a specific progression need. See [Darknet][bb-darknet].

P1 implementation status: startup retries, purchasing, hash support, investment comparison, and hacking instrumentation pass local checks. Live validation remains under P0. Darknet blocker/timing collection is implemented; further solvers, a smaller explorer, thread scaling, mutation wakeups, and overlapping hacking batches remain gated on collected evidence.

### P2 — Add faction and reset progression

- [ ] **Backdoors and faction goals:** use existing network paths for eligible faction-server backdoors, then selected invitations and reputation targets. Inspect faction enemies before joining; coordinate company work, training, travel, and crime only when needed for the selected goal. Use one owner for player actions and preserve manual work. Gate this workflow on BN4/SF4 and isolate its RAM cost. See [Singularity][bb-singularity].
- [ ] **Augmentation purchase planning:** list missing prerequisites, reputation and cash for a chosen augmentation set; account for queued purchases and changing prices. Reserve the next goal before infrastructure or stocks spend the funds. Start with a report, then optional purchases; donations need a live eligibility/benefit check. Grafting is a later alternative with its own access, travel, time, and player-action costs. See [Singularity][bb-singularity] and [Grafting][bb-grafting].
- [ ] **Use idle RAM for reputation:** add a small [share worker][bb-share] only while faction work is active and extra reputation is more useful than hacking income. Bound allocation and release capacity for managers and paid workers; diminishing returns do not justify assigning the whole fleet by default.
- [ ] **Controlled install/reset and restart:** add an explicit reset plan that pauses buyers, handles stock liquidation, buys the approved augmentation set, installs, and invokes the home startup callback. Rebuild state from the new run and preserve contract-disabled state deliberately. Test a fresh run with minimal home RAM. Keep augmentation resets and BitNode completion/next-node selection separate and explicitly enabled. See [installAugmentations][bb-install].

### P3 — Add unlocked systems independently

- [ ] **Gang manager:** when BN2/SF2 and a gang are available, begin with recruitment, training, task assignment, and wanted-penalty control. Add equipment under the shared reserve and ascension/install decisions using projected effects. Territory warfare needs conservative clash chances because members can die. Creation/faction choice stays explicit. See [Gang][bb-gang].
- [ ] **Sleeve manager:** when BN10/SF10 access is available, recover shock, synchronize, then assign goal-based tasks without conflicting faction assignments. Purchase sleeve augmentations only when eligible and affordable; sleeve purchases/memory upgrades have separate BN10 restrictions. See [Sleeve][bb-sleeve].
- [ ] **Corporation manager:** after corporation/API access is available, manage an existing corporation's cycle-based staffing, supply, warehouse capacity, sales, and reinvestment first. Keep corporate funds distinct from player cash; make creation, investment offers, going public, and share issuance explicit milestones. Use `nextUpdate()` instead of unrelated fixed sleeps. See [Corporation][bb-corporation].
- [ ] **Bladeburner manager:** after division/API access, choose actions using conservative success estimates, stamina, chaos, and available counts; buy skills and recover before risky actions. Coordinate with the player-action owner and sleeves; keep BlackOps explicitly enabled and validate progression separately. See [Bladeburner][bb-bladeburner].
- [ ] **Stanek charging:** after the Gift is accepted, charge the existing layout with a bounded share of idle RAM. Preserve placed fragments; layout replacement/search is a separate opt-in task, justified only by measured benefit. See [Stanek][bb-stanek].

## Automation coverage review — 2026-10-27

Baseline: the current working tree, including uncommitted stocks and IPvGO search work, compared with the official [Bitburner v3.0.1 release][bb-release] and its version-pinned API documentation. This describes code capability, not the current save's unlocks or enabled scripts. Priorities are recommendations based on the implementation; they are not requirements imposed by the game docs.

**Assessment:** the repository covers repeatable early income and several side systems well, but does not yet automate the faction → augmentation → reset progression loop. Expand that loop and validate current behavior before pursuing every exposed API.

| Area | Current implementation | Missing coverage or improvement |
| --- | --- | --- |
| Discovery and rooting | `network.js`, scanner and root launcher discover ordinary hosts, paths and usable runners; hacking refreshes access/capacity. | Faction backdoors and automatic connection/progression are absent. [Singularity][bb-singularity] |
| Hacking and Formulas | Preparation, timed HWGW batches, mixed-core allocation, money/XP ranking, optional Formulas and sequential fallback. | One batch per target; no measured pipeline benefit or dedicated XP mode. Live timing/reload validation remains pending. |
| Purchased infrastructure | `purchase-manager.js` buys 16 GB cloud servers then doubles the smallest; money-node Hacknet upgrades use payback estimates. | Home RAM/cores, hash servers, reset-horizon budgeting and cross-category return comparisons are absent. [Cloud][bb-cloud], [Hacknet][bb-hacknet], [home upgrades][bb-home] |
| Programs and stocks | Separate Singularity buyer purchases TOR/five port openers; `stock-manager.js` trades 4S longs with fees, exposure and cash protection. | Formulas/darknet/market unlock purchases are manual; no pre-4S model, shorts, or manipulation. Stocks take over manual longs; a purchase cap does not cap later portfolio value. [Stock][bb-stock] |
| Contracts | All 30 types in local v3.0.1 definitions have solvers and fixtures; ordinary-network scanning includes unrooted hosts; failures persistently disable a type. | No known solver-type gap at this baseline. Last-attempt submissions still risk losing a contract. Check the live catalog/dummy contracts when upgrading the game. [Coding contracts][bb-contracts] |
| Darknet | Five authentication models, recursive explorers, blocked-RAM recovery and local cache collection. | Unsupported puzzles and small-RAM hosts can block deeper discovery; no heartbleed-assisted solving, phishing, stasis, promotion, or story workflow. Contract discovery remains ordinary-network only; verify whether expanding it yields contracts before adding integration. [Darknet][bb-darknet] |
| IPvGO | Resumes normal games, searches with a tactical fallback, revalidates the position, and cycles six opponents on 5x5 boards. Local paired benchmark: 36/40 wins against the old policy. | No measured live search win/bonus rate, opponent/board-size optimization, or special progression; practice/special boards are intentionally preserved. User confirmed the original bot running, with frequent losses. [Go][bb-go] |
| Startup and recovery | `start.js` conditionally launches managers once, then exits into hacking; managers have individual recovery/stop behavior. | No later eligibility retry, ongoing supervision, unified status, or automatic source-reload restart. A stopped manager can remain absent indefinitely. |
| Player/faction progression | Singularity use is confined to TOR/program buying. | Work, companies, training, travel, crime, backdoors, faction reputation and augmentation planning are absent. BN4 or SF4 is required for the proposed Singularity workflow; SF4 level changes RAM costs. [Singularity][bb-singularity] |
| Resets and BitNodes | Managers reconstruct portions of runtime state after saved-game reloads. | A reload is not an augmentation reset: no purchase/install sequence, startup callback, or next-BitNode policy. [Augmentation installs][bb-install] |
| Gang and sleeves | No managers or API calls. | Entire management loops absent, gated by BN2/SF2 and BN10/SF10 respectively. [Gang][bb-gang], [Sleeve][bb-sleeve] |
| Corporation and Bladeburner | No managers or API calls. | Entire management loops absent; owning/unlocking a system and API access must be checked separately. [Corporation][bb-corporation], [Bladeburner][bb-bladeburner] |
| Stanek and grafting | No managers or API calls. | Charging/layout management and grafting are absent; only add them for an available progression goal. [Stanek][bb-stanek], [Grafting][bb-grafting] |
| Infiltration | No helper. | The documented API exposes locations, difficulty and rewards, not minigame actions. A recommendation helper is possible; full play automation is not covered by that API. [Infiltration][bb-infiltration] |

### General improvement recommendations

- Keep new APIs in optional scripts so fresh-reset hacking retains its small RAM footprint. Detect actual access and live costs; do not assume owning a subsystem makes its whole API usable.
- Extend existing logs with a compact status command showing missing unlocks, manager health, protected cash, idle RAM, and disabled solver types. Start with terminal output; a dashboard or generic plugin framework is unnecessary.
- Treat money, player actions, and worker RAM as shared resources when adding progression. Test contention, deliberate stops, stale policies, failed launches, access changes and reset boundaries; retain the existing ownership and persistence protections.
- Keep local API definitions tied to the tested game version and rerun the contract catalog and RAM checks after refresh. Record real game evidence separately from Netscript mocks and local search benchmarks.

Deferred deliberately: pre-4S forecasting, short trading, stock manipulation, Go cheats/special opponents, global Stanek layout optimization, infiltration UI automation, and destructive darknet story actions. Their absence is a coverage limit, not sufficient reason to implement them. Promote one only when its measured benefit or selected progression goal warrants the complexity.

Review validation: `npm.cmd run check` passed type checking, linting, and all 195 tests on the current tree. No live game/save inspection, Go strength benchmark, or profitability benchmark was performed for this review. Only roadmap documentation was changed; existing source edits and historical completion records were preserved.

[bb-release]: https://github.com/bitburner-official/bitburner-src/releases/tag/v3.0.1
[bb-singularity]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.singularity.md
[bb-home]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.singularity.upgradehomeram.md
[bb-install]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.singularity.installaugmentations.md
[bb-share]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.ns.share.md
[bb-cloud]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.cloud.md
[bb-hacknet]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.hacknet.md
[bb-stock]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.stock.md
[bb-contracts]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.codingcontract.md
[bb-darknet]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.darknet.md
[bb-go]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.go.md
[bb-gang]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.gang.md
[bb-sleeve]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.sleeve.md
[bb-corporation]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.corporation.md
[bb-bladeburner]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.bladeburner.md
[bb-stanek]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.stanek.md
[bb-grafting]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.grafting.md
[bb-infiltration]: https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/markdown/bitburner.infiltration.md

## Completed changes

### 2026-10-28 — v2.3.0 release

- [x] Release all 30 coding-contract solvers, timed hacking batches with automatic fleet allocation and optional spare-RAM XP, 4S stock trading, and bounded IPvGO tree search.
- [x] Release startup retries, infrastructure and unlock buyers, hash-producing Hacknet support, measured investment comparisons, hacking telemetry, darknet blocker diagnostics, and scanner connection paths.
- [x] Update package and lockfile metadata and the README release link.

Validation: `npm.cmd run check` passed type checking, linting, RAM-budget guards, and all 247 tests; `git diff --check` passed. Detailed validation and remaining limits for each change are recorded below.

Remaining limits: no new in-game checks or Go strength benchmark were performed for this release; P0 live validation remains pending. Stock trading can lose game money, contract submissions can consume their last attempt, and caches are consumed and reduce karma. After completing pending live checks, sync source, restart the purchase manager and its children together, restart hacking through `hack.js` and darknet to refresh remote workers, restart stocks and IPvGO, then rerun `start.js` to arm retries. No live managers were restarted for this release.

### 2026-10-28 — Fill large fleets and reduce unnecessary XP interruptions

- [x] Raise the automatic theft goal from 10% to 90%, retaining RAM/core/thread-cap fitting, fully sized restoration and one ordered batch per target. Ranking uses the same goal; positive manual target caps retain their previous 10% behavior.
- [x] Remove the single additional preparation target restriction. Share remaining RAM across parallel preparation/fallback phases, retaining priority for ongoing preparation and preserving active money jobs.
- [x] Fill spare RAM with grow XP on safe, fully prepared non-money targets, or weaken XP when growing is unsafe. Weaken can share managed money targets, so assigning every server to money work no longer disables the XP filler. Exclude externally controlled targets and preserve home reserves and hash-server exclusions.
- [x] Top up free RAM while XP workers are active, using unique internal worker arguments. Reclaim only XP workers on hosts short of RAM, plus conflicting grows on a target starting money work. Keep unrelated XP workers running and count preemptions per stopped worker.
- [x] Let purchase helpers and delayed manager starts request home RAM through the controller's PID port. Validate the live requester and amount, reserve space for five seconds, preempt only owned home XP, and retain existing bounded waits/retries. Restart purchasing and startup retries when activating this update.

Validation: `npm.cmd run check` passed type checking, linting, RAM-budget guards and all 247 tests. New regressions cover larger batch restoration/caps, 16 TB home plus 25 cloud hosts, parallel preparation, weaken filler sharing live money batches, immediate RAM-upgrade top-ups, host-specific reclamation, XP action caps, and validated/expiring home-RAM handoffs for remote controllers, delayed starts and buyers. Both previously reproduced underuse cases now leave less than 1.8 GB per runner unused in the uncapped fixture, plus the home reserve. Active money jobs and manual processes remain protected.

The existing 300-second deterministic comparison now measures 202,166.27 money/sec in both automatic modes versus 53,000 with the manual three-target baseline. Mean idle RAM in its 512 GB fixture falls from 29.81 GB without XP to 0.73 GB with XP. This smaller, crowded fleet earns only 0.10 additional XP/sec because frequent money phases preempt filler workers; occupancy alone does not establish XP efficiency. The large-fleet safety fixture separately verifies completed XP gains with repeated restored money batches. These are mocked scheduler checks, not live-game performance claims. Live validation remains pending; no game managers were restarted.

### 2026-10-28 — Automatic hacking allocation and optional spare-RAM XP

Initial implementation; the large-fleet changes above supersede its single-preparation and XP-wave restrictions. The following benchmark records its original behavior.

- [x] Make omitted/zero target counts automatic throughout `start.js`, `hack.js`, and the controller; retain positive manual caps and automatic thread sizing. Forward validated `[max-targets=0] [thread-cap=0] [idle-xp=0]` consistently.
- [x] Admit ready HWGW batches in rank order against remaining per-host capacity and cores. Keep one additional preparation/sequential target between phases, prioritize ongoing preparation, preserve active money jobs, and log changing allocations/waiting reasons.
- [x] Reuse grow/weaken workers for an opt-in XP farm on leftover RAM. Require exact-full money for security-neutral grows, consider rooted above-level targets, exclude selected money/external HGW targets, and reclaim owned XP workers for money jobs. Preserve reserves, distributed caps, cleanup and reload recovery.
- [x] Separate farm XP/RAM/reports/preemptions from financial measurements. Include the next waiting target in automatic money-RAM demand while counting reclaimable XP RAM as available. Document manual progression options and the logarithmic XP-to-level relationship.

Validation: `npm.cmd run check` passed type checking, linting, RAM-budget guards, and all 238 tests. Coverage includes automatic expansion/contraction, fragmented RAM, manual compatibility, preparation continuity, argument forwarding, XP ranking/preparation/reclamation, financial isolation, external ownership, and reload recovery.

Deterministic fixture comparison (300 simulated seconds per mode, 512 GB home, ten prepared money targets, one above-level XP target, fixed action durations):

| Mode | Completed money batches | Money/sec | Total XP/sec | Mean idle GB | Preparation target-seconds | Money cancellations | XP wave preemptions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Three-target baseline | 159 | 53,000 | 40.23 | 381.00 | 0 | 0 | 0 |
| Automatic targets | 530 | 176,666.67 | 134.09 | 113.59 | 0 | 0 | 0 |
| Automatic targets + idle XP | 530 | 176,666.67 | 185.93 | 27.19 | 0 | 0 | 48 |

Batch/money/XP totals cover all 300 seconds; mean idle RAM, preparation, cancellations and preemptions use the nine published 30-second windows before the simulation stops. These are scheduler regression results, not live-game throughput estimates. Live before/after measurements, actual RAM costs, timing and save/reload validation remain pending. No live managers have been restarted.

Live validation attempt (2026-10-28): the Computer Use runtime exited during initialization with `windows sandbox failed: helper_unknown_error: setup refresh had errors`; the alternate app connection also exited before returning UI state. No game inspection, source activation, manager restart, or live benchmark was possible.

### 2026-10-27 — P1 unattended-loop additions

- [x] Share startup eligibility/RAM checks, reserve a small retry script, persist pending starts without PIDs, and retry later access/files/RAM. Bound launch failures to three delayed retries, preserve practice/special boards, and leave managers alone after observing them running.
- [x] Enable infrastructure/unlock goals by default under the shared reserve: urgent manager/child RAM, port access, darknet, Formulas, and TIX/4S API. Keep Singularity isolated, use separate home/market children, and require quote/approval with fresh price/cash checks. Handle the SF5 multiplier gate with a pinned v3.0.1 market-cost fallback.
- [x] Support hash Servers before the first purchase, cash conversion and explicitly targeted money/security rewards, live costs, production estimates, overflow handling, and necessary cache upgrades. Retain hash-server exclusion from worker RAM.
- [x] Compare usable worker capacity/home cores against Hacknet payback when fresh measurements exist; retain the previous fallback otherwise. Add an optional persistent reset deadline applying to every production investment, including new nodes.
- [x] Collect actual owned-worker income/XP and 30-second RAM/preparation/cancellation/recovery summaries, publishing validated measurements to home. Retain one batch per target, sequential fallback, ownership cleanup, and reload recovery.
- [x] Persist validated, deduplicated darknet blockers and timing records for reproducible follow-up work. Preserve existing session checks, cache behavior, and explorer ownership.

Validation: `npm.cmd run check` passed type checking, linting, and all 220 tests; `git diff --check` passed. Added checks cover delayed access and RAM, retry ownership/reload/exhaustion, quote approvals and shared savings, optional API gates, reset deadlines, hash mode/spending/cache, measured investment selection, worker accounting, incomplete/remote metrics, and darknet diagnostic validation/persistence. Existing launcher/controller/worker RAM ceilings pass; new conservative ceilings are 8 GB for retries, 24 GB for purchasing, 20 GB for standalone Hacknet, 160 GB for the home child at SF4 level 1, and 16 GB for the market child. The existing program child remains within 80 GB.

Remaining limits: no live managers were restarted, no game/save state was changed, and P0 remains in progress. Real RAM, timing, profitability, hash overflow/bonus-time behavior, and save/reload validation remain pending. Expensive goal savings can pause other spending; small homes may need a manual upgrade before an optional child fits. With a reset deadline, unmeasured starter investments wait for Formulas or production evidence. Market multiplier fallbacks follow v3.0.1 and require review on game upgrades. Darknet diagnostics retain at most 512 distinct records. No speculative overlapping batches, new password solvers, smaller explorers, or progression systems were added.


### 2026-10-27 — Bounded IPvGO tree search

- [x] Replace normal move selection with asynchronous UCT Monte Carlo tree search, alternating both players' objectives, with seeded tactical rollouts and the original selector retained as baseline and fallback.
- [x] Model local captures, suicide, full positional repetition history, offline nodes, passes, and two-pass completion. Score both colors' stones and enclosed territory with live komi. Explore legal sacrifices and territory moves rather than hard-excluding them.
- [x] Limit thinking to 2,000 ms and 10,000 tree nodes, yield about every 10 ms including inside rollouts, cap rollouts at four times board area, and discard unfinished simulations. Unexpanded tree moves store coordinates rather than complete future states.
- [x] Revalidate opponent, turn, board, history, komi, previous move, and legal moves after thinking. Discard stale results without acting, preserving existing commands, opponent cycling, current-game recovery, startup, and RAM ceilings.
- [x] Add independent rule/scoring checks, tactical search regressions, and a standalone paired strength benchmark. Reconcile current documentation while preserving earlier completion and coverage-review records.

User evidence: on 2026-10-27, the user confirmed both stock and original IPvGO automation working in-game, and reported frequent IPvGO losses. This establishes baseline operation; it does not establish the stronger search bot's live win rate or measured RAM.

Validation: `npm.cmd run check` passed type checking, linting, and all 197 tests; `git diff --check` passed. Search rules match an independently implemented reference across seeded games and both colors. Added checks cover multi-group captures, immediate and older repetition cycles, komi and area scoring, deadline exhaustion and unfinished simulations, deterministic seeds, node limits, cancellation, cooperative yields, stale live positions, a poisoned snapback capture, and a throw-in sacrifice threatening a large chain. Existing lifecycle, startup, and the 24 GB Go / 8 GB master RAM ceilings pass.

Playing-strength benchmark: `node test/go-benchmark.mjs` completed 40 games from 20 seeded legal 5x5 openings, swapping search and tactical colors, using 128 completed simulations per search move. Search won **36/40 (90%)**, exceeding the 60% threshold; no game reached the 100-ply cutoff. The final run used 518 searches averaging 32 ms each and took 16.64 seconds overall. The independent reference arbitrates legality and scoring. This developer benchmark is deliberately outside the normal test command and does not measure performance against the game's six AIs.

Timing: local Node probes at the production budget on 5x5, 9x9, and 13x13 boards reached 2,000 ms, with observed maximum intervals between yield callbacks of 13, 11, and 12 ms respectively. These wall-clock measurements are hardware-dependent and do not measure in-game scheduling. Both the Computer Use Node helper and alternate UI helper failed during startup with sandbox setup errors, so live search RAM, two complete real-AI cycles, per-opponent results, and saved-reload validation could not run. No live managers were restarted.

Remaining limits: bounded simulations can miss long tactics and lose games or win streaks; the two-second budget makes games longer, and larger resumed boards receive fewer simulations. Restart only the Go manager after syncing. No neural engine, training, cheats, opponent-specific exploits, board-size changes, dependency additions, release changes, or unrelated stock-code changes.

### 2026-10-27 — IPvGO automation

- [x] Add a home-only, single-instance manager that finishes an existing normal AI game, then cycles Netburners, Slum Snakes, The Black Hand, Tetrads, Daedalus, and Illuminati on 5x5 boards.
- [x] Select deterministic tactical moves from the live legal mask, using local group, liberty, capture, rescue, connection, and territory analysis; pass when no useful legal move remains.
- [x] Preserve practice and special boards, wait for restored white turns, reconstruct progress after reload, and advance only after fresh state confirms game completion. No win/loss statistics or active played games are reset.
- [x] Add optional master startup after stocks, reusing active IPvGO and preserving the hacking handoff and 4 GB home reserve on missing files, RAM shortages, and launch failures.
- [x] Log scores and bonus progress, stop safely on API or board-data errors, retain fresh-reset operation without optional unlocks, and document usage and limits.

Validation: `npm.cmd run check` passed type checking, linting, and all 184 tests; `git diff --check` passed. New tests cover opening and coordinate ties, capture/group deduplication, atari rescue and threats, connections, shared liberties, suicide and self-atari, friendly territory, offline nodes, legality masks, input preservation, complete mocked opponent cycles, existing larger games, white turns without move history, reload recovery, passes, stale game-over replies, practice/special-board preservation, failures, duplicates, startup order, and exact RAM boundaries. RAM accounting includes Go and GoAnalysis, enforcing a 24 GB IPvGO ceiling and all existing ceilings. The Computer Use Node helper failed with a Windows sandbox setup error, and the alternate UI helper also failed during startup; live session inspection and in-game verification could not run. No live managers were restarted.

Remaining limits: one-move tactics can miss ladders and sacrifices and lose games or win streaks, especially against stronger opponents. Running the manager takes over a normal AI game; stop it before manual play. Untouched boards on black's turn may be replaced with 5x5 boards. In-game RAM, a full real-AI opponent cycle, and saved-reload behavior remain unverified; lifecycle checks use Netscript mocks. No search engine, cheats, special-opponent progression, configurable strategies, new dependencies, release changes, or unrelated refactors.

### 2026-10-27 — 4S stock automation and optional Formulas optimization

- [x] Add a home-only, single-instance stock manager for all long holdings, including manual positions, with live 4S forecasts, market-tick scheduling, fee/spread filtering, and a 10% purchase-allocation cap.
- [x] Leave shorts and API unlocks manual; count existing short collateral against allocation. Skip locked stock startup without interrupting hacking, and preserve holdings across manager stops and reloads.
- [x] Share live cash reserves and next-program savings through stock PID ports; block new buys during program checks, RAM waiting, or missing, invalid, or stale policies.
- [x] Use exact additive growth in Formula-based target ranking and complete single-runner preparation, with conservative distributed sizing and ordinary-analysis fallbacks after access loss or failed estimates.
- [x] Use current Hacknet Formula production estimates when available, retaining live costs, existing purchase limits, and measured-production fallbacks without Formulas.exe.
- [x] Preserve prior uncommitted hacking and contract work, existing commands, startup order, and RAM ceilings; document activation and restart requirements.

Validation: `npm.cmd run check` passed type checking, linting, and all 165 tests; `git diff --check` passed. Added coverage includes stock entry/exit thresholds, fee and spread rejection, allocation and reserve boundaries, existing holdings and shorts, failed trades, custom program savings, stale and paused policies, startup RAM boundaries, mocked reloads and API loss/reacquisition, exact growth from empty servers, mixed-core fragmentation, Formula failures, and Hacknet multipliers. RAM accounting now includes the stock API and Hacknet Formulas, with a 32 GB stock ceiling and all existing ceilings preserved. Computer Use's Node helper and the alternate UI runtime both failed during startup, so live session inspection and in-game checks could not run; no managers were restarted in-game.

Remaining limits: forecast trading can lose game money, and the fixed 30-tick drift estimate assumes the current forecast. The 10% limit applies to new purchases; price changes and other spending can leave existing exposure above it. Tiny longs whose proceeds cannot cover commission remain held. TIX and 4S API access must be obtained manually, then rerun the master. Restart active spending managers after syncing to enable policy publishing. Formulas.exe and stock access are checked at runtime and are not assumed permanent. Actual game RAM, trades, fresh-reset startup, and saved-reload checks remain pending; local tests use Netscript mocks. No pre-4S prediction, short trading, stock manipulation, automatic unlock purchases, dependencies, or release changes.

### 2026-10-13 — Server connection paths in hosts.txt

- [x] Add a shortest ordinary-network connection `path` to every scanner entry, omitting the starting home: `"joesguns > CSEC"`. Direct neighbours show their hostname; home shows `"home"`.
- [x] Collect paths during the existing breadth-first scan, preserving host order, report fields, one server snapshot per host, and existing discovery callers.
- [x] Document the path format and report refresh command; test cycles, shorter alternatives, and scan-order ties.

Validation: `npm run check` passed type checking, linting, and all 142 tests; `git diff --check` passed. On 2026-10-13, the user confirmed in-game verification completed with no issues observed.

Remaining limits: paths describe the ordinary network from home at scan time. Sync source and rerun `/scripts/scan-hosts.js` after network changes to regenerate `hosts.txt`. No automatic connection, extra route files, dependencies, or release changes.

### 2026-10-13 — Timed hacking batches and balanced target selection

- [x] Rank money-bearing targets with equal normalized money and hacking XP efficiency, including grow/weaken restoration costs and failed-hack XP; log the selected-target decision matrix.
- [x] Use prepared-server Formulas estimates when available, retain approximate ordinary analyses without Formulas, and detect newly acquired access during refresh.
- [x] Prepare targets to minimum security and 99.9% money, then run one timed hack–weaken–grow–weaken batch per target with 200 ms finish gaps and a one-second launch allowance.
- [x] Preflight complete batches against live RAM and runner cores, halve hack sizing until they fit, retain distributed per-wave caps and sequential fallback, and preserve remote-first allocation and the 4 GB home reserve.
- [x] Validate worker deadlines, roll back partial launches, cancel interrupted batches, remeasure after completion, and discard temporary worker deadlines on saved reloads.
- [x] Preserve launcher arguments, master startup order, other managers, and existing coding-contract changes; update usage and recovery guidance.

Validation: `npm.cmd run check` passed type checking, linting, and all 141 tests. New coverage includes balanced ranking with separate money/XP winners and restoration costs; Formulas snapshots, acquisition, ties and invalid estimates; five simulated batches on each of two targets with finish ordering and restoration; fragmented RAM, mixed cores, caps, scaling and input preservation; oversized single-thread theft; changing durations and invalid/missed deadlines; launch exceptions, rollback, worker interruption, drift and reload recovery. Existing discovery, startup, placement, cleanup and home-reserve checks pass. Conservative RAM ceilings remain 8 GB for the master/launcher and 16 GB for the controller; worker ceilings are now 1.75 GB for hack and 1.80 GB for grow/weaken. The Bitburner v3.0.1 session was available and source edits synced, but the user stopped Computer Use with Escape before restart or live checks. No hacking controller was restarted by this validation session; live RAM measurements, five observed batches per target, and saved-reload validation remain pending.

Remaining limits: one batch per target; no overlapping pipeline, dedicated XP farming, or configurable weights. Ranking uses standard one-core cycle estimates; ordinary analyses without Formulas use current security and relative XP. Empty-target growth remains conservative. One hack thread can exceed the 10% goal, and timer stalls, other workers, or player changes can disrupt restoration; the manager checks live target state before further hacking. Restart only the hacking controller to activate synced source and refresh remote copies. No release changes or unrelated roadmap features.

### 2026-10-13 — Complete coding-contract solver coverage

- [x] Add the remaining 14 solvers, covering all 30 types in the current game definitions, with registry coverage checked automatically against those definitions.
- [x] Solve shortest paths, graph coloring, parentheses and math expressions, both Hamming codes, three compression types, two ciphers, Square Root, prime counts, and maximal empty rectangles.
- [x] Preserve BigInt precision for Square Root and make all failure diagnostics BigInt-safe so rejected answers and exceptions still persist disabled types before further processing.
- [x] Derive the startup solver count from the registry and retain ordinary-network discovery, native answers, last-attempt submissions, and persistent recovery.
- [x] Update supported types and recovery documentation; retain earlier release and validation records.

Validation: `npm run check` passed type checking, linting, and all 131 tests. Coverage includes known answers and input preservation for all types; independent small-input checks for paths, graphs, expressions, prime counts and maximal rectangle areas; every single-bit Hamming corruption for small payloads plus wide payloads; minimum LZ encoding lengths and round trips; 200-digit Square Root rounding boundaries; and BigInt success, exceptions, rejection, persistence and continued processing. Existing startup and RAM checks pass with 8 GB and 32 GB ceilings for the master and contract manager. On Bitburner v3.0.1, the live catalog matched all 30 solvers and all 150 dummy submissions passed (five per type); measured RAM remained 17.35 GB for the manager and 5.60 GB for the master. Restarting only the contract manager solved seeded Square Root and LZ contracts plus three existing Caesar contracts. After a saved reload, all four automation managers resumed, and the contract manager solved freshly generated Square Root and LZ contracts on its normal refresh. Temporary validation scripts were removed. Disabled-type error paths were tested with mocks; no intentional failures were induced on live reward contracts.

Remaining limits: coverage follows Bitburner v3.0.1's 30 types; future unknown types are skipped. Discovery remains on the ordinary network. A wrong last-attempt submission can destroy a contract before its type is disabled; disabled entries require manual recovery after fixing and testing the solver. No dependencies, Formulas integration, discovery expansion, or release changes.

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
