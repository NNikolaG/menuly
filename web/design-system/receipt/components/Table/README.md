# Table

Tabela podataka u dashboardu: mono zaglavlje VELIKIM SLOVIMA, redovi razdvojeni tankom linijom, brojevi u mono fontu desno.

**Delovi:** `r-table`, ćelija za brojeve `r-cell-num`, drugi red u ćeliji `r-cell-sub`.

**Potrošač daje:** kolone, redove, sortiranje i paginaciju (logika aplikacije).

- Cene i količine uvek u `r-cell-num`.
- Akcije reda (izmeni, obriši) u poslednjoj koloni kao `r-btn--ghost r-btn--sm`.
- Na telefonu tabela postaje lista kartica — ne horizontalni skrol.
