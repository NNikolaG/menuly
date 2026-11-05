Radni naziv sistema je **Receipt**. Sistem ima dva glasa: tih, funkcionalan UI koji govori jezikom računa (mono cene, isprekidane linije, porudžbina kao račun) i glasan brend potpis, Bauhaus uzorak generisan za svaki lokal. Krupan, miran grotesk nosi sadržaj. Sitan mono tekst VELIKIM SLOVIMA nosi činjenice (cene, datume, stolove). Isprekidana linija razdvaja stavke kao na traci iz kase.

## Tri površine, jedan DNK

Sistem pokriva tri površine sa različitim zadacima. Sve tri dele iste primitive, fontove i pravila; razlikuju se u glasnoći.

| Površina | Ko gleda | Glasnoća | Čiji brend |
|---|---|---|---|
| **Brend i POS** (login, onboarding, POS, landing, reklame, deljene slike) | vlasnici lokala, osoblje, potencijalni kupci | glasno — ovde je WOW: `display-*`, bento, `brand-*` boje, Ticket kartica, grafika | platforma |
| **Dashboard** (menadžerski panel sa sidebarom) | osoblje, svaki dan, satima | generički i tih; lokal menja samo akcent i font | platforma + akcent lokala |
| **Javni meni** (web + mobilno, gost skenira QR) | gosti, sa telefona za stolom | čitljivo, toplo, brzo | **lokal** (tenant sloj) |

- Na **brend i POS** površinama koristi `brand-ink` kao podlogu, `brand-paper` za Ticket kartice i `brand-orange`, `brand-amber`, `brand-periwinkle`, `brand-cobalt`, `brand-pink` za blokove grafike. Ovde (i samo ovde) sme `display-xl`. Pravila su u sekciji „Brend i POS“ ispod.
- **Dashboard** je generička osnova bez dekoracije. Lokal ili tim menja samo dve stvari: akcentnu boju (`r-tenant-*`) i sans font (`r-font-*`). Sve ostalo je fiksno. Najviše jedna `r-card--inverse` i jedna `r-card--accent` pločica po ekranu. Aktivna stavka sidebara je bela pločica, ne akcentna boja.
- U **javnom meniju** platforma se povlači: gost vidi naziv i boju lokala. Logo platforme ide najviše u futer („Meni pokreće …“).

## Tokeni u tri sloja

1. **Primitivi** (`n-*`, `orange-*`, `amber-*`, `blue-*`, `pink-*`, `green-*`, `red-*`) su sirove vrednosti. Komponente ih **nikad** ne koriste direktno.
2. **Semantički tokeni** (`bg`, `surface`, `text`, `text-muted`, `border`, `accent`, `success`…) opisuju ulogu. Komponente koriste samo njih. Svetla i tamna tema menjaju samo ovaj sloj.
3. **Tenant sloj** je pet semantičkih tokena koje lokal sme da promeni: `accent`, `accent-hover`, `on-accent`, `accent-text`, `accent-subtle`.

Analogija: primitivi su sve boje u kutiji bojica, semantika je „čime bojim nebo, a čime travu“, a tenant sloj je jedina bojica koju lokal sam bira.

### Tenant sloj — pravila

- Lokal bira boju **samo iz liste preseta** `tenant-*`: tinta (podrazumevano, neutralna), pečena narandža, espresso, bordo, maslina, teget, kobalt, smaragd, senf, roze. Nema slobodnog izbora boje, jer bi slobodan izbor brzo doveo do nečitljivog menija.
- Svaki preset je proveren: `on-accent` na `accent` ≥4.5:1, `accent-text` na `bg`/`surface` ≥4.5:1, u obe teme. U tamnoj temi tamni preseti (espresso, bordo, teget…) dobijaju svetliju varijantu i taman tekst na sebi.
- U web aplikaciji preset se primenjuje klasom na omotaču (dashboard ili meni): `r-tenant-bordo`, `r-tenant-teget`… (definisano u `components/bundle.css`). Na native strani backend vraća ključ preseta (`"bordo"`), a ne heks vrednost.
- Font: `r-font-onest` (podrazumevano), `r-font-manrope`, `r-font-plex`. Menja se samo sans; mono za cene i labele ostaje JetBrains Mono.
- Boja lokala se vidi **samo kroz akcente**: aktivna kategorija, primarno dugme, bedž „Novo/Preporuka“, linkovi. Pozadina, tekst i ivice ostaju sistemski.
- Uz boju i font, lokal kasnije može da bira i: logo/inicijal, naslovnu fotografiju i temu menija (svetla/tamna). Font se bira samo iz liste, jer slobodan izbor lomi dijakritike i ćirilicu.
- Brend i POS površine **ne** primaju tenant boju i font; one su glas platforme.

