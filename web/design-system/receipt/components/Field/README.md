# Field

Polje forme: labela iznad, kontrola, pa pomoćni tekst ili greška ispod.

**Struktura:** `r-field` > `r-field__label` + `r-input` (input, textarea, select) + `r-field__hint`. Za grešku dodaj `r-field--error` na omotač i tekst greške stavi u `r-field__hint`.
**Cena:** `r-input--price` (mono, desno poravnanje) u `r-input-wrap` sa sufiksom `r-input-wrap__suffix` („RSD“).

**Potrošač daje:** labelu (uvek, nikad samo placeholder), `id`/`for` ili omotač `<label>`, tekst greške koji kaže kako da se ispravi.

- Placeholder je primer, ne uputstvo.
- Ivica `border-strong` (≥3:1); fokus je `focus` prsten.
- Cene se unose bez decimala osim ako lokal ne radi sa decimalama.
