# Development

## Folder layout

```text
src/
├── index.html
├── main.ts
├── styles.css              # only global style entry, declares the layer order
├── styles/                 # reset, tokens, base, patterns, utilities
├── environments/           # environment.ts (prod), environment.development.ts: apiBaseUrl
├── locale/                 # messages.xlf (extracted), messages.en.xlf (English)
└── app/
    ├── app.ts              # root component, renders <router-outlet />
    ├── app.config.ts       # app-wide providers
    ├── app.routes.ts       # route tree: tenant host, public, protected
    ├── core/
    │   ├── api/            # ApiClient, ApiError, shared API types
    │   ├── auth/           # AuthStore, interceptor, guards
    │   ├── host/           # which host we run on (app or tenant subdomain)
    │   └── layout/         # admin shell, title strategy, not-found page
    ├── shared/
    │   └── ui/             # primitives + barrel (index.ts)
    └── features/           # one lazy folder per feature
        ├── auth/           # login, registration
        ├── dashboard/
        ├── design/         # /design
        ├── venues/         # /objekti list, /objekti/novi, /objekti/:venueId (+ menus), /objekti/:venueId/izmena
        ├── menus/          # /meniji/:menuId editor: categories, items, prices, availability, bulk price change
        ├── promotions/     # /objekti/:venueId/kombo combo offers (list + editor)
        ├── imports/        # /objekti/:venueId/uvoz photo upload, /uvoz/:importId progress and review
        ├── team/           # /tim members and invitations
        ├── admin/          # /admin platform admin (businesses, import limits, OCR spend)
        └── public-menu/    # guest menu page on the tenant subdomain; the themed view itself is core/public-menu/ (the theme editor previews it)
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
- No manual `LOCALE_ID`: each localized build sets it (see i18n).

## Data

Every API call goes through `ApiClient` (`core/api/api-client.ts`); nothing else injects `HttpClient`.

- **Base URL:** `environment.apiBaseUrl` (`src/environments/`), provided as `API_BASE_URL` in `app.config.ts`. It is `/api` in both builds: `/api/v1/x` reaches the API's `/v1/x` through `proxy.conf.json` in dev and nginx (`API_UPSTREAM`) in Docker. An absolute URL works too, but then the API's CORS must allow the web origin.
- **Paths** are API paths (`/v1/venues`), never with the base URL.
- **One API class per resource**, next to its feature, or in `core/` once two features need it (`core/venues/venues-api.ts`, `core/menus/menus-api.ts`, `core/auth/auth-api.ts`). Response types next to it; shared ones in `core/api/api-types.ts`. Test fixtures go in `*.testing.ts` next to the types (`venue.testing.ts`, `menu.testing.ts`).
- **Shared lists:** `VenuesStore` (`core/venues/`) holds the tenant's venue list once for every page and guard; pages `reload()` it in the background and after writes. A resource whose URL is the same for every tenant passes `key: tenantId()` so a tenant switch refetches it.
- **Resources refetch only when the request changes.** `ApiClient.resource` compares URL and query, so a resource keyed on another resource's value (the venue of a menu) does not reload when that value changes for other reasons.
- **Prices** are integer minor units in the API (`price_minor`); forms work in major units and convert with `toMinor`/`toMajor` (`features/menus/price.ts`). Show them with `CurrencyPipe`.
- **Optimistic edits** (availability switch, drag reorder) update the resource with `.update()`, then call the API; on failure they roll back or reload.
- **Reads** are signal resources: `xxxResource()` returns `api.resource<T>(() => path | { path, query } | undefined)` (an `httpResource`). Call it in a field initializer; it reloads when the signals it reads change and stays idle on `undefined`. Templates use `isLoading()`, `error()`, `value()`, `reload()`.
- **Writes** return Observables (`api.post/patch/delete`) that fail with `ApiError` (`status`, `code`). In components: `await firstValueFrom(api.create(...))`, then `reload()` the affected resources.
- **Errors:** `toApiError(error)` turns anything (also a resource's `error()`) into `ApiError`; map `code` to a Serbian message, never show the API's English `message`.
- Format values with Angular pipes (`date`, `currency`, `number`); they follow the build's locale.

```ts
@Injectable({ providedIn: 'root' })
export class VenuesApi {
  private readonly api = inject(ApiClient);

  listResource() {
    return this.api.resource<VenueList>(() => '/v1/venues');
  }

