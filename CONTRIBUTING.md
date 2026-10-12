# Contributing

Keep changes focused and preserve the native TypeScript sync workflow. Use an issue to describe a bug or proposed change, or submit a small pull request when the repository is available.

## Setup and layout

Install Node.js 24, then run `npm ci` from the project root. In Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

- `home/`: scripts and text files uploaded to the game's home server.
- `test/`: automated development tests; these are not uploaded.
- `NetscriptDefinitions.d.ts`: game API definitions, kept outside the upload folder.

Use relative runtime imports with explicit source extensions. Import API types with `import type { NS } from "@ns"`. React and ReactDOM are provided by the game; do not add runtime npm dependencies to game scripts.

## Validation

Run `npm run check` before submitting a change. This runs type checking, linting, and the automated `.test.mjs` tests in `test/`. Add a focused regression test for non-trivial fixes; documentation-only edits do not need new tests.

For changes to game scripts, run `npm run watch`, connect Bitburner's Remote API to `localhost:12525`, and check the script in-game. State what you tested and any game features or hardware you could not verify. Local source overwrites matching game files on connection, and local deletions propagate while the watcher runs.

The scanner is `home/scripts/scan-hosts.js`; run it in the game as `run /scripts/scan-hosts.js`. Game output such as `hosts.txt` is not copied back to your computer. The hacking behavior tests use Netscript mocks; also verify worker RAM, controller placement, and cleanup in-game when a session is available.

## Pull requests and licensing

Describe the problem, the resulting behavior, and how you checked the change. Keep generated output, `node_modules`, logs, and secrets out of commits. If your game refreshes API definitions, include that change only when intentional and explain the game version.

Original contributions are accepted under the [MIT license](LICENSE). Submit only material you have the right to contribute. Keep third-party terms and notices intact; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
