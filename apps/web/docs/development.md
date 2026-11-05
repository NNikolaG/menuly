# Development

## Folder layout

```text
src/
├── index.html
├── main.ts
├── styles.css            # only global style entry, declares the layer order
├── styles/               # reset, tokens, base, patterns, utilities
└── app/
    ├── app.ts            # root component, renders <router-outlet />
    ├── app.config.ts     # app-wide providers
    ├── app.routes.ts     # lazy feature routes
    ├── core/             # app-wide, domain-aware
    ├── shared/
    │   └── ui/           # primitives
    └── features/         # one lazy folder per feature
```

## Layers

| Layer                                                               | What goes there                                                                                                             | May import         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| app root (`app.ts`, `app.config.ts`, `app.routes.ts` in `src/app/`) | Composition root, above all layers; only `main.ts` imports it                                                               | everything         |
| `core/`                                                             | App-wide, domain-aware: interceptors, guards, stores like `ThemeStore`, shared API types in `core/api/`. Empty until needed | `shared/`          |
| `shared/`                                                           | Domain-free, stateless; `shared/ui/` holds primitives                                                                       | nothing            |
| `features/`                                                         | One lazy folder per feature, files flat, response types next to it                                                          | `core/`, `shared/` |

- A feature never imports another feature; what two features need moves down a layer.
- No type folders (`components/`, `services/`, `models/`).

## Enforcement

Layer boundaries are lint rules: the `overrides` in `.oxlintrc.json`. Changing a rule means proving one bad import fails and one valid import (including `@angular/core`) passes.

## App config

App-wide providers live only in `app.config.ts`:

- `provideRouter` with `withComponentInputBinding()` and `withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })`.
- `provideHttpClient(withInterceptors([...]))` exactly once; a second call silently skips the interceptors.
- `LOCALE_ID` is `sr-Latn`, registered with `registerLocaleData`.

## Data

- Relative `/api/…` paths, never absolute URLs. In dev they are proxied by `proxy.conf.json`, added with the first API call.
- Read with `httpResource`; write with `await firstValueFrom(...)`, then `reload()` the affected resources.
- Response types are hand-written next to the feature; shared ones go in `core/api/`.

## Routes and forms

- Every feature is lazy and every route has a Serbian `title`.
- Signal Forms only.

## Tests

- Vitest via `ng test`, specs next to the file they test.
- `whenStable()` hangs on an unflushed request: flush it, or `await` a `setTimeout` tick and call `TestBed.tick()`.

## Docker

`Dockerfile` builds the app with Node and serves `dist/menuly/browser` with nginx (`nginx.conf`, SPA fallback to `index.html`).

```sh
docker build -t menuly-web .
docker run --rm -p 8080:80 menuly-web
```
