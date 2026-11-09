package httpapi_test

import (
	"net/http"
	"testing"
	"time"
)

func comboBody(f menuFixture) map[string]any {
	return map[string]any{
		"name": "Burger meni", "price_minor": 100000, "is_featured": true,
		"translations": map[string]any{"en": map[string]string{"name": "Burger combo"}},
		"slots": []map[string]any{
			{"options": []map[string]any{{"item_id": f.burger}}},
			{"label": "Pivo po izboru", "translations": map[string]any{"en": map[string]string{"label": "Beer of choice"}},
				"options": []map[string]any{
					{"item_id": f.beer, "variant_id": f.beerLarge},
					{"item_id": f.beer, "variant_id": f.beerSmall},
				}},
		},
	}
}

func TestPromotionCRUDAndSavings(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access

	r := call(t, "POST", "/v1/venues/"+f.venue+"/promotions", tok, comboBody(f))
	expect(t, r, http.StatusCreated)
	promo := id(r)
	// 890,00 burger + cheapest beer 250,00 = 1140,00; combo 1000,00.
	if r.body["regular_price_minor"].(float64) != 114000 || r.body["savings_minor"].(float64) != 14000 ||
		r.body["status"] != "live" || r.body["type"] != "combo" || r.body["is_active"] != true {
		t.Fatalf("created: %v", r.body)
	}
	slots := r.body["slots"].([]any)
	if len(slots) != 2 || len(slots[1].(map[string]any)["options"].([]any)) != 2 {
		t.Fatalf("slots: %v", slots)
	}

	future := time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
	past := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	r = call(t, "PATCH", "/v1/promotions/"+promo, tok, map[string]any{"starts_at": future})
	expect(t, r, http.StatusOK)
	if r.body["status"] != "scheduled" {
		t.Fatalf("status: %v", r.body["status"])
	}
	r = call(t, "PATCH", "/v1/promotions/"+promo, tok, map[string]any{"starts_at": nil, "ends_at": past})
	expect(t, r, http.StatusOK)
	if r.body["status"] != "expired" || r.body["starts_at"] != nil {
		t.Fatalf("status: %v", r.body)
	}
	r = call(t, "PATCH", "/v1/promotions/"+promo, tok, map[string]any{"ends_at": nil, "price_minor": 120000})
	expect(t, r, http.StatusOK)
	if r.body["status"] != "live" || r.body["savings_minor"].(float64) != 0 || r.body["name"] != "Burger meni" {
		t.Fatalf("after patch: %v", r.body)
	}
	r = call(t, "PATCH", "/v1/promotions/"+promo, tok, map[string]any{"slots": []map[string]any{
		{"quantity": 2, "options": []map[string]any{{"item_id": f.burger}}},
	}})
	expect(t, r, http.StatusOK)
	if r.body["regular_price_minor"].(float64) != 178000 || len(r.body["slots"].([]any)) != 1 {
		t.Fatalf("slots replaced: %v", r.body)
	}

	// Validation.
	other := newMenuFixture(t)
	bad := []map[string]any{
		{"name": "X", "price_minor": 1},
		{"name": "X", "price_minor": -1, "slots": comboBody(f)["slots"]},
		{"name": "X", "price_minor": 1, "slots": []map[string]any{}},
		{"name": "X", "price_minor": 1, "slots": []map[string]any{{"options": []map[string]any{{"item_id": other.burger}}}}},
		{"name": "X", "price_minor": 1, "slots": []map[string]any{{"options": []map[string]any{{"item_id": f.burger, "variant_id": f.beerSmall}}}}},
		{"name": "X", "price_minor": 1, "slots": []map[string]any{{"options": []map[string]any{{"item_id": f.burger}, {"item_id": f.burger}}}}},
		{"name": "X", "price_minor": 1, "starts_at": future, "ends_at": past, "slots": comboBody(f)["slots"]},
	}
	for i, b := range bad {
		r = call(t, "POST", "/v1/venues/"+f.venue+"/promotions", tok, b)
		if r.status != http.StatusUnprocessableEntity {
			t.Errorf("bad[%d]: status %d %v", i, r.status, r.body)
		}
	}
	r = call(t, "PATCH", "/v1/promotions/"+promo, tok, map[string]any{"starts_at": future, "ends_at": past})
	expect(t, r, http.StatusUnprocessableEntity)

	// Order and delete.
	r = call(t, "POST", "/v1/venues/"+f.venue+"/promotions", tok, comboBody(f))
	expect(t, r, http.StatusCreated)
	second := id(r)
	r = call(t, "PUT", "/v1/venues/"+f.venue+"/promotions/order", tok, map[string]any{"ids": []string{second, promo}})
	expect(t, r, http.StatusOK)
	if items := r.body["items"].([]any); items[0].(map[string]any)["id"] != second {
		t.Fatalf("order: %v", items)
	}
	r = call(t, "PUT", "/v1/venues/"+f.venue+"/promotions/order", tok, map[string]any{"ids": []string{second}})
	expect(t, r, http.StatusUnprocessableEntity)
	r = call(t, "DELETE", "/v1/promotions/"+second, tok, nil)
	expect(t, r, http.StatusNoContent)
	r = call(t, "GET", "/v1/promotions/"+second, tok, nil)
	expect(t, r, http.StatusNotFound)

	// Deleting an item removes it from slots.
	r = call(t, "DELETE", "/v1/items/"+f.burger, tok, nil)
	expect(t, r, http.StatusNoContent)
	r = call(t, "GET", "/v1/promotions/"+promo, tok, nil)
	expect(t, r, http.StatusOK)
	if opts := r.body["slots"].([]any)[0].(map[string]any)["options"].([]any); len(opts) != 0 {
		t.Fatalf("options after delete: %v", opts)
	}
}

