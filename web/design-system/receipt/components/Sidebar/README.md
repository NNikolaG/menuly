# Sidebar

Leva navigacija dashboarda: lokal na vrhu (prebacivanje između lokala), zatim stavke grupisane mono naslovima sekcija.

**Delovi:** `r-sidebar` (širina `sidebar-width`, `surface-sunken`), `r-sidebar__venue` (`r-sidebar__mark` + naziv + plan), `r-sidebar__section`, `r-nav-item` (aktivna: `aria-current="page"`), `r-nav-item__count`.

**Potrošač daje:** stavke, aktivnu rutu, ikonice (opciono, 18px, ispred teksta), inicijal ili logo lokala u `r-sidebar__mark`.

- Aktivna stavka je bela pločica sa ivicom, ne akcentna boja — dashboard ostaje miran.
- Na tabletu se sidebar sklapa u drawer (`z-sidebar`).
