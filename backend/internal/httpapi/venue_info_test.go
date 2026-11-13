package httpapi_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestVenueOpeningHoursValidation(t *testing.T) {
	needDB(t)
	a := register(t, "Hours")
	id := createVenue(t, a, "Kafana")
	patch := func(hours any) resp {
		return call(t, "PATCH", "/v1/venues/"+id, a.access, map[string]any{"opening_hours": hours})
	}
	for name, bad := range map[string]any{
		"unknown day":     map[string]any{"monday": [][]string{{"08:00", "23:00"}}},
		"old string form": map[string]any{"mon": []string{"08:00-23:00"}},
		"bad time":        map[string]any{"mon": [][]string{{"8:00", "23:00"}}},
		"24:00":           map[string]any{"mon": [][]string{{"08:00", "24:00"}}},
		"same time":       map[string]any{"mon": [][]string{{"08:00", "08:00"}}},
		"one value":       map[string]any{"mon": [][]string{{"08:00"}}},
		"too many":        map[string]any{"mon": [][]string{{"01:00", "02:00"}, {"03:00", "04:00"}, {"05:00", "06:00"}, {"07:00", "08:00"}}},
		"array":           []any{},
	} {
		if r := patch(bad); r.status != http.StatusUnprocessableEntity {
			t.Errorf("%s: status %d, want 422", name, r.status)
		}
	}

	// Closed days are dropped; past midnight is fine.
	r := patch(map[string]any{
		"sun": [][]string{{"10:00", "22:00"}},
		"fri": [][]string{{"08:00", "15:00"}, {"17:00", "01:00"}},
		"tue": [][]string{},
	})
	expect(t, r, http.StatusOK)
	hours := r.body["opening_hours"].(map[string]any)
	if len(hours) != 2 || len(hours["fri"].([]any)) != 2 {
		t.Fatalf("opening_hours: %v", hours)
	}
	// {} clears it.
	r = patch(map[string]any{})
	expect(t, r, http.StatusOK)
	if len(r.body["opening_hours"].(map[string]any)) != 0 {
		t.Fatalf("cleared opening_hours: %v", r.body["opening_hours"])
	}
}

func TestVenueWifi(t *testing.T) {
	needDB(t)
	a := register(t, "Wifi")
	id := createVenue(t, a, "Bašta")
	r := call(t, "GET", "/v1/venues/"+id, a.access, nil)
	expect(t, r, http.StatusOK)
	if r.body["wifi_available"] != false || r.body["wifi_access"] != "staff" || r.body["wifi_ssid"] != "" {
		t.Fatalf("defaults: %v", r.body)
	}

	// On without a name is refused, also across separate PATCHes.
	expect(t, call(t, "PATCH", "/v1/venues/"+id, a.access, map[string]any{"wifi_available": true}), http.StatusUnprocessableEntity)
	expect(t, call(t, "PATCH", "/v1/venues/"+id, a.access, map[string]any{"wifi_available": true, "wifi_ssid": "  "}), http.StatusUnprocessableEntity)
	expect(t, call(t, "PATCH", "/v1/venues/"+id, a.access, map[string]any{"wifi_access": "qr"}), http.StatusUnprocessableEntity)
	expect(t, call(t, "PATCH", "/v1/venues/"+id, a.access, map[string]any{"wifi_ssid": "this-network-name-is-way-too-long-for-wifi"}), http.StatusUnprocessableEntity)
	expect(t, call(t, "POST", "/v1/venues", a.access, map[string]any{"name": "x", "wifi_available": true}), http.StatusUnprocessableEntity)

	r = call(t, "PATCH", "/v1/venues/"+id, a.access, map[string]any{
		"wifi_available": true, "wifi_ssid": " Basta-Guest ", "wifi_password": " tajna 123", "wifi_access": "menu",
	})
	expect(t, r, http.StatusOK)
	if r.body["wifi_ssid"] != "Basta-Guest" || r.body["wifi_password"] != " tajna 123" || r.body["wifi_access"] != "menu" {
		t.Fatalf("wifi: %v", r.body)
	}
	// Turning it off keeps the name so it can be turned back on.
	r = call(t, "PATCH", "/v1/venues/"+id, a.access, map[string]any{"wifi_available": false})
	expect(t, r, http.StatusOK)
	if r.body["wifi_ssid"] != "Basta-Guest" {
		t.Fatalf("ssid after off: %v", r.body)
	}
}

