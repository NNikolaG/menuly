# PosTile

POS ekran za osoblje: levo kategorije, desno pločice artikala u boji kategorije. Boja služi za brzinu: konobar prepoznaje kategoriju pre nego što pročita naziv.

**Delovi:** `r-pos-nav` > `r-pos-cat` (aktivna: `aria-current="true"` + klasa boje; ostale: `r-pos-cat__swatch` = znak kategorije, `Pattern` 1×1 ćelija od 24px, seme = naziv kategorije). `r-pos-grid` (4 kolone, redovi 132px) > `r-pos-tile` + klasa boje > `r-pos-tile__name`, `r-pos-tile__price`, opciono `r-pos-tile__qty` (broj u porudžbini). Nema na stanju: atribut `disabled`.

**Boje kategorija:** `cat-amber`, `cat-periwinkle`, `cat-pink` (tamni tekst), `cat-cobalt` (beli tekst). Lokal dodeljuje boju kategoriji; više kategorija može deliti boju.

**Potrošač daje:** listu kategorija sa bojom, artikle, količine iz trenutne porudžbine, dodir → dodaj 1, dugi pritisak → napomena.

- POS je uvek na `brand-ink` podlozi, nezavisno od teme dashboarda; radi u polumraku šanka.
- Pločice su najmanje 132px visoke; ceo ekran je dizajniran za palac, ne za miš.
- Narandžasta nije boja kategorije.
- Znak kategorije (1×1 uzorak) je isti na POS-u, u dashboardu i u javnom meniju — konobar i gost uče isti simbol.
