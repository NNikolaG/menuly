# MenuItem

Red stavke u javnom meniju: naziv i cena u istoj liniji, opis ispod, pa oznake. Liste razdvaja isprekidana linija, kao na računu.

**Delovi:** `r-menu-list` (kolona, max `menu-max-width`), `r-menu-cat` (`r-menu-cat__title` + mono `r-menu-cat__count`), `r-menu-item` > `r-menu-item__name`, `r-menu-item__price`, `r-menu-item__desc`, `r-menu-item__meta` (Badge + Tag). Nedostupno: `r-menu-item--unavailable` + bedž „Nema danas“.

**Potrošač daje:** naziv, cenu već formatiranu („1.250 RSD“), opcioni opis (do ~120 znakova), oznake; tenant tokene na omotaču stranice.

- Cena je uvek mono, poravnata desno — kolona cena se čita kao na računu.
- Opis je u `text-muted`, nikad u akcentnoj boji.
- Boja lokala se vidi samo kroz `accent` (aktivni čip, bedž „Novo“/„Preporuka“) — pozadina i tekst ostaju neutralni. Primer desno: isti markup sa klasom `r-tenant-bordo` na omotaču.
- Slika stavke (kada postoji): iznad naziva, odnos 4:3, `radius-lg`.
