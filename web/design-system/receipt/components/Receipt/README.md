# Receipt

Porudžbina stola na POS-u, nacrtana kao račun: bela kartica sa bušotinom, naziv stola krupno, stavke u mono koloni, isprekidane linije, ukupno krupno na dnu.

**Delovi:** `r-receipt` (bušotina je ugrađena) > `r-receipt__head` (`r-receipt__title` + `r-receipt__id`), `r-receipt__meta`, `r-receipt__rule`, `r-receipt__line` (`r-receipt__qty`, `r-receipt__name` sa opcionim `r-receipt__note`, `r-receipt__sum`), `r-receipt__total-label`, `r-receipt__total`, `r-receipt__actions` (`r-btn r-btn--pay`, `r-btn r-btn--send`), `r-receipt__stamp` (pečat porudžbine: `Pattern` 8×1, bez velikih polja, seme = broj porudžbine).

**Potrošač daje:** sto, broj porudžbine, broj gostiju, konobara, stavke sa napomenama, ukupan iznos već formatiran („1.610“).

- Iznosi bez valute u redovima; valuta samo uz ukupno.
- Glavna radnja („Pošalji u šank“) je crna i šira; „Naplati“ je sekundarna.
- Isti predmet se koristi i za pregled porudžbine u dashboardu i za deljeni/štampani račun.
- Pečat se štampa i na bonu za kuhinju/šank: osoblje prepoznaje porudžbinu po šari pre nego po broju.
