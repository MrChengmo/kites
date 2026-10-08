# Kites verification — 2026-10-04

## Passed

- TypeScript compilation and optimized Vite production build.
- Oxlint, Prettier, and Stylelint.
- **19 tests passed** (13 frontend contract tests and 6 service tests). They cover: Go wire casing and revision preservation; isolated runtime instances for groups; split UTF-8 NDJSON; stream errors; replay/stream deduplication and ordering; interleaved agent responses; tool results and approvals; transcript export; time zones, weekends and DST; durable SQLite state and occurrence claims; service authentication/origin rejection; streamed proxy requests; routine execution and interrupted-run handling.
- Built the actual Agentway daemon from the current runtime source and ran it with a new SQLite store.
- Chrome live checks: named agent creation, individual conversation, real Codex response, reload/history, save response, paused routine creation, manual routine run and result, two-agent group creation and replies.
- Mobile responsive layout checked at 390 × 844. Full-screen forms, chat view, chat list, routine view and bottom navigation were inspected in Chrome.
- Packaged `release/mac-arm64/Kites.app` and launched it. Native Electron UI connected to the existing Kites service and displayed the same profiles and conversations.
- iOS/Android Capacitor sync includes App, Keyboard, Filesystem and Share. iOS plist, privacy manifest and Xcode project pass `plutil -lint`.
- Production dependency audit returned zero reported vulnerabilities at the time of the check.

## Found and fixed during live checks

1. The local runtime rejects replay subscriptions with HTTP 501. Added incremental history polling for that deployment.
2. Agentway permits one active membership per agent instance. Added saved profiles with separate instances per conversation/run; verified a routine and group while the original chat remained open.
3. Live partial events are not all persisted in history. Reconciled to canonical history after a turn and removed completed transient deltas to prevent duplicate replies.
4. Group broadcast ingress is recorded once per target. Adjacent copies are displayed as one message, while repeated prompts to the same agent remain distinct.

## Not verified / unavailable

- No full Xcode, Java runtime or Android SDK is installed. No native iOS/Android compilation, simulator, physical-device run, signing, or store submission was performed.
- The macOS application is unsigned. Windows/Linux packaging is configured but not built on this Mac.
- Live provider testing used Codex. Other provider CLIs and MCP servers depend on host setup and were not exercised with external accounts.
- Approval rendering and correlation were tested with contract fixtures. No sensitive external action was triggered for a live approval test.
- Mobile file sharing, software-keyboard interaction and background/resume behavior need device verification.
- No claim of a production multi-tenant cloud service or distributed scheduler is made.

## Live test data

The isolated runtime contains Maya and Theo profiles, an individual chat, a group chat and a routine conversation. Kites has one saved response and one paused routine. The routine history retains one failed run from before the membership fix and one successful run after it. No recurring test routine is left enabled.
