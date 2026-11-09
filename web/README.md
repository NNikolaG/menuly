# menuly web

Web app for Menuly: the admin panel for venues and the public menu guests open from a QR code.

Angular 22 (zoneless, signals) · Angular Aria + CDK · TypeScript · plain CSS with `@layer` · Vitest · Oxlint · npm · Docker + nginx.

## Prerequisites

- Node.js 26 (22.22+ / 24.15+ also work) and npm
- Docker (optional, for the container image)

## Commands

| Command                                                                                  | What it does                                                                            |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm install`                                                                            | Install dependencies                                                                    |
| `npm start`                                                                              | Dev server on http://localhost:4200 (Serbian); `/api` is proxied to the API on :8080    |
| `npm run start:en`                                                                       | Dev server in English                                                                   |
| `npm run test:ci`                                                                        | Run tests once                                                                          |
| `npm run lint`                                                                           | Lint                                                                                    |
| `npm run build`                                                                          | Production build: Serbian in `dist/menuly/browser`, English in `dist/menuly/browser/en` |
| `npm run i18n:extract`                                                                   | Extract UI text to `src/locale/messages.xlf`                                            |
| `docker build -t menuly-web .`                                                           | Build the container image                                                               |
| `docker run --rm -p 8081:80 -e API_UPSTREAM=http://host.docker.internal:8080 menuly-web` | Serve the image on http://localhost:8081                                                |

The whole stack (database, API, this app on http://localhost:8000, demo data) starts with `docker compose up -d --build` from the repo root; see the root README.

Admin and login run on `localhost`; a tenant's public menu runs on its subdomain, e.g. http://zora.localhost:4200/centar.

## Docs

- [Development](docs/development.md): structure, layers, hosts and routes, auth, data, i18n, tests
- [UI](docs/ui.md): styles, tokens, primitives
- [Decisions](docs/decisions.md): why things are the way they are
