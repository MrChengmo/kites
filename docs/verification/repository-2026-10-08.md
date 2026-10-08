# Repository verification — 8 October 2026

- React/component suites: 80 tests passed across 16 files.
- Node backend suites: 15 tests passed.
- TypeScript and production Vite build passed.
- CSS validation passed.
- Seven web entry/JavaScript/CSS files matched byte-for-byte between `dist`, the packaged Electron app, iOS assets, and Android assets.
- Latest shared features include bot/session grouping, workspace labels, image paste and attachment previews, expanded composer, and structured question cards.
- Desktop-width and mobile-width component/browser previews were checked. Physical iPhone/Android execution was not tested in this repository-preparation step.

Runtime data, provider credentials, uploads, generated applications, local screenshots, and reset archives remain outside Git. A missing historical recording was replaced with a synthetic protocol fixture; the tests no longer depend on local survey backups. Test workers are limited to two to avoid rendering timeouts under concurrent machine load.
