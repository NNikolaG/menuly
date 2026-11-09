# Menuly

Multi-tenant sistem za digitalizaciju menija restorana i kafića: OCR uvoz postojećeg menija, dinamičke cene i stavke, promo kombo ponude i dizajn menija.

Monorepo:

- `backend/`: API (Go + Postgres)
- `web/`: web app (Angular)
- `ios/`: iOS native (kasnije)

Specifikacija proizvoda: [docs/product/mvp.md](docs/product/mvp.md)

## Pokretanje cele aplikacije (bez programiranja)

Potreban je samo [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac ili Windows). Node, Go i baza nisu potrebni, sve radi u Dockeru.

1. Instaliraj Docker Desktop i pokreni ga. Sačekaj da u njemu piše da radi (zelena oznaka "Engine running").
2. Preuzmi projekat: na GitHub-u klikni **Code → Download ZIP** i raspakuj ga (ili `git clone https://github.com/NNikolaG/menuly.git`).
3. Otvori terminal u tom folderu (Mac: desni klik na folder → **New Terminal at Folder**; Windows: u folderu desni klik → **Open in Terminal**).
4. Upiši i pritisni Enter:

   ```sh
   docker compose up -d --build
   ```

   Prvi put traje nekoliko minuta. Spremno je kada se komanda završi i na kraju piše `Container menuly-web-1 Started`.

5. Otvori u pregledaču (preporuka Chrome):
   - Aplikacija za vlasnike: http://localhost:8000
     - email: `demo@menuly.app`
     - lozinka: `demo1234`
   - Meni kako ga vide gosti: http://demo.localhost:8000/mornar

Gašenje: `docker compose down`. Sledeći put opet `docker compose up -d --build` (podaci ostaju sačuvani). Isto radi i dugme Start/Stop kod projekta "menuly" u Docker Desktop-u.

| Šta želiš                           | Komanda                                       |
| ----------------------------------- | --------------------------------------------- |
| Pokreni                             | `docker compose up -d --build`                |
| Ugasi                               | `docker compose down`                         |
| Vidi šta se dešava (logovi)         | `docker compose logs -f`                      |
| Vrati demo podatke na početne       | `docker compose run --rm seed seed --reset`   |
| Obriši sve podatke i kreni od nule  | `docker compose down -v`                      |

### Čitanje menija sa slike (OCR)

Uvoz menija sa fotografije traži API ključ (npr. OpenAI). Napravi kopiju fajla `.env.example`, nazovi je `.env`, upiši ključ posle `OPENAI_API_KEY=` i ponovo pokreni `docker compose up -d --build`. Bez ključa sve ostalo radi, samo uvoz sa slike javlja grešku.

### Ako nešto ne radi

- **"port is already allocated"**: neki drugi program koristi port 8000, 8080 ili 5432. Ugasi ga ili ugasi drugi Docker projekat, pa pokreni ponovo.
- **Meni za goste se ne otvara u Safariju**: Safari ne zna za adrese `*.localhost`, otvori ga u Chrome-u ili Firefox-u.

### Za razvoj

Docker pokreće sve na http://localhost:8000. Web aplikacija se i dalje razvija lokalno sa `cd web && npm start` (http://localhost:4200, `/api` ide na API iz Dockera na :8080); oba rade istovremeno. Ako ti web kontejner ne treba: `docker compose up postgres migrate seed api`. Detalji: [web/README.md](web/README.md), [backend/README.md](backend/README.md).

## Demo server

GitHub Actions (`.github/workflows/images.yml`) na svaki push na `main` pravi
slike za amd64 i arm64, šalje ih na GHCR i proverava ih na arm64 mašini.
Server samo povlači slike i pokreće `deploy/demo/compose.yml` (oko 300 MB RAM-a).

Automatski deploy se uključuje kad u *Settings → Secrets and variables → Actions*
postoje promenljiva `DEPLOY_HOST` (IP servera) i tajna `DEPLOY_SSH_KEY`
(privatni SSH ključ). Opciono: `DEPLOY_USER` (podrazumevano `ubuntu`),
`DEMO_DOMAIN` (podrazumevano `<IP>.nip.io`), `WEB_PORT` (podrazumevano 80).
Na serveru treba Docker sa compose dodatkom i otvoren port (Oracle Security List
i iptables). Prvi deploy sam napravi `.env` sa nasumičnim lozinkama.
