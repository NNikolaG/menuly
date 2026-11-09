package httpapi_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/nnikolag/menuly/backend/internal/seed"
)

// The demo seed runs as the app role under RLS, logs in over HTTP and is
// idempotent; --reset recreates it.
func TestDemoSeed(t *testing.T) {
	needDB(t)
	ctx := context.Background()

	first, err := seed.Run(ctx, appDB, false)
	if err != nil {
		t.Fatal(err)
	}
	if !first.Created {
		t.Fatal("first run did not create the demo account")
	}
	again, err := seed.Run(ctx, appDB, false)
	if err != nil {
		t.Fatal(err)
	}
	if again.Created || again.TenantID != first.TenantID {
		t.Fatalf("second run without reset changed data: %+v", again)
	}

	login := call(t, "POST", "/v1/auth/login", "", map[string]string{"email": seed.Email, "password": seed.Password})
	expect(t, login, http.StatusOK)
	tok := login.body["access_token"].(string)

	venues := call(t, "GET", "/v1/venues", tok, nil)
	expect(t, venues, http.StatusOK)
	if items, _ := venues.body["items"].([]any); len(items) != 2 {
		t.Fatalf("venues = %v, want 2", venues.body)
	}

	// The demo staff member works in one venue only.
	staff := call(t, "POST", "/v1/auth/login", "", map[string]string{"email": seed.StaffEmail, "password": seed.Password})
	expect(t, staff, http.StatusOK)
	venues = call(t, "GET", "/v1/venues", staff.body["access_token"].(string), nil)
	if items, _ := venues.body["items"].([]any); len(items) != 1 {
		t.Fatalf("staff venues = %v, want 1", venues.body)
	}

	menu := call(t, "GET", "/v1/menus/"+first.MenuID.String(), tok, nil)
	expect(t, menu, http.StatusOK)
	if menu.body["status"] != "published" {
		t.Fatalf("menu status = %v, want published", menu.body["status"])
	}
	cats, _ := menu.body["categories"].([]any)
	if len(cats) != 6 {
		t.Fatalf("categories = %d, want 6", len(cats))
	}

	reset, err := seed.Run(ctx, appDB, true)
	if err != nil {
		t.Fatal(err)
	}
	if !reset.Created || reset.TenantID == first.TenantID {
		t.Fatalf("reset did not recreate the account: %+v", reset)
	}
	// The old menu is gone with the old tenant.
	expect(t, call(t, "GET", "/v1/menus/"+first.MenuID.String(), tok, nil), http.StatusNotFound)
}
