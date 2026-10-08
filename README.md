# Kites

A personal bot workspace powered by the Agentway runtime. One React UI serves the web, Electron desktop app, and Capacitor iOS/Android apps.

## Requirements

- Node.js 22.22 or newer (the tested version is in `.nvmrc`).
- A running Agentway daemon, or its source plus Go to build a local binary.
- Provider CLIs and their existing authentication for the bots you use.
- Xcode for iOS builds; Android Studio and a compatible JDK for Android builds.

## Run locally

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:4317. Kites connects to Agentway at http://127.0.0.1:8080 by default. Start your daemon separately, or build and run one:

```sh
AGENTWAY_SOURCE=/absolute/path/to/agentway/runtime npm run runtime:build
npm run runtime:start
```

`runtime:start` uses `data/runtime` and creates the local store when required. `data/providers.json` is optional and supplies provider environment variables. Copy `config/providers.example.json` there and replace the example paths when needed. Existing environment variables override that file.

For development, `npm run dev` starts the backend and Vite at http://127.0.0.1:5174. Stop an existing backend on port 4317 before starting this command.

## Desktop and mobile

```sh
npm run desktop       # build and open Electron
npm run desktop:pack  # create a local unpacked desktop app in release/
npm run mobile:sync   # build and sync assets to iOS and Android
npm run mobile:ios    # open the Xcode project
npm run mobile:android
```

The native shells load the same compiled React app. Bot/session hierarchy, clipboard image input, question cards, workspace controls, and chat actions are shared. Desktop also has native window/menu behavior; mobile has native keyboard and language integration. Mobile must connect to a reachable HTTPS Kites service through its connection settings; an iPhone cannot reach a Mac service using `127.0.0.1`.

Desktop packaging includes `bin/` when populated. Build an Agentway binary for the target OS/architecture before bundling it. Native release signing credentials are supplied locally or through a release system; they are not checked in.

## Configuration

`.env.example` documents available environment variables. The application does not automatically load `.env`; export them in your shell or process manager. Keep the default loopback listener for local use. A network listener requires `KITES_ACCESS_TOKEN`; use HTTPS and configure allowed origins for remote clients.

Provider defaults are defined by your runtime/provider configuration. Optional OneAPI launchers in `scripts/providers/` read an existing Paseo provider configuration, preserving credentials outside this repository. `npm run providers:build` generates launchers in `bin/` with the current Node executable. Set `KITES_CLAUDE_BIN`, `KITES_CODEX_BIN`, `KITES_GROK_BIN`, or `KITES_GOOSE_BIN` if the corresponding native CLI is not on PATH. These launchers currently default Claude/Grok/Goose to Grok-4.7 and Codex to gpt-6-sol with low reasoning; account availability still applies. Goose/OneAPI compatibility depends on the upstream gateway.

## Repository layout

| Path               | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `src/`             | Shared React UI, styles, avatars, localization, and component tests   |
| `server/`          | Kites API, persistence, routines, runtime proxy, workspace operations |
| `shared/`          | Shared runtime membership and access helpers                          |
| `desktop/`         | Electron main process, preload, and menus                             |
| `ios/`, `android/` | Capacitor native projects; generated web assets are ignored           |
| `scripts/`         | Development, build, icon, runtime, and provider launch tooling        |
| `config/`          | Safe example configuration                                            |
| `public/`          | Product icons and static assets                                       |
| `tests/`           | Backend integration tests                                             |
| `docs/`            | Architecture and verification notes                                   |

`data/`, uploads, survey captures, prototype/reset archives, dependencies, and build output remain local and are ignored by Git. Product user data is not part of a source checkout.

## Checks

```sh
npm test
npm run build
npm run lint:css
```

The CI workflow runs tests, type checking, and the web build. Native asset parity can be verified with `npm run mobile:sync`; packaging is tested locally with `npm run desktop:pack`. See [verification notes](docs/verification/initial.md) for historical checks and [workspace access](docs/workspace-access.md) for access design.