## Brend i POS (Bauhaus)

Ovo je mesto gde sistem sme da bude glasan. Potpis sistema je **Bauhaus uzorak** (komponenta `Pattern`): mreža kvadrata, u svakom jedan prost oblik (četvrtina kruga, polukrug, krug, trougao, tačke, trake, puno polje) u brend bojama. Uzorak se ne crta, nego **generiše iz semena**, podatka koji aplikacija već ima. Isti naziv lokala uvek daje isti uzorak, a dva lokala nikad ne dobijaju isti.

- **Seme:** naziv lokala (kartica lokala, zaglavlje menija, QR stalak, login lokala), naziv kategorije (znak kategorije na POS-u i u meniju), broj porudžbine (pečat na računu i bonu), lokal + datum (slike za mreže). Nikad nasumično pri učitavanju.
- **Paleta uzorka:** `brand-ink`, `brand-paper` i 3 od 5 akcenata (`brand-orange`, `brand-amber`, `brand-periwinkle`, `brand-cobalt`, `brand-pink`) koje bira seme. Lokal ne bira boje uzorka; njegova tenant boja živi samo u UI akcentima.
- **Uzorak nikad ne stoji iza teksta.** Pločica je ili uzorak ili poruka. Tekst ide na belu karticu (`brand-paper`) ili na pločicu u jednoj boji pored uzorka.
- **Podloga** brend i POS površina je uvek `brand-ink`, u obe teme.
- **Login:** velika pločica sa uzorkom (seme = naziv platforme, ili naziv lokala na login stranici lokala), pored nje pločica sa naslovom (`r-brand-tile--cobalt`) i jedan broj (`--amber`/`--pink`); desno bela kartica forme sa crnim dugmetom.
- **POS:** tamna podloga; kategorije levo sa znakom kategorije (1×1 uzorak), pločice artikala u boji kategorije (PosTile); porudžbina desno kao račun (Receipt) sa pečatom porudžbine na dnu.
- **Ticket kartica:** gornja zona uvek nosi uzorak lokala. Kartica je „lična karta“ lokala: login, profil lokala, deljene slike, štampa.
- **Reklame i mreže (4:5, 1:1, 9:16):** uzorak kao polje (5×5 ili 6×7), bela kartica sa porukom preko donjeg dela, krupan naslov u `display-*`, QR na beloj podlozi.
- **Onboarding i prazna stanja:** uzorak lokala raste sa napretkom (2 → 6 kolona); umesto sivog spinera uzorak se slaže ćeliju po ćeliju.
- **Narandžasta** postoji samo unutar uzorka, uz ostale brend boje. Nikad kao pozadina teksta ni boja kategorije.
- Brend predmeti ne ulaze u dashboard. Izuzetak: sidebar dashboarda sme da pokaže mali znak lokala (uzorak 2×2) umesto inicijala.

## Boja

