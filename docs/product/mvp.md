# Menuly: specifikacija proizvoda i MVP

Status: **nacrt v0.2** (2026-11-05). Menja se kroz PR-ove; odluke koje menjaju obim ulaze u ovaj fajl.

Jezik: dokument je na srpskom, nazivi entiteta, polja i API-ja su na engleskom (kao u kodu).

## 1. Šta je Menuly

Menuly je multi-tenant SaaS za restorane, kafiće, barove i slične objekte. Vlasnik slika ili učita postojeći (papirni/PDF) meni, sistem ga OCR-om pretvori u strukturisan digitalni meni, a vlasnik zatim sam menja cene i stavke u realnom vremenu, pravi promo kombinacije i bira izgled. Gosti meni otvaraju preko QR koda, bez instalacije aplikacije.

Klijenti:

- **API (Go + Postgres)**: jedini izvor istine, multi-tenant.
- **Web app (Angular)**: admin panel za objekte (MVP) i javni prikaz menija za goste (MVP).
- **iOS native**: kasnije, kada se tokovi stabilizuju. Android još kasnije.

## 2. Uloge

| Uloga | Ko je | Šta radi |
|---|---|---|
| `platform_admin` | Mi (Menuly tim) | Vidi sve tenante, podrška, suspenzija naloga, praćenje OCR troška. |
| `owner` | Vlasnik biznisa | Sve u svom tenantu: objekti, meniji, dizajn, korisnici, pretplata. |
| `manager` | Šef sale / menadžer objekta | Uređuje menije, cene, promocije za objekte kojima ima pristup. |
| `staff` | Konobar / šank | Samo brze izmene: "nema na stanju", sakrij/prikaži stavku. |
| Gost | Anoniman posetilac | Gleda javni meni preko QR linka. Nema nalog. |

Jedan korisnik može biti član više tenanta (npr. konsultant koji vodi više lokala); uloga se vezuje za par korisnik + tenant (`membership`).

## 3. Lista funkcionalnosti

Oznake: **MVP** ulazi u prvu verziju, **V2** odmah posle MVP-a, **Kasnije** ideje za dalje.

### 3.1 Nalozi i tenanti

| Funkcija | Faza |
|---|---|
| Registracija vlasnika (email + lozinka), kreiranje tenanta pri registraciji | MVP |
| Prijava, odjava, reset lozinke, refresh token | MVP |
| Pozivanje članova tima emailom, dodela uloge | MVP |
| Više objekata (lokacija) po tenantu | MVP |
| Prijava preko Google / Apple naloga | V2 |
| 2FA | Kasnije |
| Pretplate i naplata (planovi) | V2 (MVP je besplatan; postoji samo polje `plan`) |
| Limit OCR uvoza po objektu (podrazumevano 3, platform admin može da poveća) | MVP |

### 3.2 Uvoz menija (OCR)

| Funkcija | Faza |
|---|---|
| Upload jedne ili više slika/PDF stranica menija | MVP |
| Automatska ekstrakcija: kategorije, stavke, opisi, cene, varijante (npr. 0.33 / 0.5) | MVP |
| Ekran za pregled: original levo, prepoznate stavke desno, ispravka pre uvoza | MVP |
| Oznaka nesigurnih polja (niska pouzdanost) da korisnik zna šta da proveri | MVP |
| Podrška za latinicu i ćirilicu, mešane menije (sr/en) | MVP |
| Uvoz u novi meni ili dopuna postojećeg | MVP |
| Ponovni uvoz i poređenje sa postojećim menijem (diff cena) | V2 |
| Uvoz iz URL-a (postojeći sajt, Glovo/Wolt stranica) | Kasnije |
| Prepoznavanje alergena i automatski prevod opisa | V2 |

### 3.3 Upravljanje menijem

| Funkcija | Faza |
|---|---|
| CRUD menija, kategorija, stavki | MVP |
| Varijante stavke sa sopstvenom cenom (veličina, porcija) | MVP |
| Dodaci / opcije (npr. "dodatni sir +100") | V2 |
| Promena redosleda (drag & drop) kategorija i stavki | MVP |
| Slika stavke (upload) | MVP |
| "Nema na stanju" / sakrij stavku, trenutno vidljivo gostima | MVP |
| Masovna promena cena (npr. +10% za kategoriju) | MVP |
| Istorija promena cena | MVP (čuva se u bazi, UI prikaz u V2) |
| Zakazane cene i vremenski meniji (happy hour, doručak do 11h) | V2 |
| Različite cene po objektu za isti meni | V2 |
| Alergeni i oznake (vegan, ljuto, bez glutena) | MVP (ručno) |
| Sadržaj menija na sr-Latn i en (ručni unos prevoda naziva i opisa, srpski je obavezan) | MVP |
| Automatski predlog prevoda | V2 |
| Duplikat menija, šabloni | V2 |