  create(input: VenueInput): Observable<Venue> {
    return this.api.post('/v1/venues', input);
  }
}

// in a component
protected readonly venues = inject(VenuesApi).listResource();
```

## i18n

- Built-in Angular i18n (`@angular/localize`): source locale `sr-Latn`, translation `en` in `src/locale/messages.en.xlf`.
- Every UI string gets an explicit key: `i18n="@@feature.thing"` in templates, `` $localize`:@@feature.thing:Tekst` `` in code. Source text in Serbian.
- After adding or changing text: `npm run i18n:extract`, then copy new units into `messages.en.xlf` with an English `<target>`.
- The production build emits one app per locale: Serbian at the root (`dist/menuly/browser/`), English under `/en/`. `npm start` serves Serbian, `npm run start:en` English. A venue slug can't be `en`.
- A missing translation fails the build (`i18nMissingTranslation: error`).
- Counts use ICU plurals with Serbian `one` / `few` / `other` (`{n, plural, one {…} few {…} other {…}}`), not `=1`, so 21 reads "21 stavka". Angular's `sr-Latn` locale data has no plural rules, so `main.ts` calls `registerSerbianLatinPlurals()` (`core/i18n/`); specs that render plurals call it too.
- The public menu asks the API for content in the build's language (`?lang=en` in the English build), or in the page's own `?lang=` (a menu language without app texts, served by the English build); names come back translated, and `languages` says what the menu offers (decision #35).

## Hosts and routes

One app serves two hosts (`core/host/app-host.ts`):

- **Tenant subdomain** `{tenant}.menuly.app` (locally `{tenant}.localhost:4200`): only the public menu, `/{venue-slug}`. No sign-in. Matched first by `tenantHostGuard`, which swallows every URL on that host.
- **App host** (`app.menuly.app`, `localhost`, anything else): everything below.

| Route                              | Access                         | Guard                                                         |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| `/prijava`, `/registracija`        | guests only                    | `guestGuard` (signed-in → `/`)                                |
| `/design`                          | open                           | none                                                          |
| `/` → `/pregled`, every other path | signed in, inside `AdminShell` | `authGuard` (`canMatch`; signed-out → `/prijava?returnUrl=…`) |
| role-limited pages                 | listed roles only              | `roleGuard('owner', …)` on the route                          |

- Protected pages are children of the `AdminShell` route; add a feature there as `{ path: '<sr-slug>', loadChildren: … }`.
- Every feature is lazy and every route has a Serbian `title` (`$localize`); `AppTitleStrategy` appends ` · Menuly`. `AppPreloading` (`core/host/`) loads all lazy pages in the background after the first one (not on a tenant host); `data: { preload: false }` opts a route out.
- Route paths are Serbian (`/prijava`, `/pregled`), code names English.
- An empty-path parent whose children don't match still matches an empty URL and renders nothing; give guest routes their own path instead of an empty-path wrapper.

## Auth

- `AuthStore` (`core/auth/`) owns the session: access + refresh token from `/v1/auth/*`, persisted in `localStorage`, exposed as signals (`isAuthenticated`, `role`, `tenantId`) and `me` (`httpResource` of `/v1/me`, reloads on tenant switch).
- `authInterceptor` adds `Authorization: Bearer …` to `/api/` calls except login, register, refresh and logout; it refreshes a token that expires within 30 s before sending, and on a 401 refreshes once and retries.
- Refresh is single-flight: each refresh token works once, and reusing one revokes every session of the user.
- A rejected refresh signs out and goes to `/prijava?returnUrl=…`.
- Map API errors with `apiErrorCode(error)` to Serbian messages; never show the API's English `message`.

## Forms

- Signal Forms only (`form`, validators, `submit`, `[formField]`), wrapped in `AppField` + `AppInput`.
- Server errors go to a page `error` signal shown with `role="alert"`.

## Tests

- Vitest via `ng test`, specs next to the file they test.
- `whenStable()` hangs on an unflushed request: flush it, or `await` a `setTimeout` tick and call `TestBed.tick()`.

## Docker

`Dockerfile` builds the app with Node and serves `dist/menuly/browser` with nginx (`nginx/default.conf.template`): Serbian at `/`, English at `/en/`, each with its own SPA fallback, and `/api/` proxied to `API_UPSTREAM` (default `http://api:8080`, the compose service).

```sh
docker build -t menuly-web .
docker run --rm -p 8081:80 -e API_UPSTREAM=http://host.docker.internal:8080 menuly-web
```
