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

| Red poslova | [River](https://riverqueue.com) | Poslovi u istom Postgresu; posao se upisuje u istoj transakciji kao uvoz, pa nema izgubljenih ni duplih poslova. |
| Fajlovi | S3 / [MinIO](https://min.io) (`minio-go`) | Lokalno MinIO u compose-u, u produkciji bilo koji S3. Bez `S3_ENDPOINT` fajlovi idu u folder. |
| OCR | Claude (`anthropic-sdk-go`) | Čita fotografiju ili PDF i vraća strukturu menija (JSON šema), ne samo tekst. |

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
- Tema menija: `GET`/`PUT /v1/menus/{id}/theme` (šablon `racun`/`galerija`/`tabla`, akcent i font kao ključevi preseta, svetla/tamna, prikaz slika/opisa/uzorka, logo i naslovna slika). Meni bez sačuvane teme vraća podrazumevanu; javni meni nosi `theme`.
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

## Promocije (kombo)

`POST /v1/venues/{id}/promotions`: naziv, fiksna cena (`price_minor`), period važenja (`starts_at` / `ends_at`, oba opciona), `is_active`, `is_featured` i slotovi. Slot je jedna fiksna stavka ("1x Burger") ili izbor ("1 od: Coca-Cola, Fanta"), uz `quantity`. Opcija može da fiksira varijantu (`variant_id`), inače se računa najjeftinija varijanta stavke.

API računa `regular_price_minor` (zbir slotova kupljenih pojedinačno, kod izbora najjeftinija opcija, da ušteda nikad ne bude prenaduvana) i `savings_minor`, po trenutnim cenama. `status` je `live`, `scheduled`, `expired` ili `inactive`.

Javni meni vraća `promotions` samo za kombo ponude koje su `live`. Opcije sa skrivenim stavkama ili stavkama van aktivnog menija se izostavljaju, a kombo sa praznim slotom se ne prikazuje. Ako u nekom slotu nijedna opcija nije dostupna, kombo ima `is_available: false` i ide na kraj, kao i stavke.

## OCR uvoz menija

1. `POST /v1/venues/{id}/imports` (multipart, polje `files`): slike (JPEG/PNG/WebP) ili PDF, najviše 20 stranica. Slike se rotiraju po EXIF-u i smanjuju na 2000 px. Odgovor je odmah `202` sa statusom `processing`.
2. Svaki fajl je poseban posao u redu (River, red `ocr`). Model prepisuje meni kako je odštampan (bez prevođenja): kategorije, stavke, opis, varijante i cene, uz procenu sigurnosti.
3. FE prati `GET /v1/imports/{id}` dok status ne postane `ready_for_review` (ili `failed`). Nacrt (`draft`) ima stavke sa `uncertain: ["name"|"price"]` i `price_text` kako piše na papiru; `GET .../pages/{pageID}/file` daje original za ekran pregleda.
4. Korisnik ispravlja nacrt (`PUT /v1/imports/{id}/draft`), po potrebi ponovi neuspelu stranicu (`POST .../pages/{pageID}/retry`), pa `POST /v1/imports/{id}/commit` sa `menu_id` (dopuna postojećeg menija, iste kategorije se spajaju po imenu) ili `menu_name` (novi meni).

Slikanje telefonom: može više fotografija jednog menija u jednom uvozu (redom kojim se čita). Kategorija koja se nastavlja na sledećoj slici se spaja, a redovi koji se ponove zbog preklapanja slika se izbacuju (isti naziv sa drugom cenom ostaje, označen `duplicate`). Za svaku sliku model javlja `photo_quality` (good/partial/poor) i `photo_issues` (blurry, cut_off, glare...), a neuspela slika ima `error_code` (`not_a_menu`, `no_items`...), pa aplikacija može da predloži da se slika ponovo. Bez trošenja novog uvoza: `PUT .../pages/{pageID}/file` menja sliku (stare stavke te slike izlaze iz nacrta, ostale izmene ostaju), `POST .../pages` dodaje zaboravljenu stranu, `DELETE .../pages/{pageID}` briše pogrešnu. `summary` u odgovoru daje broj stavki, stavki za proveru i stavki bez cene.

Limit: `venues.ocr_import_limit` (podrazumevano 3); neuspeli uvozi se ne računaju. Preko limita API vraća `409 import_limit_reached`.

Modeli: `OCR_MODEL=claude-haiku-5-5` čita svaku stranicu, a ako rezultat izgleda loše (nema stavki, previše nečitljivih cena ili nesigurnih stavki) stranica se čita ponovo sa `OCR_FALLBACK_MODEL=claude-opus-5-5`. Tokeni i procenjen trošak se čuvaju po stranici (`import_pages.cost_micros`) za praćenje troška po tenantu. Bez `ANTHROPIC_API_KEY` upload radi, ali stranice padaju sa "OCR is not configured".

Docker compose podiže MinIO (konzola http://localhost:9001, `menuly` / `menuly-minio-secret`); ključ se prosleđuje iz shell-a: `ANTHROPIC_API_KEY=... docker compose up --build`.

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
  internal/ocr/            priprema fajlova, Claude ekstrakcija, nacrt, parsiranje cena
  internal/jobs/           River red poslova (OCR stranice)
  internal/storage/        S3/MinIO ili folder
  api/openapi.yaml         API ugovor za web i iOS
```

## Šta još nije urađeno (sledeći koraci)

- Pozivnice za članove tima i reset lozinke (treba slanje emaila).
- Ograničenje `manager`/`staff` na određene objekte (`memberships.venue_ids` postoji u šemi, provera još ne).
- `platform_admin` rute (kolona `users.is_platform_admin` postoji).
- Brojač otvaranja menija (`menu_view_daily`).
- Tema menija, upload slika stavki i promocija (sada samo `image_url`).
- Popusti na stavku/kategoriju i ponavljajući termini promocija (V2).
- Rate limiting za login/register.