### 3.4 Promocije i kombo ponude

| Funkcija | Faza |
|---|---|
| Kombo: skup stavki (ili izbor iz grupe) po fiksnoj ceni | MVP |
| Prikaz uštede u odnosu na zbir pojedinačnih cena | MVP |
| Period važenja (od/do datuma) i aktivno/neaktivno | MVP |
| Ponavljajući termini (radnim danima 12 do 15h) | V2 |
| Popust na stavku ili kategoriju (procenat / iznos) | V2 |
| Istaknuta promocija (baner na vrhu menija) | MVP |

### 3.5 Dizajn menija

| Funkcija | Faza |
|---|---|
| Izbor jedne od nekoliko gotovih tema | MVP (2 do 3 teme) |
| Logo, naslovna slika, primarna i akcentna boja, izbor fonta iz liste | MVP |
| Live pregled dok se menja dizajn | MVP |
| Prikaz sa slikama ili kompaktna lista | MVP (opcija teme) |
| Napredni editor rasporeda (blokovi, sekcije) | Kasnije |
| PDF export za štampu | V2 |

### 3.6 Javni meni i QR

| Funkcija | Faza |
|---|---|
| Javni URL: poddomen po tenantu, slug po objektu: `{tenant-slug}.menuly.app/{venue-slug}` | MVP |
| Generisanje QR koda (PNG/SVG) za štampu | MVP |
| QR po stolu (`?table=12`) | V2 (potrebno za porudžbine) |
| Brzo učitavanje na slabom mobilnom internetu, keš | MVP |
| Radno vreme, adresa, kontakt, Wi-Fi | MVP |
| Pretraga i filter po alergenima | V2 |
| Poziv konobara / porudžbina sa stola / plaćanje | Kasnije |

### 3.7 Analitika

| Funkcija | Faza |
|---|---|
| Broj otvaranja menija po danu | MVP (jednostavan brojač) |
| Najgledanije stavke i kategorije | V2 |
| Učinak promocija | Kasnije |

### 3.8 Platforma

| Funkcija | Faza |
|---|---|
| Admin pregled tenanata, suspenzija | MVP (minimalno, može i preko API-ja) |
| Praćenje OCR poziva i troška po tenantu | MVP |
| Audit log izmena | V2 |

## 4. Šta je MVP, u jednoj rečenici

Vlasnik se registruje, doda objekat, slika postojeći meni, ispravi ono što OCR nije dobro prepoznao, podesi boje i logo, odštampa QR, i od tada menja cene, dostupnost i kombo ponude iz web admina, a gosti uvek vide ažuran meni.

Van MVP-a namerno ostaju: porudžbine, plaćanja, naplata pretplate, mobilna aplikacija, zakazane cene. MVP je besplatan; jedino ograničenje je broj OCR uvoza po objektu, jer se posle prvog uvoza meni održava ručno.

## 5. Glavni tokovi

### 5.1 Onboarding

1. Registracija: ime, email, lozinka, naziv biznisa i poddomen (`tenant.slug`, predlaže se iz naziva). Kreiraju se `tenant`, `user`, `membership(owner)`.
2. Prvi objekat: naziv, adresa, slug (predlaže se iz naziva, jedinstven unutar tenanta), valuta (podrazumevano RSD).
3. Izbor: "Uvezi postojeći meni" (OCR) ili "Počni od praznog".

### 5.2 Uvoz menija preko OCR-a

1. Korisnik učita 1 do N slika/PDF-ova (najviše 20 stranica po uvozu). Ako je objekat iskoristio limit uvoza, API vraća grešku sa porukom da se postojeći meni menja ručno. Kreira se `import_job` u statusu `uploaded`, fajlovi idu u object storage.
2. Pozadinski worker obrađuje stranice (`processing`), rezultat je strukturisan JSON po stranici (vidi odeljak 7).
3. Status `ready_for_review`: admin prikazuje original i prepoznate stavke jedno pored drugog; nesigurna polja su označena.
4. Korisnik ispravlja, briše, spaja kategorije, pa potvrđuje.
5. `committed`: od nacrta nastaju `category`, `menu_item`, `item_variant` u izabranom meniju. Job čuva sirov rezultat radi poređenja i kasnijeg poboljšanja.
6. Greške: `failed` sa porukom; korisnik može ponovo da pokrene pojedinačnu stranicu.

### 5.3 Brza promena cene / dostupnosti

1. Manager ili staff otvori meni, klikne na cenu ili prekidač "nema na stanju".
2. API upisuje promenu, piše red u `price_change` (za cenu), poništava keš javnog menija za taj objekat.
3. Gost vidi novu cenu na sledećem učitavanju (cilj: ispod 5 sekundi).