func TestPublicMenuPromotions(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access
	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/publish", tok, nil), http.StatusOK)
	expect(t, call(t, "PATCH", "/v1/menus/"+f.menu, tok, map[string]any{"languages": []map[string]string{{"code": "en", "name": "English"}}}), http.StatusOK)
	path := "/v1/public/menus/" + tenantSlug(t, f.owner) + "/" + venueSlug(t, f.owner, f.venue)

	r := call(t, "POST", "/v1/venues/"+f.venue+"/promotions", tok, comboBody(f))
	expect(t, r, http.StatusCreated)
	promo := id(r)
	off := comboBody(f)
	off["is_active"] = false
	expect(t, call(t, "POST", "/v1/venues/"+f.venue+"/promotions", tok, off), http.StatusCreated)

	public := func(query string) []any {
		t.Helper()
		r := call(t, "GET", path+query, "", nil)
		expect(t, r, http.StatusOK)
		return r.body["promotions"].([]any)
	}
	ps := public("?lang=en")
	if len(ps) != 1 {
		t.Fatalf("promotions: %v", ps)
	}
	p := ps[0].(map[string]any)
	slot := p["slots"].([]any)[1].(map[string]any)
	if p["name"] != "Burger combo" || p["savings_minor"].(float64) != 14000 || p["is_featured"] != true ||
		p["is_available"] != true || slot["label"] != "Beer of choice" || slot["options"].([]any)[0].(map[string]any)["variant_label"] != "0.5 l" {
		t.Fatalf("public promotion: %v", p)
	}

	// An unavailable burger makes the combo unavailable; a hidden one hides it.
	expect(t, call(t, "PATCH", "/v1/items/"+f.burger+"/status", tok, map[string]any{"is_available": false}), http.StatusOK)
	if p := public("")[0].(map[string]any); p["is_available"] != false {
		t.Fatalf("expected unavailable: %v", p)
	}
	expect(t, call(t, "PATCH", "/v1/items/"+f.burger+"/status", tok, map[string]any{"is_visible": false}), http.StatusOK)
	if ps := public(""); len(ps) != 0 {
		t.Fatalf("expected hidden: %v", ps)
	}
	expect(t, call(t, "PATCH", "/v1/items/"+f.burger+"/status", tok, map[string]any{"is_visible": true, "is_available": true}), http.StatusOK)

	expect(t, call(t, "PATCH", "/v1/promotions/"+promo, tok, map[string]any{"is_active": false}), http.StatusOK)
	if ps := public(""); len(ps) != 0 {
		t.Fatalf("expected none: %v", ps)
	}
}

func TestPromotionRolesAndIsolation(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	r := call(t, "POST", "/v1/venues/"+f.venue+"/promotions", f.owner.access, comboBody(f))
	expect(t, r, http.StatusCreated)
	promo := id(r)

	staff := addMember(t, f.owner, register(t, "Promo Staff"), "staff")
	expect(t, call(t, "GET", "/v1/promotions/"+promo, staff, nil), http.StatusOK)
	expect(t, call(t, "POST", "/v1/venues/"+f.venue+"/promotions", staff, comboBody(f)), http.StatusForbidden)
	expect(t, call(t, "PATCH", "/v1/promotions/"+promo, staff, map[string]any{"is_active": false}), http.StatusForbidden)
	expect(t, call(t, "DELETE", "/v1/promotions/"+promo, staff, nil), http.StatusForbidden)

	other := register(t, "Promo Intruder")
	expect(t, call(t, "GET", "/v1/promotions/"+promo, other.access, nil), http.StatusNotFound)
	expect(t, call(t, "GET", "/v1/venues/"+f.venue+"/promotions", other.access, nil), http.StatusNotFound)
	expect(t, call(t, "PATCH", "/v1/promotions/"+promo, other.access, map[string]any{"is_active": false}), http.StatusNotFound)
	expect(t, call(t, "DELETE", "/v1/promotions/"+promo, other.access, nil), http.StatusNotFound)
	// Another tenant cannot point its own combo at this tenant's items.
	otherVenue := createVenue(t, other, "X")
	r = call(t, "POST", "/v1/venues/"+otherVenue+"/promotions", other.access, comboBody(f))
	expect(t, r, http.StatusUnprocessableEntity)
}