- Podloga je skoro crna `n-900` (#141414) ili topli papir `n-25`. Čista #000 i hladna siva se ne koriste.
- Podrazumevani akcent je **tinta**: primarno dugme je `n-900` sa belim tekstom (u tamnoj temi obrnuto). Interfejs je neutralan dok lokal ne izabere boju.
- Narandžasta (`brand-orange`) je boja **brend grafike**, ne UI-ja. Ne koristi se kao fill dugmeta sa tekstom i ne stoji sama uz crnu: uvek u kompoziciji sa bar još jednom brend bojom (`brand-amber`, `brand-periwinkle`, `brand-cobalt`, `brand-pink`). Ko želi narandžasti akcent u dashboardu ili meniju, bira preset „pečena narandža“ (`tenant-narandza`, tamnija, sa belim tekstom).
- Fokus prsten je `focus` (periwinkle/kobalt), 2px sa odmakom od 2px, na svakom interaktivnom elementu. Plava je namerno različita od akcenta, pa se fokus vidi i na narandžastom dugmetu.
- Statusi: `success`, `warning`, `danger`, `info`, svaki sa `-subtle` pozadinom. Status se **uvek** piše rečju („Dostupno“, „Nema“), jer boja nikad ne nosi značenje sama.
- `brand-*` boje su samo za brend grafiku i blokove, nikad za tekst ili UI stanja.

## Tipografija

- **Onest** (sans) za sve, i **JetBrains Mono** za „račun“ glas. Oba su besplatna (Google Fonts) i imaju latinicu sa č ć š ž đ i ćirilicu.
- Hijerarhija: `display-xl/lg/md` samo brend i naziv lokala → `h1`–`h4` → `body-lg`, `body`, `body-strong`, `body-sm`.
- Mono stilovi: `eyebrow` (labele VELIKIM SLOVIMA, razmak 0.12em), `meta` (datumi, stolovi, alergeni), `price` i `price-lg` (cene).
- **Cene su uvek u mono fontu i poravnate desno**: `1.250 RSD`. Tačka razdvaja hiljade, bez decimala osim ako ih lokal koristi, a valuta ide posle broja.
- Datumi: `05.11.2026` ili u eyebrow stilu `ČET 05 NOV, 2026`. Vreme je 24h: `12:04`.
- Naslovi se pišu kao rečenica („Topli napici“), ne Title Case. VELIKA slova samo kroz `eyebrow` stil.

## Raspored i bento

- Mreža je na 4px; koriste se `space-1` … `space-24`.
- **Bento** (`r-bento`) ima 4 kolone na desktopu i 2 na telefonu, redove od 120px i razmak `space-4`. Na brend površinama pločice nose grafiku i krupne brojeve. U dashboardu bento je samo početni ekran (Pregled).
- Dashboard: sidebar `sidebar-width` (248px), topbar `topbar-height` (56px), sadržaj do `content-max-width`.
- Javni meni: jedna kolona do `menu-max-width` (640px), bočna margina `space-4` na telefonu, razmak između kategorija `space-12`. Traka kategorija (Chips) je sticky.
- Mete za dodir su najmanje `touch-min` (44px). Kontrole u javnom meniju i mobilnim aplikacijama su `control-lg`.

## Ivice, radijusi, senke

- Sistem je **ravan**: odvajanje rade ivice `border` (1px) i razlika površina. Senke postoje samo za plutajuće slojeve (`shadow-lg` za dijalog, meni, toast).
- Isprekidana linija (`1px dashed`) je potpis: koristi se između stavki menija i u Ticket kartici. U dashboard formama i tabelama linije su pune.
- Radijusi: `radius-xs` bedževi, `radius-sm` dugmad i polja, `radius-md` kartice i dijalozi, `radius-lg` bento i Ticket, `radius-pill` čipovi, prekidač i bušotina.

## Kretanje

Kratko i funkcionalno: `duration-fast` (120ms) za hover i prekidače, `duration-base` za menije i tabove, `duration-slow` za dijalog i sheet. Nema poskakivanja ni paralakse u dashboardu i meniju. Animacija brend grafike je posebna tema.

## Ikonografija

Sistem još nema sopstveni set ikona. Do odluke koristi jedan linijski set sa debljinom 1.5px (npr. Lucide ili Phosphor „regular“) u veličinama 16/18/20px, u boji teksta pored kojeg stoje. Bez emotikona u interfejsu. Alergeni i dijetalne oznake se pišu tekstom (Tag), ne ikonama, dok se ne napravi namenski set.

## Slike i brend grafika

- Brend grafika je generisani Bauhaus uzorak (vidi „Brend i POS“). Fotografije i ilustracije ne zamenjuju uzorak; one su sadržaj lokala.
- Fotografije stavki menija: odnos 4:3, `radius-lg`, bez okvira i senke. Ako slike nema, stavka se prikazuje bez praznog placeholdera.
- Efekti zrna i zamućenja se isporučuju kao gotove slike, ne kao CSS filteri (performanse na telefonu).

## Ton i tekst

- Dashboard se obraća menadžeru kratko, u imperativu: „Dodaj stavku“, „Sačuvaj“, „Objavi meni“. Greške kažu kako da se ispravi: „Unesi broj, npr. 250.“
- Javni meni ne govori umesto lokala. Sistemski tekst je minimalan: „Nema danas“, „Novo“, „Alergeni“.
- Bez uzvičnika, bez emotikona, bez marketinških superlativa u UI-ju.
- Latinica je podrazumevana; ćirilica mora da radi u svakom tekstu lokala (nazivi, opisi).

## Pristupačnost

- Tekst ≥4.5:1 na podlozi koju navodi njegov usage (provereno u obe teme). Ivice kontrola, fokus i ikone ≥3:1.
- Svaki status ima reč, svako polje labelu, a svaki dijalog naslov.
- Javni meni mora biti čitljiv na ekranu sa 50% osvetljenja u polumračnom baru. Zato je tamna tema menija pun građanin, a ne dodatak.

## Implementacija

- `tokens.json` je izvor istine. Za Angular se pretvara u CSS varijable (`tokens.css`, iste vrednosti kao ovde). Za native aplikacije isti fajl ide kroz Style Dictionary (ili sličan alat) u Swift/Kotlin/Dart/JS konstante.
- Komponente su čiste CSS klase sa prefiksom `r-` (`components/bundle.css`), bez JavaScript-a. U Angularu ih omotaj sopstvenim komponentama; klase ostaju iste.
- Tema se uključuje sa `data-theme="light"` / `"dark"` na korenu, a tenant preset klasom `r-tenant-<ključ>` na omotaču javnog menija.
