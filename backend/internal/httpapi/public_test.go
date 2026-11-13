package httpapi_test

import (
	"io"
	"net/http"
	"testing"
)

func tenantSlug(t *testing.T, a account) string {
	t.Helper()
	me := call(t, "GET", "/v1/me", a.access, nil)
	expect(t, me, http.StatusOK)
	return me.body["tenant"].(map[string]any)["slug"].(string)
}

func venueSlug(t *testing.T, a account, venueID string) string {
	t.Helper()
	v := call(t, "GET", "/v1/venues/"+venueID, a.access, nil)
	expect(t, v, http.StatusOK)
	return v.body["slug"].(string)
}

func TestPublicMenu(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access
	ts, vs := tenantSlug(t, f.owner), venueSlug(t, f.owner, f.venue)
	path := "/v1/public/menus/" + ts + "/" + vs

	// Draft only: nothing public yet.
	r := call(t, "GET", path, "", nil)
	expect(t, r, http.StatusNotFound)
	if errCode(r) != "not_found" {
		t.Fatalf("code = %q", errCode(r))
	}
	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/publish", tok, nil), http.StatusOK)

	// A hidden category, a hidden item and an unavailable item.
	r = call(t, "POST", "/v1/menus/"+f.menu+"/categories", tok, map[string]any{"name": "Tajno", "is_visible": false})
	expect(t, r, http.StatusCreated)
	r = call(t, "POST", "/v1/categories/"+f.drinks+"/items", tok, map[string]any{"name": "Skriveno", "price_minor": 1, "is_visible": false})
	expect(t, r, http.StatusCreated)
	r = call(t, "POST", "/v1/categories/"+f.drinks+"/items", tok, map[string]any{"name": "Sok", "price_minor": 20000})
	expect(t, r, http.StatusCreated)
	expect(t, call(t, "PATCH", "/v1/items/"+f.beer+"/status", tok, map[string]bool{"is_available": false}), http.StatusOK)

	r = call(t, "GET", path, "", nil)
	expect(t, r, http.StatusOK)
	if r.body["tenant"].(map[string]any)["slug"] != ts || r.body["venue"].(map[string]any)["currency"] != "RSD" {
		t.Fatalf("header: %v %v", r.body["tenant"], r.body["venue"])
	}
	cats := r.body["menu"].(map[string]any)["categories"].([]any)
	if len(cats) != 2 {
		t.Fatalf("want 2 visible categories, got %d", len(cats))
	}
	drinks := cats[0].(map[string]any)
	if drinks["name"] != "Pića" {
		t.Fatalf("first category: %v", drinks["name"])
	}
	items := drinks["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("want 2 visible drinks, got %v", items)
	}
	// Unavailable beer (position 0) goes after the available juice.
	if items[0].(map[string]any)["name"] != "Sok" || items[1].(map[string]any)["name"] != "Pivo" || items[1].(map[string]any)["is_available"] != false {
		t.Fatalf("item order: %v", items)
	}
	beer := items[1].(map[string]any)
	if v := beer["variants"].([]any); len(v) != 2 || v[1].(map[string]any)["label"] != "0,5 l" {
		t.Fatalf("variants: %v", v)
	}
	if _, ok := beer["position"]; ok {
		t.Fatal("public payload leaks admin fields")
	}

	// Only Serbian until the menu offers more: ?lang=en is served as sr.
	if langs := r.body["languages"].([]any); len(langs) != 1 || langs[0].(map[string]any)["code"] != "sr" {
		t.Fatalf("languages: %v", langs)
	}
	r = call(t, "GET", path+"?lang=en", "", nil)
	expect(t, r, http.StatusOK)
	if r.body["lang"] != "sr" || r.body["menu"].(map[string]any)["categories"].([]any)[0].(map[string]any)["name"] != "Pića" {
		t.Fatalf("lang=en without en offered: %v", r.body["lang"])
	}

	// Languages: validated, sr is implicit.
	for _, bad := range []any{
		[]map[string]string{{"code": "sr", "name": "Srpski"}},
		[]map[string]string{{"code": "EN!", "name": "English"}},
		[]map[string]string{{"code": "en", "name": ""}},
		[]map[string]string{{"code": "en", "name": "English"}, {"code": "en", "name": "Eng"}},
	} {
		expect(t, call(t, "PATCH", "/v1/menus/"+f.menu, tok, map[string]any{"languages": bad}), http.StatusUnprocessableEntity)
	}
	r = call(t, "PATCH", "/v1/menus/"+f.menu, tok, map[string]any{"languages": []map[string]string{
		{"code": " EN ", "name": "English"}, {"code": "de", "name": "Deutsch"},
	}})
	expect(t, r, http.StatusOK)
	if r.body["name"] == "" || len(r.body["languages"].([]any)) != 2 || r.body["languages"].([]any)[0].(map[string]any)["code"] != "en" {
		t.Fatalf("update languages: %v", r.body)
	}
	expect(t, call(t, "PATCH", "/v1/menus/"+f.menu, tok, map[string]any{}), http.StatusUnprocessableEntity)

	// A custom language with its own translation.
	expect(t, call(t, "PATCH", "/v1/categories/"+f.drinks, tok, map[string]any{
		"translations": map[string]any{"en": map[string]string{"name": "Drinks"}, "de": map[string]string{"name": "Getränke"}},
	}), http.StatusOK)
	r = call(t, "GET", path+"?lang=de", "", nil)
	expect(t, r, http.StatusOK)
	if r.body["lang"] != "de" || len(r.body["languages"].([]any)) != 3 ||
		r.body["menu"].(map[string]any)["categories"].([]any)[0].(map[string]any)["name"] != "Getränke" {
		t.Fatalf("lang=de: %v %v", r.body["lang"], r.body["languages"])
	}

	// English, with fallback to Serbian where nothing is translated.
	r = call(t, "GET", path+"?lang=en", "", nil)
	expect(t, r, http.StatusOK)
	cats = r.body["menu"].(map[string]any)["categories"].([]any)
	if cats[0].(map[string]any)["name"] != "Drinks" || cats[1].(map[string]any)["name"] != "Hrana" {
		t.Fatalf("lang=en names: %v / %v", cats[0].(map[string]any)["name"], cats[1].(map[string]any)["name"])
	}
	beerEN := cats[0].(map[string]any)["items"].([]any)[1].(map[string]any)
	if beerEN["variants"].([]any)[1].(map[string]any)["label"] != "0.5 l" {
		t.Fatalf("variant label en: %v", beerEN["variants"])
	}
	expect(t, call(t, "GET", path+"?lang=english", "", nil), http.StatusUnprocessableEntity)

	// Caching headers and conditional GET.
	res, err := http.Get(srv.URL + path)
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, res.Body)
	res.Body.Close()
	etag := res.Header.Get("ETag")
	if etag == "" || res.Header.Get("Cache-Control") == "" {
		t.Fatalf("missing cache headers: %v", res.Header)
	}
	req, _ := http.NewRequest("GET", srv.URL+path, nil)
	req.Header.Set("If-None-Match", etag)
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusNotModified {
		t.Fatalf("conditional GET: %d", res.StatusCode)
	}
	// A price change produces a new ETag.
	expect(t, call(t, "PATCH", "/v1/variants/"+f.burgerVariant, tok, map[string]any{"price_minor": 1}), http.StatusOK)
	res, _ = http.DefaultClient.Do(req)
	res.Body.Close()
	if res.StatusCode != http.StatusOK || res.Header.Get("ETag") == etag {
		t.Fatalf("after price change: status %d, etag unchanged=%v", res.StatusCode, res.Header.Get("ETag") == etag)
	}

	// Unpublish hides it again.
	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/unpublish", tok, nil), http.StatusOK)
	expect(t, call(t, "GET", path, "", nil), http.StatusNotFound)
}

