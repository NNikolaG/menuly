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
engleskim prevodima i jednom nedostupnom stavkom. Tu je i konobar **osoblje@menuly.app / demo1234**
(uloga staff) koji vidi samo objekat `mornar`, za probu ograničenja po objektu. Ponovno pokretanje ne menja ništa;
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
| Fajlovi | S3 / [MinIO](https://min.io) (`minio-go`) | U produkciji bilo koji S3 (`S3_ENDPOINT`). Bez njega fajlovi idu u folder; compose koristi folder u volumenu `uploads` (MinIO slike više nisu javno dostupne). |
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
- Access token nosi `sub` (korisnik), `tid` (tenant) i `role`. Uloge: `owner`, `manager`, `staff`; provera kroz `requireRole(...)` middleware. Uloga se na svakom zahtevu čita iz baze (`memberships`), ne iz tokena: promena uloge važi odmah, uklonjen član dobija `401`, a suspendovan tenant `403 tenant_suspended`, i sa tokenom izdatim ranije.
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

Provajder i modeli: `OCR_PROVIDER` bira ko čita menije, a svaki ima svoj ključ. Ako `OCR_PROVIDER` nije zadat, uzima se prvi sa ključem (anthropic, openai, mistral). Jeftiniji model čita svaku stranicu, a ako rezultat izgleda loše (loša slika, nema stavki, previše nečitljivih cena ili nesigurnih stavki) stranica se čita još jednom jačim modelom:

| `OCR_PROVIDER` | Ključ | `OCR_MODEL` (podrazumevano) | `OCR_FALLBACK_MODEL` (podrazumevano) |
|---|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-haiku-5-5` ($0.10 / $0.50 po 1M tokena) | `claude-opus-5-5` |
| `openai` | `OPENAI_API_KEY` | `gpt-6-luna` ($0.10 / $0.50) | `gpt-6.1-terra` ($1 / $5) |
| `mistral` | `MISTRAL_API_KEY` | `mistral-small-2603` ($0.15 / $0.60) | `mistral-large-2512` ($0.50 / $1.50) |

`OCR_FALLBACK_MODEL=none` isključuje drugo čitanje. `OCR_EFFORT` (low/medium/high) važi za Claude i OpenAI. Svi provajderi koriste isti prompt i istu JSON šemu, pa nacrt, `photo_quality` i `error_code` rade isto. Kod Mistrala se PDF prvo pretvori u tekst sa Mistral OCR (`mistral-ocr-latest`, $4 na 1000 strana), a onda ga model struktuira; slike čita direktno vision model. `OPENAI_BASE_URL` omogućava bilo koji OpenAI-kompatibilan API (npr. kineske modele) ako podržava slike i `json_schema` odgovor; za modele koji nisu u tabeli cena (`internal/ocr/prices.go`) trošak se upisuje kao 0, uz upozorenje u logu pri pokretanju.

Tokeni i procenjen trošak (provajder, model, `cost_micros`) se čuvaju po stranici, a ukupno po tenantu i modelu vidi se u `GET /v1/admin/ocr-usage`. Cene su proverene 2026-11-06; menjaju se, pa ih treba proveriti pri promeni modela. Bez ijednog ključa upload radi, ali stranice padaju sa "OCR is not configured".

Docker compose čuva otpremljene fajlove u volumenu `uploads`; ključ se prosleđuje iz shell-a, npr. `MISTRAL_API_KEY=... docker compose up --build`.

## Slike (stavke, logo, naslovna, promocije)

`POST /v1/media/images` (multipart: `file`, `purpose` = `item`|`logo`|`cover`|`promotion`, `owner`/`manager`): JPEG, PNG ili WebP do 10 MB. Slika se rotira po EXIF-u, smanjuje (stavka i promocija 1600 px, naslovna 2400 px, logo 512 px) i čuva kao JPEG (logo sa providnošću kao PNG). Odgovor ima `url` koji FE upisuje u `image_url` stavke ili promocije, odnosno `logo_url`/`cover_url` teme. Slike se serviraju bez prijave na `GET /v1/public/media/{tenantID}/{ime}` i keširaju godinu dana (fajl se nikad ne menja). `PUBLIC_API_URL` određuje početak tog linka.

## Brojač otvaranja menija

Gostujuća aplikacija jednom po poseti zove `POST /v1/public/menus/{tenant}/{venue}/views` (ne na svaki refresh). Broji se po danu u vremenskoj zoni objekta (`menu_view_daily`), bez kolačića i ličnih podataka. `GET /v1/venues/{id}/stats?days=30` vraća otvaranja po danu (dani bez otvaranja su 0) i ukupno.

## Tim i pozivnice

- `GET /v1/members` (owner, manager), `PATCH /v1/members/{userID}` `{"role"}` i `DELETE /v1/members/{userID}` (samo owner; vlasnik se ne menja i ne briše). Uklonjen član se odmah odjavljuje iz tog tenanta.
- `POST /v1/invitations` `{"email", "role"}`: owner poziva `manager`/`staff`, manager samo `staff`. Email sadrži `{APP_URL}/invite?token=...`, važi 7 dana; nova pozivnica za isti email poništava staru. `GET /v1/invitations` (na čekanju), `DELETE /v1/invitations/{id}`.
- Stranica `/invite` prvo zove `GET /v1/public/invitations/{token}` (tenant, uloga, status, `has_account`). Ako nalog postoji, korisnik se prijavi pa šalje `POST /v1/auth/accept-invite` `{"token"}` sa svojim access tokenom; inače šalje `{"token", "name", "password"}` i nalog se pravi. Odgovor su tokeni za tenant koji je pozvao.
- U bazi se čuva samo sha256 tokena. Pozvani nema tenant kontekst, pa pozivnicu i tenant vidi samo kroz usku RLS politiku `invite_lookup` (red čiji hash odgovara).

## Reset lozinke

`POST /v1/auth/forgot-password` `{"email"}` uvek vraća `204` (ne otkriva da li nalog postoji) i šalje `{APP_URL}/reset-password?token=...`, koji važi sat vremena; najviše 3 linka na sat po nalogu. `POST /v1/auth/reset-password` `{"token", "password"}` menja lozinku, poništava ostale linkove i odjavljuje sve sesije.

Email: bez `SMTP_HOST` poruke se samo upisuju u log (lokalni razvoj: link se kopira iz loga). Sa `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD` šalje se preko SMTP-a (STARTTLS), od `MAIL_FROM`.

## Platform admin

`/v1/admin/*` je za tim Menuly-ja: lista tenanata sa brojem objekata, članova, uvoza, OCR troškom i otvaranjima za 30 dana, detalj tenanta (vlasnici i objekti sa iskorišćenim uvozima), suspendovanje (`PATCH /v1/admin/tenants/{id}` `{"status": "suspended"}` gasi javni meni i prijavu) i promena `ocr_import_limit` objekta, plus `GET /v1/admin/ocr-usage?days=30` (stranice, tokeni i trošak po tenantu i modelu). `users.is_platform_admin` se proverava u bazi na svakom zahtevu, pa oduzimanje važi odmah; `GET /v1/me` ga vraća u `user`. Admin se dodeljuje ručno:

```sql
UPDATE users SET is_platform_admin = true WHERE email = 'ti@menuly.app';
```

Admin transakcije postavljaju `app.platform_admin = 'on'`, što otvara samo `platform_admin` RLS politike za čitanje preko tenanata; sve ostale rute rade kao i do sada.

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
  internal/images/         obrada uploadovanih slika
  internal/mail/           slanje emaila (SMTP ili log)
  api/openapi.yaml         API ugovor za web i iOS
```

## Šta još nije urađeno (sledeći koraci)

- Ograničenje `manager`/`staff` na određene objekte (`memberships.venue_ids` postoji u šemi, provera još ne).
- Brisanje slika koje više ništa ne koristi (`media_files` čuva sve upload-ove).
- Popusti na stavku/kategoriju i ponavljajući termini promocija (V2).
- Rate limiting za login/register.
