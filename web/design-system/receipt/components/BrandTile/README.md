# BrandTile

Bento pločice brend površina (login, landing, reklame, deljene slike): jedna poruka ili jedan broj po pločici, u punoj brend boji.

**Delovi:** `r-brand` (omotač, `brand-ink` podloga), `r-brand-grid` (3 kolone, redovi 180px, razmak `space-4`), `r-brand-tile` + boja: `--cobalt` (beli tekst), `--amber`, `--pink`, `--periwinkle`, `--paper` (tamni tekst). Unutra: `r-mono-label`, `r-brand-tile__headline`, `r-brand-tile__number`, `r-brand-tile__caption`. Jedna pločica po ekranu nosi Bauhaus uzorak (`Pattern`, seme = naziv platforme ili lokala) umesto teksta.

**Potrošač daje:** raspored pločica (raspon kolona i redova), tekst, i sadržaj za zonu grafike.

- Najviše 4–5 pločica po ekranu; jedna nosi naslov, ostale podršku.
- Narandžasta se pojavljuje samo unutar uzorka, nikad kao pozadina pločice sa tekstom.
- Uzorak i tekst se ne mešaju: pločica je ili uzorak ili poruka.
- Brend pločice ne ulaze u dashboard; tamo se koristi `Card`.