func TestPublicMenuNotFoundAndIsolation(t *testing.T) {
	needDB(t)
	a, b := newMenuFixture(t), newMenuFixture(t)
	expect(t, call(t, "POST", "/v1/menus/"+a.menu+"/publish", a.owner.access, nil), http.StatusOK)
	expect(t, call(t, "POST", "/v1/menus/"+b.menu+"/publish", b.owner.access, nil), http.StatusOK)
	ta, tb := tenantSlug(t, a.owner), tenantSlug(t, b.owner)
	vb := venueSlug(t, b.owner, b.venue)

	expect(t, call(t, "GET", "/v1/public/menus/"+tb+"/"+vb, "", nil), http.StatusOK)
	expect(t, call(t, "GET", "/v1/public/menus/no-such-tenant/"+vb, "", nil), http.StatusNotFound)
	expect(t, call(t, "GET", "/v1/public/menus/"+tb+"/no-such-venue", "", nil), http.StatusNotFound)
	// B's venue slug under A's subdomain must not resolve to B's venue.
	// (Both fixtures use random venue slugs, so A has no venue with B's slug.)
	expect(t, call(t, "GET", "/v1/public/menus/"+ta+"/"+vb, "", nil), http.StatusNotFound)
}

func TestPublicTenant(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	ts, vs := tenantSlug(t, f.owner), venueSlug(t, f.owner, f.venue)
	path := "/v1/public/tenants/" + ts

	// Known tenant, nothing published: no venues to list.
	r := call(t, "GET", path, "", nil)
	expect(t, r, http.StatusOK)
	if n := len(r.body["venues"].([]any)); n != 0 {
		t.Fatalf("want no venues before publish, got %d", n)
	}
	expect(t, call(t, "GET", "/v1/public/tenants/nema-ga", "", nil), http.StatusNotFound)

	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/publish", f.owner.access, nil), http.StatusOK)
	r = call(t, "GET", path, "", nil)
	expect(t, r, http.StatusOK)
	venues := r.body["venues"].([]any)
	if len(venues) != 1 {
		t.Fatalf("want 1 venue, got %d", len(venues))
	}
	v := venues[0].(map[string]any)
	if v["slug"] != vs || v["languages"].([]any)[0] != "sr" || v["updated_at"] == "" {
		t.Fatalf("venue: %v", v)
	}
	if r.body["tenant"].(map[string]any)["slug"] != ts {
		t.Fatalf("tenant: %v", r.body["tenant"])
	}
}
