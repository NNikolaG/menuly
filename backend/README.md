# Menuly API (backend)

Go + Postgres, multi-tenant. Specifikacija proizvoda: [../docs/product/mvp.md](../docs/product/mvp.md). API ugovor: [api/openapi.yaml](api/openapi.yaml).

## API dokumentacija (za web i iOS)

- **Izvor istine:** [`api/openapi.yaml`](api/openapi.yaml) (OpenAPI 3.1). Svaka operacija ima `operationId`, pa se iz nje može generisati klijent za Angular (npr. `openapi-generator` ili `ng-openapi-gen`).
- **Interaktivno:** pokrenut API servira Swagger UI na `http://localhost:8080/docs` i sam spec na `/openapi.yaml` (isključuje se sa `DOCS_ENABLED=false`).
- **Ne može da zastari:** test `TestOpenAPICoversRoutes` pada ako neka ruta u routeru nije u spec-u, ili ako spec opisuje rutu koja ne postoji. CI još proverava validnost spec-a (Redocly).

## Pokretanje

```sh
# iz korena repoa: Postgres + migracije + API na http://localhost:8080
docker compose up --build
# demo podaci (jednom, posle prvog pokretanja)
docker compose run --rm api seed
```

### Demo podaci (seed)

`api seed` pravi demo nalog za lokalni razvoj: tenant `demo` (Kafana Mornar d.o.o.),
vlasnika **demo@menuly.app / demo1234**, dva objekta (`mornar` sa objavljenim menijem i
nacrtom, `basta` bez menija) i meni sa 6 kategorija, stavkama, veličinama, cenama u RSD,
engleskim prevodima i jednom nedostupnom stavkom. Ponovno pokretanje ne menja ništa;
`api seed --reset` briše demo nalog i pravi ga iz početka. Odbija da radi sa `APP_ENV=production`.

Bez Dockera (Go 1.26, Postgres 16):

```sh
cd backend
cp .env.example .env
make db-up      # samo Postgres iz docker compose-a + menuly_test baza
make migrate
make seed       # demo nalog demo@menuly.app / demo1234 (make seed-reset za ispočetka)
make run
make test       # integracioni testovi, resetuju bazu menuly_test
```

Brza provera:

```sh
curl -s -XPOST localhost:8080/v1/auth/register \
  -d '{"name":"Nikola","email":"n@example.com","password":"secret123","business_name":"Kafana Đorđe"}'
```

## Stack i zašto