func TestPublicMenuVenueInfo(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access
	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/publish", tok, nil), http.StatusOK)
	path := "/v1/public/menus/" + tenantSlug(t, f.owner) + "/" + venueSlug(t, f.owner, f.venue)
	venue := func() map[string]any {
		r := call(t, "GET", path, "", nil)
		expect(t, r, http.StatusOK)
		return r.body["venue"].(map[string]any)
	}

	v := venue()
	if v["wifi"] != nil || len(v["opening_hours"].(map[string]any)) != 0 {
		t.Fatalf("no info yet: %v", v)
	}

	expect(t, call(t, "PATCH", "/v1/venues/"+f.venue, tok, map[string]any{
		"opening_hours":  map[string]any{"mon": [][]string{{"08:00", "23:00"}}},
		"wifi_available": true, "wifi_ssid": "Gost", "wifi_password": "lozinka1", "wifi_access": "staff",
	}), http.StatusOK)
	v = venue()
	wifi := v["wifi"].(map[string]any)
	if wifi["ssid"] != "Gost" || wifi["password"] != "" || wifi["access"] != "staff" {
		t.Fatalf("staff wifi must hide the password: %v", wifi)
	}
	if len(v["opening_hours"].(map[string]any)["mon"].([]any)) != 1 {
		t.Fatalf("opening_hours: %v", v["opening_hours"])
	}

	expect(t, call(t, "PATCH", "/v1/venues/"+f.venue, tok, map[string]any{"wifi_access": "menu"}), http.StatusOK)
	if w := venue()["wifi"].(map[string]any); w["password"] != "lozinka1" {
		t.Fatalf("menu wifi shows the password: %v", w)
	}
}

func TestVenueSEOFields(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access
	path := "/v1/venues/" + f.venue

	r := call(t, "GET", path, tok, nil)
	expect(t, r, http.StatusOK)
	if r.body["venue_type"] != "other" || r.body["country"] != "RS" || r.body["latitude"] != nil || len(r.body["cuisine"].([]any)) != 0 {
		t.Fatalf("defaults: %v", r.body)
	}

	for _, bad := range []map[string]any{
		{"venue_type": "hotel"},
		{"country": "Srbija"},
		{"latitude": 44.8},
		{"latitude": 44.8, "longitude": nil},
		{"latitude": 91, "longitude": 20},
		{"latitude": "44.8", "longitude": "20.4"},
		{"cuisine": []string{"a", "b", "c", "d", "e", "f"}},
		{"description": strings.Repeat("š", 301)},
	} {
		expect(t, call(t, "PATCH", path, tok, bad), http.StatusUnprocessableEntity)
	}

	r = call(t, "PATCH", path, tok, map[string]any{
		"venue_type": "cafe", "address": " Knez Mihailova 1 ", "city": " Beograd ", "postal_code": "11000", "country": "rs",
		"latitude": 44.8176, "longitude": 20.4569,
		"cuisine": []string{" Kafa ", "kafa", "", "Kolači"}, "description": " Kafa i kolači u centru. ",
	})
	expect(t, r, http.StatusOK)
	if r.body["venue_type"] != "cafe" || r.body["city"] != "Beograd" || r.body["country"] != "RS" ||
		r.body["latitude"] != 44.8176 || r.body["longitude"] != 20.4569 ||
		fmt.Sprint(r.body["cuisine"]) != "[Kafa Kolači]" || r.body["description"] != "Kafa i kolači u centru." {
		t.Fatalf("saved: %v", r.body)
	}

	// Another field alone leaves the coordinates; two nulls clear them.
	r = call(t, "PATCH", path, tok, map[string]any{"city": "Novi Sad"})
	expect(t, r, http.StatusOK)
	if r.body["latitude"] != 44.8176 {
		t.Fatalf("coordinates lost: %v", r.body)
	}

	// Guests (and crawlers) get them with the public menu.
	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/publish", tok, nil), http.StatusOK)
	pub := call(t, "GET", "/v1/public/menus/"+tenantSlug(t, f.owner)+"/"+venueSlug(t, f.owner, f.venue), "", nil)
	expect(t, pub, http.StatusOK)
	venue := pub.body["venue"].(map[string]any)
	if venue["type"] != "cafe" || venue["city"] != "Novi Sad" || venue["postal_code"] != "11000" || venue["country"] != "RS" ||
		venue["latitude"] != 44.8176 || fmt.Sprint(venue["cuisine"]) != "[Kafa Kolači]" || venue["description"] != "Kafa i kolači u centru." {
		t.Fatalf("public venue: %v", venue)
	}

	r = call(t, "PATCH", path, tok, map[string]any{"latitude": nil, "longitude": nil})
	expect(t, r, http.StatusOK)
	if r.body["latitude"] != nil || r.body["longitude"] != nil {
		t.Fatalf("coordinates not cleared: %v", r.body)
	}
}
