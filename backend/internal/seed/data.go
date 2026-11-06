package seed

type category struct {
	name, en string
	items    []item
}

type item struct {
	name, desc, en, enDesc string
	tags, allergens        []string
	unavailable            bool
	variants               []variant
}

type variant struct {
	label, en string
	rsd       int64 // whole dinars; stored as para (×100)
}

func price(rsd int64) []variant { return []variant{{rsd: rsd}} }

// demoMenu is a typical Belgrade kafana menu: single prices, sizes, one
// unavailable item and English translations on most rows.
var demoMenu = []category{
	{name: "Topli napici", en: "Hot drinks", items: []item{
		{name: "Espresso", en: "Espresso", variants: price(160)},
		{name: "Domaća kafa", desc: "Kuvana, sa ratlukom", en: "Turkish coffee", enDesc: "Brewed, served with Turkish delight", variants: price(150)},
		{name: "Kapućino", en: "Cappuccino", allergens: []string{"mleko"}, variants: price(220)},
		{name: "Čaj", desc: "Nana, kamilica ili zeleni", en: "Tea", enDesc: "Mint, chamomile or green", variants: price(180)},
	}},
	{name: "Bezalkoholna pića", en: "Soft drinks", items: []item{
		{name: "Coca-Cola", en: "Coca-Cola", variants: []variant{{"0,25 l", "0.25 l", 220}, {"0,33 l", "0.33 l", 260}}},
		{name: "Ceđena pomorandža", en: "Fresh orange juice", tags: []string{"sveže"}, variants: price(350)},
		{name: "Kisela voda", en: "Sparkling water", variants: []variant{{"0,33 l", "0.33 l", 180}, {"0,75 l", "0.75 l", 320}}},
	}},
	{name: "Pivo i vino", en: "Beer and wine", items: []item{
		{name: "Točeno pivo", en: "Draught beer", allergens: []string{"gluten"}, variants: []variant{{"0,3 l", "0.3 l", 260}, {"0,5 l", "0.5 l", 340}}},
		{name: "Vranac", desc: "Crno vino, Crna Gora", en: "Vranac", enDesc: "Red wine, Montenegro", variants: []variant{{"0,1 l", "0.1 l", 300}, {"boca 0,75 l", "bottle 0.75 l", 1900}}},
		{name: "Craft IPA", desc: "Lokalna pivara", en: "Craft IPA", enDesc: "Local brewery", allergens: []string{"gluten"}, unavailable: true, variants: price(450)},
	}},
	{name: "Doručak", en: "Breakfast", items: []item{
		{name: "Omlet sa šunkom i sirom", en: "Ham and cheese omelette", allergens: []string{"jaja", "mleko"}, variants: price(520)},
		{name: "Proja sa kajmakom", en: "Cornbread with kajmak", tags: []string{"vegetarijansko"}, allergens: []string{"mleko", "jaja"}, variants: price(480)},
	}},
	{name: "Glavna jela", en: "Mains", items: []item{
		{name: "Ćevapi", desc: "Sa lepinjom, lukom i ajvarom", en: "Ćevapi", enDesc: "With flatbread, onion and ajvar", allergens: []string{"gluten"},
			variants: []variant{{"5 kom", "5 pcs", 690}, {"10 kom", "10 pcs", 1190}}},
		{name: "Pljeskavica", desc: "Punjena kajmakom", en: "Stuffed burger patty", enDesc: "Filled with kajmak", allergens: []string{"mleko"}, variants: price(990)},
		{name: "Karađorđeva šnicla", en: "Karađorđe's schnitzel", allergens: []string{"gluten", "jaja", "mleko"}, tags: []string{"specijalitet kuće", "preporuka"}, variants: price(1450)},
		{name: "Grilovano povrće", en: "Grilled vegetables", tags: []string{"vegan"}, variants: price(650)},
	}},
	{name: "Deserti", en: "Desserts", items: []item{
		{name: "Palačinke", desc: "Nutela ili džem", en: "Crêpes", enDesc: "Nutella or jam", allergens: []string{"gluten", "jaja", "mleko"}, variants: price(420)},
		{name: "Baklava", en: "Baklava", allergens: []string{"gluten", "orašasti plodovi"}, variants: price(380)},
	}},
}