| Deo | Izbor | Zašto |
|---|---|---|
| HTTP router | [chi](https://github.com/go-chi/chi) | Tanak sloj nad `net/http`, standardni middleware, bez magije. |
| Baza | [pgx v5](https://github.com/jackc/pgx) + [sqlc](https://sqlc.dev) | Pišemo čist SQL, sqlc generiše tipizovan Go kod. Nema ORM-a koji krije upite, a RLS i Postgres funkcije koristimo direktno. |
| Migracije | [goose](https://github.com/pressly/goose) | SQL fajlovi ugrađeni u binarni fajl (`api migrate up`), isti fajlovi su šema za sqlc. |
| Konfiguracija | [caarlos0/env](https://github.com/caarlos0/env) | 12-factor, sve iz env varijabli. |
| Logovanje | `log/slog` (stdlib) | JSON u produkciji, tekst lokalno; svaki zahtev loguje `request_id`, `tenant_id`, `user_id`. |
| Auth | JWT (HS256, `golang-jwt/v5`) + bcrypt | Kratak access token (15 min) i refresh token u bazi koji se rotira i može da se opozove. |
| ID-jevi | UUID v7 | Sortirani po vremenu, dobri za indekse, generišu se u Go-u. |

Za kasnije faze (već predviđeno u spec-u): River (red poslova u Postgresu) za OCR, MinIO/S3 za fajlove.

## Multi-tenancy

Jedna baza, deljena šema, `tenant_id` na svakoj tenant tabeli. Izolacija ima dve linije odbrane:

1. **Kod:** svaki upit eksplicitno filtrira po `tenant_id` iz access tokena.
2. **Postgres Row-Level Security:** API se kači kao `menuly_app`, rola bez superuser i bez `BYPASSRLS` prava. Svaka transakcija ide kroz `db.Tx(ctx, scope, fn)`, koji postavlja `app.tenant_id` (i `app.user_id`) sa `set_config(..., true)`, dakle samo za tu transakciju. Politike koriste `app_current_tenant()`; bez konteksta upit ne vidi ništa. `FORCE ROW LEVEL SECURITY` važi i za vlasnika tabela.

Test `TestRLSWithoutAppFilters` dokazuje da `SELECT count(*) FROM venues` bez `WHERE` vidi samo redove trenutnog tenanta, a upis reda za drugi tenant baza odbija.

Globalne tabele (bez RLS): `users` (korisnik može biti član više tenanta) i `refresh_tokens` (traže se po hešu pre nego što je tenant poznat).

### Nova tenant tabela, checklist

1. Kolona `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` + indeks.
2. `ENABLE` i `FORCE ROW LEVEL SECURITY` + politika `tenant_isolation` kao za `venues` u `00001_foundation.sql`.
3. Upiti u `internal/db/queries/*.sql` filtriraju po `tenant_id`, pa `make sqlc`.
4. Handler koristi `s.db.Tx(ctx, principal.Scope(), ...)`.
5. Test izolacije (drugi tenant dobija 404).

## Auth i uloge

- `POST /v1/auth/register` kreira tenant, korisnika i `owner` članstvo.
- `POST /v1/auth/login` (opciono `tenant_id`), `POST /v1/auth/refresh` (rotacija; ponovna upotreba starog tokena opoziva sve sesije korisnika), `POST /v1/auth/logout`, `POST /v1/auth/switch-tenant`.
- Access token nosi `sub` (korisnik), `tid` (tenant) i `role`. Uloge: `owner`, `manager`, `staff`; provera kroz `requireRole(...)` middleware.
- `GET /v1/me` vraća korisnika, trenutni tenant, ulogu i sva članstva (za izbor tenanta u UI-ju).

Objekti (`/v1/venues`): čitanje svi članovi, kreiranje i brisanje `owner`, izmena `owner` i `manager`. `slug` se pravi iz naziva ako nije zadat (ćirilica i latinica se transliteruju).

## Javne adrese

Javni meni je na `{tenant-slug}.menuly.app/{venue-slug}`. `tenants.slug` je globalno jedinstven i služi kao poddomen (bira se pri registraciji kao `tenant_slug` ili se pravi iz naziva biznisa; rezervisani su `www`, `api`, `app`, `admin` i još par tehničkih imena). `venues.slug` je jedinstven samo unutar tenanta i ne sme biti `en`, `sr`, `api` ni `assets` (te putanje koristi web app). `venues.ocr_import_limit` (podrazumevano 3) ograničava broj OCR uvoza po objektu.

## Meniji

Hijerarhija: objekat → meni → kategorija → stavka → varijanta (cena). Stavka uvek ima bar jednu varijantu; stavka sa jednom cenom ima varijantu sa praznim `label`. Cene su `price_minor` u najmanjoj jedinici valute objekta.

- `GET /v1/menus/{id}` vraća celo stablo za admin editor, sortirano po `position`.
- Redosled (drag & drop): `PUT .../categories/order` i `PUT .../items/order` sa svim ID-jevima u novom redosledu.
- Objava: `POST /v1/menus/{id}/publish`; objekat ima najviše jedan objavljen meni (`venue.active_menu_id`).
- Svaka promena cene (pojedinačna ili masovna `POST /v1/menus/{id}/price-adjustments`) upisuje red u `price_changes`.
- Prevodi: `translations` jsonb, npr. `{"en": {"name": "Drinks"}}`; osnovna polja su na srpskom.
- Uloge: svi čitaju; `owner` i `manager` uređuju; `staff` sme samo `PATCH /v1/items/{id}/status` (nema na stanju / sakrij).
- Deca referenciraju roditelja preko `(id, tenant_id)`, pa ni direktan SQL ne može da veže stavku za kategoriju drugog tenanta.

## Javni meni (gosti)

`GET /v1/public/menus/{tenant-slug}/{venue-slug}?lang=en`, bez prijave. Vraća objavljeni meni objekta kao jedan JSON: samo vidljive kategorije i stavke, a nedostupne stavke na kraju svoje kategorije sa `is_available: false`. Uz `lang` se nazivi i opisi prevode gde prevod postoji, inače ostaje srpski. Odgovor ima `ETag` i `Cache-Control: public, max-age=30`, pa gost vidi promenu cene najkasnije za 30 sekundi, a `If-None-Match` vraća `304`.

Gost nema tenant kontekst. Zato se tenant prvo nađe po slugu kroz usku RLS politiku `public_lookup` (samo red tog tenanta), a ostatak transakcije ide kroz obične tenant politike, samo za čitanje.

## QR kod

`GET /v1/venues/{id}/qr?format=png|svg&size=512&download=1` pravi QR za javni link objekta (`GET /v1/venues/{id}/public-link`). Šablon linka je `PUBLIC_MENU_URL` (podrazumevano `https://{tenant}.menuly.app/{venue}`), pa lokalno može npr. `http://localhost:4200/m/{tenant}/{venue}`.

## Struktura

```
backend/
  cmd/api/                 main: `api serve`, `api migrate up|down|status|reset`, `api seed [--reset]`
  internal/config/         env konfiguracija
  internal/db/             pool, db.Tx (tenant kontekst), migracije (goose, embed)
  internal/db/migrations/  SQL migracije = šema za sqlc
  internal/db/queries/     SQL upiti za sqlc
  internal/db/sqlc/        generisan kod (ne menjati ručno)
  internal/auth/           lozinke, JWT, refresh tokeni
  internal/seed/           demo podaci za lokalni razvoj
  internal/httpapi/        router, middleware, handleri, integracioni testovi
  api/openapi.yaml         API ugovor za web i iOS
```

## Šta još nije urađeno (sledeći koraci)

- Pozivnice za članove tima i reset lozinke (treba slanje emaila).
- Ograničenje `manager`/`staff` na određene objekte (`memberships.venue_ids` postoji u šemi, provera još ne).
- `platform_admin` rute (kolona `users.is_platform_admin` postoji).
- Brojač otvaranja menija (`menu_view_daily`).
- Promocije / kombo, tema menija, upload slika (MinIO), OCR uvoz.
- Rate limiting za login/register.