### 5.4 Kombo ponuda

1. Manager kreira `promotion` tipa `combo`: naziv, opis, slika, fiksna cena, period važenja.
2. Dodaje slotove: fiksna stavka ("1x Burger") ili izbor ("1 od: Coca-Cola, Fanta, Sprite").
3. Sistem prikazuje zbir pojedinačnih cena i uštedu.
4. Kombo se pojavljuje u javnom meniju u sekciji promocija (ili kao baner ako je `featured`).

### 5.5 Dizajn i objava

1. Izbor teme, logo, boje, font; live pregled javnog menija.
2. Meni ima status `draft` / `published`. Samo objavljen meni vidi gost; jedan objekat ima tačno jedan aktivni objavljeni meni u MVP-u.
3. Preuzimanje QR koda (PNG/SVG) koji vodi na `https://{tenant-slug}.menuly.app/{venue-slug}`.

### 5.6 Gost

1. Skenira QR, otvara se javni meni (bez prijave, bez kolačića za praćenje).
2. Vidi kategorije, stavke, cene, oznake, promocije. Stavke "nema na stanju" ostaju vidljive, označene kao nedostupne, i prikazuju se na dnu svoje kategorije (sakrivanje kao podešavanje u V2).
3. Jezik: podrazumevano srpski (latinica), prekidač za engleski; gde prevod ne postoji prikazuje se srpski tekst.

## 6. Domenski model (osnovni entiteti)

Svi entiteti osim `user` i `platform` tabela imaju `tenant_id`. ID-jevi su UUID v7. Cene su celobrojne u najmanjoj jedinici valute (`price_minor`, npr. para za RSD) uz `currency` (ISO 4217) na nivou objekta.

| Entitet | Ključna polja | Napomena |
|---|---|---|
| `tenant` | id, name, slug (globalno jedinstven, poddomen), plan, status, created_at | Biznis. Rezervisani slugovi: `www`, `api`, `app`, `admin`. |
| `user` | id, email, password_hash, name, locale | Globalan, nije vezan za tenant. |
| `membership` | tenant_id, user_id, role, venue_ids (opciono) | Uloga u tenantu; prazno `venue_ids` = svi objekti. |
| `invitation` | tenant_id, email, role, token, expires_at | |
| `venue` | tenant_id, name, slug (jedinstven unutar tenanta), address, phone, currency, timezone, opening_hours (jsonb), active_menu_id, ocr_import_limit (default 3) | Lokacija / objekat. Rezervisani slugovi: `en`, `sr`, `api`, `assets`. |
| `menu` | tenant_id, venue_id, name, status (draft/published), theme_id, published_at | |
| `category` | tenant_id, menu_id, name, description, position, is_visible | |
| `menu_item` | tenant_id, category_id, name, description, image_url, tags (text[]), allergens (text[]), position, is_available, is_visible | |
| `item_variant` | tenant_id, item_id, label (npr. "0.5 l"), price_minor, position | Stavka bez varijanti ima jednu podrazumevanu varijantu. |
| `price_change` | tenant_id, variant_id, old_price_minor, new_price_minor, changed_by, changed_at | Istorija cena. |
| `promotion` | tenant_id, venue_id, type (combo), name, description, image_url, price_minor, starts_at, ends_at, is_active, is_featured | V2 dodaje tipove `discount`. |
| `promotion_slot` | tenant_id, promotion_id, quantity, position | |
| `promotion_slot_option` | tenant_id, slot_id, item_id, variant_id (opciono) | Jedna opcija = fiksna stavka, više = izbor. |
| `menu_theme` | tenant_id, venue_id, template_key, logo_url, cover_url, primary_color, accent_color, font_key, layout (images/compact) | |
| `import_job` | tenant_id, venue_id, target_menu_id, status, provider, cost_estimate, error, created_by | |
| `import_page` | tenant_id, job_id, file_url, page_index, status, raw_result (jsonb), parsed_result (jsonb) | |
| `media_file` | tenant_id, url, mime, size, created_by | Slike i originali menija. |
| `menu_view_daily` | tenant_id, venue_id, date, views | Jednostavna analitika. |

## 7. OCR: preporuka

### Zahtevi

Meniji su raznoliki: više kolona, tačkice između naziva i cene, ukrasni fontovi, ćirilica i latinica, slike sa telefona pod uglom. Nije nam dovoljan samo tekst, treba nam **struktura** (kategorija, stavka, opis, varijante, cena). Uvoz je ređa operacija (jednom po objektu, povremeno ponovo), pa je cena po stranici važnija od brzine.

### Opcije

