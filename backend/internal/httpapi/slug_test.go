package httpapi

import "testing"

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Ćevapdžinica Đorđe":    "cevapdzinica-djordje",
		"Кафана Шуматовац":      "kafana-sumatovac",
		"  Bar & Grill -- 24h ": "bar-grill-24h",
		"Ljubičasti Šešir":      "ljubicasti-sesir",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}
