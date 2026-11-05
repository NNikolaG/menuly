# Ticket

Potpisna kartica sistema: gornja zona za grafiku, bušotina, veliki naziv, isprekidana linija i mono podaci — kao račun ili propusnica.

**Delovi:** `r-ticket__art` (gornja zona sa Bauhaus uzorkom lokala, `Pattern` 4×2 ćelije po 80px, seme = naziv lokala), `r-ticket__punch` (bušotina), `r-ticket__body`, `r-ticket__top` (naziv + `r-ticket__id`), `r-ticket__rule` (isprekidana linija), `r-ticket__meta` (redovi levo/desno).

**Potrošač daje:** naziv (lokala ili korisnika), ID, 2–3 reda meta podataka, i sadržaj za `r-ticket__art`.

- Kartica je uvek bela (`brand-paper`) na tamnoj podlozi (`brand-ink`) u obe teme — to je brend predmet, ne UI površina.
- Koristi se na login/onboarding ekranima, profilu lokala, deljenim slikama, štampanim QR karticama. Ne u tabelama i formama.
- Zona `r-ticket__art` uvek nosi uzorak generisan iz naziva lokala, nikad fotografiju ni ručno nacrtanu grafiku.
