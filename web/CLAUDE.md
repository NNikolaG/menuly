# menuly frontend

Admin panel and public guest menu for Menuly, a multi-tenant menu digitization SaaS. Product spec: `../docs/product/mvp.md` (once merged); API contract: `../backend/api/openapi.yaml`.

Angular 22 (zoneless, signals) · Angular Aria + CDK · plain CSS with `@layer` · Vitest · Oxlint · npm.

## Commands

npm only: `npm start` · `npm run test:ci` · `npm run lint` · `npm run build`. Format changed files: `npx oxlint --fix <files>`, then `npx prettier --write <files>`. Done means lint, tests and build pass.

## Read before you change

- Structure, imports, providers, hosts, routes, auth, data, forms, i18n, tests → `docs/development.md`
- Styles, tokens, primitives, components, `/design` → `docs/ui.md`
- Dependencies or anything structural → `docs/decisions.md`; larger work gets a plan in `docs/plans/<name>.md` first.
- Angular APIs → the `angular-developer` skill, not memory.

## How to work

- State assumptions; name competing readings; if unclear, ask. Simpler way → say so, push back when warranted.
- Minimum code for the request: no speculative features, single-use abstractions or impossible-case handling.
- Surgical: touch only what the task needs, match existing style, copy an existing pattern; remove only what your change orphaned.
- Comments rare: one line, only what an agent would break without it. Existing comments stay.
- No new dependency without a `docs/decisions.md` entry. No Material, PrimeNG, Tailwind, or any UI/state/HTTP library.

## Conventions

- Standalone components, signal APIs (`signal`, `computed`, `input`, `output`, `model`), `@if`/`@for`/`@switch`, `inject()`. OnPush is the default — don't set it.
- UI text in Serbian (Latin), every string with an `@@` i18n key and an English translation (`docs/development.md` → i18n); code, comments and commits in English.
- Commits: `type(scope): summary` (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`).
- New lasting rule → one line in the matching doc; a changed decision → new entry in `docs/decisions.md`.
