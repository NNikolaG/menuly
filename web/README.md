# menuly web

TODO: product in one line.

Angular 22 (zoneless, signals) · TypeScript · plain CSS with `@layer` · Vitest · Oxlint · npm · Docker + nginx.

## Prerequisites

- Node.js 22+ and npm
- Docker (optional, for the container image)

## Commands

| Command                                 | What it does                              |
| --------------------------------------- | ----------------------------------------- |
| `npm install`                           | Install dependencies                      |
| `npm start`                             | Dev server on http://localhost:4200       |
| `npm run test:ci`                       | Run tests once                            |
| `npm run lint`                          | Lint                                      |
| `npm run build`                         | Production build to `dist/menuly/browser` |
| `docker build -t menuly-web .`          | Build the container image                 |
| `docker run --rm -p 8080:80 menuly-web` | Serve the image on http://localhost:8080  |

## Docs

- [Development](docs/development.md): structure, layers, data, routes, tests
- [UI](docs/ui.md): styles, tokens, primitives
- [Decisions](docs/decisions.md): why things are the way they are
