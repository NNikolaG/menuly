# Menuly API (backend)

Go + Postgres, multi-tenant. Specifikacija proizvoda: [../docs/product/mvp.md](../docs/product/mvp.md). API ugovor: [api/openapi.yaml](api/openapi.yaml).

## Pokretanje

```sh
# iz korena repoa: Postgres + migracije + API na http://localhost:8080
docker compose up --build
```

Bez Dockera (Go 1.26, Postgres 16):

```sh
cd backend
cp .env.example .env
make db-up      # samo Postgres iz docker compose-a + menuly_test baza
make migrate
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

## Struktura

```
backend/
  cmd/api/                 main: `api serve`, `api migrate up|down|status|reset`
  internal/config/         env konfiguracija
  internal/db/             pool, db.Tx (tenant kontekst), migracije (goose, embed)
  internal/db/migrations/  SQL migracije = šema za sqlc
  internal/db/queries/     SQL upiti za sqlc
  internal/db/sqlc/        generisan kod (ne menjati ručno)
  internal/auth/           lozinke, JWT, refresh tokeni
  internal/httpapi/        router, middleware, handleri, integracioni testovi
  api/openapi.yaml         API ugovor za web i iOS
```

## Šta još nije urađeno (sledeći koraci)

- Pozivnice za članove tima i reset lozinke (treba slanje emaila).
- Ograničenje `manager`/`staff` na određene objekte (`memberships.venue_ids` postoji u šemi, provera još ne).
- `platform_admin` rute (kolona `users.is_platform_admin` postoji).
- Domen menija: meniji, kategorije, stavke, varijante, istorija cena, promocije, tema, OCR uvoz, javni meni.
- Rate limiting za login/register.
