# Pattern

Bauhaus uzorak generisan iz semena: mreža kvadrata, u svakom jedan oblik (četvrtina kruga, polukrug, krug, trougao, tačke, trake ili puno polje) u brend bojama. Isto seme uvek daje isti uzorak, pa se ništa ne čuva i ništa se ne crta ručno.

**Kako se koristi:** `components/Pattern/bauhaus-pattern.js` izlaže `ReceiptPattern.generatePattern(seed, { cols, rows, big })` (čista funkcija, vraća ćelije) i `ReceiptPattern.renderPattern(el, seed, { cols, rows, cell, big })` (crta u element sa klasama iz `bundle.css`). U Angularu se `generatePattern` prenosi kao servis, a ćelije crta komponenta sa `@for`.

**Klase:** `r-pattern` (mreža; `--cols`, `--rows`, `--cell`), `r-pattern__cell` (`--bg`, `--fg`) + `k-<oblik>` + `rot-0..3`. `r-pattern--fluid` za zone koje se rastežu.

**Potrošač daje:** seme i veličinu mreže. Seme je uvek podatak iz aplikacije:

| Mesto | Seme | Mreža |
|---|---|---|
| Kartica lokala, login lokala, zaglavlje javnog menija | naziv lokala | 4–8 × 2–3 |
| QR stalak / nalepnica za sto | naziv lokala (+ broj stola za varijantu) | 5 × 2 |
| Kategorija na POS-u i u meniju | naziv kategorije | 1 × 1 (znak) ili 4 × 1 |
| Pečat porudžbine (račun, bon za kuhinju) | broj porudžbine | 8 × 1, bez velikih polja |
| Slika za mreže („Novo u ponudi“) | lokal + datum | 5 × 5 |
| Onboarding, prazna stanja | naziv lokala; broj kolona raste sa napretkom | 2 → 6 × 1 |

- Uzorak je dekoracija (`aria-hidden`) i nikad ne stoji iza teksta. Tekst ide na belu karticu ili pločicu pored.
- Paleta je fiksna: tinta, papir i 3 od 5 brend akcenata koje bira seme. Lokal ne bira boje uzorka.
- `big: false` za trake visine jednog reda (pečat, kategorije).
- Ne generisati nasumično pri učitavanju: isti lokal mora izgledati isto na telefonu, POS-u i štampi.
