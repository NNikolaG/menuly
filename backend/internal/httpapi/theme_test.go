package httpapi_test

import (
	"net/http"
	"testing"
)

func TestMenuTheme(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access
	path := "/v1/menus/" + f.menu + "/theme"

	// No saved theme: defaults.
	r := call(t, "GET", path, tok, nil)
	expect(t, r, http.StatusOK)
	if r.body["template"] != "racun" || r.body["accent"] != "tinta" || r.body["color_mode"] != "auto" || r.body["show_images"] != true {
		t.Fatalf("defaults = %v", r.body)
	}

	// Partial update keeps the other fields.
	r = call(t, "PUT", path, tok, map[string]any{"template": "galerija", "accent": "bordo", "show_pattern": false})
	expect(t, r, http.StatusOK)
	r = call(t, "PUT", path, tok, map[string]any{"font": "plex", "cover_url": " https://cdn.example.com/c.jpg "})
	expect(t, r, http.StatusOK)
	if r.body["template"] != "galerija" || r.body["accent"] != "bordo" || r.body["font"] != "plex" ||
		r.body["show_pattern"] != false || r.body["cover_url"] != "https://cdn.example.com/c.jpg" {
		t.Fatalf("merged = %v", r.body)
	}

	for _, bad := range []map[string]any{
		{"template": "neon"}, {"pattern": "zigzag"}, {"accent": "#ff0000"}, {"font": "comic"}, {"color_mode": "sepia"}, {"logo_url": "javascript:alert(1)"},
	} {
		r = call(t, "PUT", path, tok, bad)
		expect(t, r, http.StatusUnprocessableEntity)
	}

	// Every template is accepted by the API and the table check.
	for _, tpl := range []string{"racun", "tabla", "etiketa", "plakat", "galerija"} {
		r = call(t, "PUT", path, tok, map[string]any{"template": tpl})
		expect(t, r, http.StatusOK)
		if r.body["template"] != tpl {
			t.Fatalf("template = %v, want %s", r.body["template"], tpl)
		}
	}

	// Pattern band: bauhaus by default, trake on request, kept by later partial updates.
	if r.body["pattern"] != "bauhaus" {
		t.Fatalf("default pattern = %v", r.body["pattern"])
	}
	r = call(t, "PUT", path, tok, map[string]any{"pattern": "mozaik"})
	expect(t, r, http.StatusOK)
	r = call(t, "PUT", path, tok, map[string]any{"pattern": "trake"})
	expect(t, r, http.StatusOK)
	r = call(t, "PUT", path, tok, map[string]any{"accent": "bordo"})
	if r.body["pattern"] != "trake" || r.body["template"] != "galerija" {
		t.Fatalf("pattern kept = %v", r.body)
	}

	// Staff reads, cannot write; another tenant sees nothing.
	staff := addMember(t, f.owner, register(t, "theme staff"), "staff")
	expect(t, call(t, "GET", path, staff, nil), http.StatusOK)
	expect(t, call(t, "PUT", path, staff, map[string]any{"template": "tabla"}), http.StatusForbidden)
	other := register(t, "Other tenant")
	expect(t, call(t, "GET", path, other.access, nil), http.StatusNotFound)
	expect(t, call(t, "PUT", path, other.access, map[string]any{"template": "tabla"}), http.StatusNotFound)

	// The public menu carries the theme.
	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/publish", tok, nil), http.StatusOK)
	pub := call(t, "GET", "/v1/public/menus/"+tenantSlug(t, f.owner)+"/"+venueSlug(t, f.owner, f.venue), "", nil)
	expect(t, pub, http.StatusOK)
	th := pub.body["theme"].(map[string]any)
	if th["template"] != "galerija" || th["accent"] != "bordo" || th["font"] != "plex" {
		t.Fatalf("public theme = %v", th)
	}
}