| Pristup | Kvalitet strukture | Trošak | Napomena |
|---|---|---|---|
| Tesseract / PaddleOCR (self-hosted) | Slab: daje samo redove teksta, raspored menija se gubi | Samo server | Treba ručno parsiranje cena i kolona; krhko. |
| Google Cloud Vision / AWS Textract / Azure Document Intelligence | Dobar tekst sa koordinatama, struktura ne | Nizak, reda veličine centa po stranici ili manje | Treba drugi korak koji od teksta pravi stavke. |
| Multimodalni LLM (slika ulaz, JSON izlaz) | Najbolji: razume kolone, varijante, ćirilicu, ispravlja tipične greške | Nizak sa manjim modelima, takođe reda veličine centa po stranici | Izlaz ograničen JSON šemom; traži validaciju. |

### Preporuka

1. **Primarno: multimodalni LLM sa strukturisanim izlazom.** Šaljemo sliku stranice i JSON šemu (kategorije, stavke, varijante, cene, `confidence` po polju), dobijamo spreman nacrt za ekran za pregled. Počinjemo sa manjim, jeftinim modelom (npr. Claude Haiku klase), a stranice gde validacija padne (cena nije broj, prazne kategorije, nizak `confidence`) ponovo šaljemo jačem modelu. Tako je prosečan trošak nizak, a težak meni i dalje prođe.
2. **Iza interfejsa.** U Go servisu definišemo `MenuExtractor` interfejs (`Extract(ctx, page) (ExtractedPage, error)`) i čuvamo `provider` i `cost_estimate` na `import_job`. Zamena ili A/B poređenje provajdera je promena konfiguracije, ne arhitekture.
3. **Predobrada slike na serveru:** ispravljanje orijentacije (EXIF), smanjivanje na razumnu rezoluciju, PDF u slike po stranici. To direktno smanjuje trošak.
4. **Validacija posle ekstrakcije u Go kodu:** parsiranje cena (`350`, `350,00`, `350 din`, `1.200`), normalizacija valute, izbacivanje duplikata. Model nikad ne piše direktno u meni, uvek ide kroz nacrt i potvrdu korisnika.
5. **Merenje:** skup od 20 do 30 pravih menija iz Srbije kao test set; pratimo procenat tačnih cena pre potvrde. Odluka o provajderu ide na osnovu tih brojeva. Tačne cene provajdera proveriti pri implementaciji, menjaju se.

Rezervna opcija ako LLM bude preskup ili nedostupan: Google Cloud Vision za tekst + LLM samo za strukturisanje teksta (jeftiniji tekstualni poziv umesto slike).

## 8. Nefunkcionalni zahtevi

- **Multi-tenancy:** jedna baza, deljena šema, `tenant_id` na svakoj tenant tabeli, plus Postgres Row Level Security (`SET app.tenant_id` po transakciji) kao druga linija odbrane uz filtriranje u kodu. Svaki upit van tenanta ide samo kroz eksplicitne platform rute.
- **Javni meni:** jedan endpoint vraća ceo objavljeni meni objekta (kategorije, stavke, promocije, tema) kao jedan JSON, keširan (ETag + kratak TTL, invalidacija na izmenu).
- **Auth:** kratkotrajan JWT access token + refresh token u bazi (moguće opozivanje).
- **Fajlovi:** S3-kompatibilan storage (MinIO lokalno), potpisani URL-ovi za upload.
- **Pozadinski poslovi:** OCR ide u red poslova u Postgresu (npr. River), bez dodatne infrastrukture u MVP-u.
- **Lokalizacija:** UI (admin i javni meni) na sr-Latn i en preko Angular i18n ključeva; kod i API na engleskom. Prevodivi sadržaj menija (`name`, `description` kategorija, stavki, varijanti, promocija) čuva se kao `translations jsonb`, npr. `{"en": {"name": "..."}}`, a osnovna polja su na srpskom. API prima `?lang=en`; vreme u UTC, prikaz po `venue.timezone`.
- **Docker:** `docker compose up` diže API, Postgres, MinIO i web.
- **API:** REST + JSON, OpenAPI specifikacija u repou kao ugovor između BE i web/iOS.

## 9. Odluke (2026-11-05)

1. Stavke "nema na stanju" su vidljive gostima, na dnu svoje kategorije.
2. Javni link: poddomen po tenantu, slug po objektu (`{tenant-slug}.menuly.app/{venue-slug}`). Treba wildcard DNS i TLS sertifikat za `*.menuly.app`.
3. Engleski ulazi u MVP: UI preko i18n ključeva, sadržaj menija kroz ručne prevode.
4. MVP je besplatan. Broj OCR uvoza je ograničen po objektu (podrazumevano 3), jer se posle prvog uvoza digitalni meni menja ručno.
