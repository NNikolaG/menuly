package httpapi_test

import (
	"net/http"
	"slices"
	"testing"

	"github.com/google/uuid"
)

func memberID(t *testing.T, owner account, email string) string {
	t.Helper()
	r := call(t, "GET", "/v1/members", owner.access, nil)
	expect(t, r, http.StatusOK)
	for _, m := range r.body["items"].([]any) {
		m := m.(map[string]any)
		if m["email"] == email {
			return m["user_id"].(string)
		}
	}
	t.Fatalf("no member %s", email)
	return ""
}

func venueIDs(t *testing.T, token string) []string {
	t.Helper()
	r := call(t, "GET", "/v1/venues", token, nil)
	expect(t, r, http.StatusOK)
	var out []string
	for _, v := range r.body["items"].([]any) {
		out = append(out, v.(map[string]any)["id"].(string))
	}
	return out
}

// Members limited to some venues (memberships.venue_ids) see and change only
// those, through every route. RLS (policy venue_access) does the filtering.
func TestVenueAccess(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t) // venue "Bar" with a menu, categories and items
	owner := f.owner
	other := createVenue(t, owner, "Bašta")
	expect(t, call(t, "POST", "/v1/venues/"+f.venue+"/promotions", owner.access, comboBody(f)), http.StatusCreated)

	staffAcc := register(t, "Staff Home")
	staff := addMember(t, owner, staffAcc, "staff")
	managerAcc := register(t, "Manager Home")
	manager := addMember(t, owner, managerAcc, "manager")
	staffID, managerID := memberID(t, owner, staffAcc.email), memberID(t, owner, managerAcc.email)

	// Unrestricted by default.
	if got := venueIDs(t, staff); len(got) != 2 {
		t.Fatalf("staff before: %v", got)
	}

	// Only the owner assigns venues, and only existing ones.
	expect(t, call(t, "PATCH", "/v1/members/"+staffID, manager, map[string]any{"venue_ids": []string{other}}), http.StatusForbidden)
	expect(t, call(t, "PATCH", "/v1/members/"+staffID, owner.access, map[string]any{}), http.StatusUnprocessableEntity)
	expect(t, call(t, "PATCH", "/v1/members/"+staffID, owner.access, map[string]any{"venue_ids": []string{uuid.NewString()}}), http.StatusUnprocessableEntity)
	expect(t, call(t, "PATCH", "/v1/members/"+staffID, owner.access, map[string]any{"venue_ids": []string{other, other}}), http.StatusNoContent)
	expect(t, call(t, "PATCH", "/v1/members/"+managerID, owner.access, map[string]any{"venue_ids": []string{f.venue}}), http.StatusNoContent)

	r := call(t, "GET", "/v1/members", owner.access, nil)
	for _, m := range r.body["items"].([]any) {
		m := m.(map[string]any)
		ids := m["venue_ids"].([]any)
		switch m["user_id"] {
		case staffID:
			if len(ids) != 1 || ids[0] != other {
				t.Fatalf("staff venue_ids: %v", ids)
			}
		case managerID:
			if len(ids) != 1 || ids[0] != f.venue {
				t.Fatalf("manager venue_ids: %v", ids)
			}
		default:
			if len(ids) != 0 {
				t.Fatalf("owner venue_ids: %v", ids)
			}
		}
	}
	me := call(t, "GET", "/v1/me", staff, nil)
	if ids := me.body["venue_ids"].([]any); len(ids) != 1 || ids[0] != other {
		t.Fatalf("me venue_ids: %v", me.body)
	}

	// The staff member now sees only Bašta, from their very next request.
	if got := venueIDs(t, staff); !slices.Equal(got, []string{other}) {
		t.Fatalf("staff venues: %v", got)
	}
	expect(t, call(t, "GET", "/v1/venues/"+other, staff, nil), http.StatusOK)
	for _, path := range []string{
		"/v1/venues/" + f.venue,
		"/v1/venues/" + f.venue + "/menus",
		"/v1/venues/" + f.venue + "/stats",
		"/v1/venues/" + f.venue + "/promotions",
		"/v1/venues/" + f.venue + "/imports",
		"/v1/venues/" + f.venue + "/qr",
		"/v1/menus/" + f.menu,
		"/v1/menus/" + f.menu + "/theme",
		"/v1/items/" + f.beer,
		"/v1/variants/" + f.beerSmall + "/price-history",
	} {
		expect(t, call(t, "GET", path, staff, nil), http.StatusNotFound)
	}
	expect(t, call(t, "PATCH", "/v1/items/"+f.beer+"/status", staff, map[string]any{"is_available": false}), http.StatusNotFound)

	// The manager works in Bar only: full editing there, nothing in Bašta.
	if got := venueIDs(t, manager); !slices.Equal(got, []string{f.venue}) {
		t.Fatalf("manager venues: %v", got)
	}
	expect(t, call(t, "PATCH", "/v1/items/"+f.beer, manager, map[string]any{"name": "Točeno pivo"}), http.StatusOK)
	expect(t, call(t, "POST", "/v1/venues/"+f.venue+"/menus", manager, map[string]string{"name": "Doručak"}), http.StatusCreated)
	expect(t, call(t, "POST", "/v1/venues/"+other+"/menus", manager, map[string]string{"name": "Doručak"}), http.StatusNotFound)
	expect(t, call(t, "PATCH", "/v1/venues/"+other, manager, map[string]string{"name": "X"}), http.StatusNotFound)
	r = call(t, "GET", "/v1/venues/"+f.venue+"/promotions", manager, nil)
	expect(t, r, http.StatusOK)
	if len(r.body["items"].([]any)) != 1 {
		t.Fatalf("manager promotions: %v", r.body)
	}

	// A limited manager invites only to their own venues.
	expect(t, call(t, "POST", "/v1/invitations", manager, map[string]any{"email": "a-" + uuid.NewString()[:6] + "@example.com", "role": "staff"}), http.StatusUnprocessableEntity)
	expect(t, call(t, "POST", "/v1/invitations", manager, map[string]any{"email": "b-" + uuid.NewString()[:6] + "@example.com", "role": "staff", "venue_ids": []string{other}}), http.StatusUnprocessableEntity)
	email := "c-" + uuid.NewString()[:6] + "@example.com"
	r = call(t, "POST", "/v1/invitations", manager, map[string]any{"email": email, "role": "staff", "venue_ids": []string{f.venue}})
	expect(t, r, http.StatusCreated)
	if ids := r.body["venue_ids"].([]any); len(ids) != 1 || ids[0] != f.venue {
		t.Fatalf("invite venue_ids: %v", r.body)
	}
	r = call(t, "POST", "/v1/auth/accept-invite", "", map[string]string{"token": mailToken(t, email), "name": "Novi", "password": "secret123"})
	expect(t, r, http.StatusOK)
	if got := venueIDs(t, r.body["access_token"].(string)); !slices.Equal(got, []string{f.venue}) {
		t.Fatalf("invited staff venues: %v", got)
	}

	// The owner always sees everything; the public menu is not affected.
	if got := venueIDs(t, owner.access); len(got) != 2 {
		t.Fatalf("owner venues: %v", got)
	}

	// Clearing the list gives access to every venue again.
	expect(t, call(t, "PATCH", "/v1/members/"+staffID, owner.access, map[string]any{"venue_ids": []string{}}), http.StatusNoContent)
	if got := venueIDs(t, staff); len(got) != 2 {
		t.Fatalf("staff after clear: %v", got)
	}
	// Role and venues change together.
	expect(t, call(t, "PATCH", "/v1/members/"+staffID, owner.access, map[string]any{"role": "manager", "venue_ids": []string{other}}), http.StatusNoContent)
	if got := venueIDs(t, staff); !slices.Equal(got, []string{other}) {
		t.Fatalf("staff after role change: %v", got)
	}
}
