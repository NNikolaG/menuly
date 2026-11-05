# Button

Dugme za jednu radnju; `primary` je glavna akcija ekrana i ima je najviše jedna po pogledu.

**Varijante:** `r-btn--primary` (fill `accent` — podrazumevano tinta sa belim tekstom, ili boja lokala; tekst `on-accent`), `r-btn--secondary` (ivica `border-strong`), `r-btn--ghost` (bez ivice, za toolbar i dijaloge), `r-btn--danger` (samo nepovratne radnje, uvek uz potvrdu), `r-btn--inverse` (na brend površinama).
**Veličine:** `r-btn--sm` (32px, tabele), podrazumevano (40px, dashboard), `r-btn--lg` (48px, javni meni, login, mobilno).

**Potrošač daje:** element `<button>` ili `<a>`, tekst u imperativu („Sačuvaj“, „Dodaj stavku“), opciono ikonicu ispred teksta.

- Tekst je glagol, kratko; bez „Klikni ovde“.
- Onemogućeno stanje preko `disabled` / `aria-disabled="true"`.
- `accent` je podrazumevano neutralna tinta; lokal ga menja presetom `r-tenant-*` (vidi Tenant sloj u brend knjizi). Narandžasta nikad nije fill dugmeta.
