package httpapi_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// addMember adds member's user to owner's tenant with role and returns an
// access token for that tenant.
func addMember(t *testing.T, owner, member account, role string) string {
	t.Helper()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, ownerURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('app.tenant_id', $1, true)`, owner.tenantID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO memberships (tenant_id, user_id, role)
		SELECT $1, id, $3 FROM users WHERE email = $2`, owner.tenantID, member.email, role); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	r := call(t, "POST", "/v1/auth/switch-tenant", member.access, map[string]string{"tenant_id": owner.tenantID})
	expect(t, r, http.StatusOK)
	return r.body["access_token"].(string)
}

func id(r resp) string { return r.body["id"].(string) }

type menuFixture struct {
	owner                      account
	venue, menu, drinks, food  string
	beer, beerSmall, beerLarge string
	burger, burgerVariant      string
}

func newMenuFixture(t *testing.T) menuFixture {
	t.Helper()
	f := menuFixture{owner: register(t, "Menu Fixture")}
	tok := f.owner.access
	f.venue = createVenue(t, f.owner, "Bar")
	r := call(t, "POST", "/v1/venues/"+f.venue+"/menus", tok, map[string]string{"name": "Glavni"})
	expect(t, r, http.StatusCreated)
	f.menu = id(r)

	r = call(t, "POST", "/v1/menus/"+f.menu+"/categories", tok, map[string]any{
		"name": "Pića", "translations": map[string]any{"en": map[string]string{"name": "Drinks"}},
	})
	expect(t, r, http.StatusCreated)
	f.drinks = id(r)
	r = call(t, "POST", "/v1/menus/"+f.menu+"/categories", tok, map[string]any{"name": "Hrana"})
	expect(t, r, http.StatusCreated)
	f.food = id(r)

	r = call(t, "POST", "/v1/categories/"+f.drinks+"/items", tok, map[string]any{
		"name": "Pivo", "tags": []string{" Točeno ", "točeno"}, "allergens": []string{"gluten"},
		"variants": []map[string]any{
			{"label": "0,33 l", "price_minor": 25000},
			{"label": "0,5 l", "price_minor": 32000, "translations": map[string]any{"en": map[string]string{"label": "0.5 l"}}},
		},
	})
	expect(t, r, http.StatusCreated)
	f.beer = id(r)
	vs := r.body["variants"].([]any)
	f.beerSmall, f.beerLarge = vs[0].(map[string]any)["id"].(string), vs[1].(map[string]any)["id"].(string)
	if tags := r.body["tags"].([]any); len(tags) != 1 || tags[0] != "točeno" {
		t.Fatalf("tags not normalized: %v", tags)
	}

	r = call(t, "POST", "/v1/categories/"+f.food+"/items", tok, map[string]any{"name": "Burger", "price_minor": 89000})
	expect(t, r, http.StatusCreated)
	f.burger = id(r)
	f.burgerVariant = r.body["variants"].([]any)[0].(map[string]any)["id"].(string)
	return f
}

func TestMenuTreeAndOrdering(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access

	tree := call(t, "GET", "/v1/menus/"+f.menu, tok, nil)
	expect(t, tree, http.StatusOK)
	cats := tree.body["categories"].([]any)
	if len(cats) != 2 || cats[0].(map[string]any)["name"] != "Pića" {
		t.Fatalf("categories: %v", cats)
	}
	beer := cats[0].(map[string]any)["items"].([]any)[0].(map[string]any)
	if len(beer["variants"].([]any)) != 2 || beer["variants"].([]any)[1].(map[string]any)["price_minor"].(float64) != 32000 {
		t.Fatalf("beer: %v", beer)
	}

	// Reorder categories: must list all, exactly once.
	expect(t, call(t, "PUT", "/v1/menus/"+f.menu+"/categories/order", tok, map[string]any{"ids": []string{f.food}}), http.StatusUnprocessableEntity)
	expect(t, call(t, "PUT", "/v1/menus/"+f.menu+"/categories/order", tok, map[string]any{"ids": []string{f.food, f.food}}), http.StatusUnprocessableEntity)
	r := call(t, "PUT", "/v1/menus/"+f.menu+"/categories/order", tok, map[string]any{"ids": []string{f.food, f.drinks}})
	expect(t, r, http.StatusOK)
	if r.body["items"].([]any)[0].(map[string]any)["id"] != f.food {
		t.Fatalf("order not applied: %v", r.body)
	}

	// Move the burger to drinks: it goes to the end.
	r = call(t, "PATCH", "/v1/items/"+f.burger, tok, map[string]any{"category_id": f.drinks})
	expect(t, r, http.StatusOK)
	if r.body["category_id"] != f.drinks || r.body["position"].(float64) != 1 {
		t.Fatalf("move: %v", r.body)
	}
	expect(t, call(t, "PUT", "/v1/categories/"+f.drinks+"/items/order", tok, map[string]any{"ids": []string{f.burger, f.beer}}), http.StatusNoContent)
	tree = call(t, "GET", "/v1/menus/"+f.menu, tok, nil)
	drinks := tree.body["categories"].([]any)[1].(map[string]any)
	if drinks["items"].([]any)[0].(map[string]any)["id"] != f.burger {
		t.Fatalf("item order: %v", drinks)
	}

	// Last variant cannot be deleted; others can.
	r = call(t, "DELETE", "/v1/variants/"+f.burgerVariant, tok, nil)
	expect(t, r, http.StatusConflict)
	expect(t, call(t, "DELETE", "/v1/variants/"+f.beerSmall, tok, nil), http.StatusNoContent)

	// Status toggle and delete.
	r = call(t, "PATCH", "/v1/items/"+f.beer+"/status", tok, map[string]any{"is_available": false})
	expect(t, r, http.StatusOK)
	if r.body["is_available"] != false || r.body["is_visible"] != true {
		t.Fatalf("status: %v", r.body)
	}
	expect(t, call(t, "DELETE", "/v1/categories/"+f.drinks, tok, nil), http.StatusNoContent)
	expect(t, call(t, "GET", "/v1/items/"+f.beer, tok, nil), http.StatusNotFound)
}

func TestMenuPublishing(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access
	r := call(t, "POST", "/v1/venues/"+f.venue+"/menus", tok, map[string]string{"name": "Leto"})
	expect(t, r, http.StatusCreated)
	summer := id(r)

	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/publish", tok, nil), http.StatusOK)
	venue := call(t, "GET", "/v1/venues/"+f.venue, tok, nil)
	if venue.body["active_menu_id"] != f.menu {
		t.Fatalf("active menu: %v", venue.body)
	}

	r = call(t, "POST", "/v1/menus/"+summer+"/publish", tok, nil)
	expect(t, r, http.StatusOK)
	if r.body["status"] != "published" {
		t.Fatalf("publish: %v", r.body)
	}
	list := call(t, "GET", "/v1/venues/"+f.venue+"/menus", tok, nil)
	for _, m := range list.body["items"].([]any) {
		m := m.(map[string]any)
		want := "draft"
		if m["id"] == summer {
			want = "published"
		}
		if m["status"] != want {
			t.Fatalf("menu %v status %v, want %s", m["name"], m["status"], want)
		}
	}

	expect(t, call(t, "POST", "/v1/menus/"+summer+"/unpublish", tok, nil), http.StatusOK)
	venue = call(t, "GET", "/v1/venues/"+f.venue, tok, nil)
	if venue.body["active_menu_id"] != nil {
		t.Fatalf("active menu after unpublish: %v", venue.body["active_menu_id"])
	}
	expect(t, call(t, "PATCH", "/v1/menus/"+summer, tok, map[string]string{"name": "Leto 2027"}), http.StatusOK)
	expect(t, call(t, "DELETE", "/v1/menus/"+summer, tok, nil), http.StatusNoContent)
}

func TestPriceChanges(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access

	r := call(t, "PATCH", "/v1/variants/"+f.burgerVariant, tok, map[string]any{"price_minor": 95000})
	expect(t, r, http.StatusOK)
	expect(t, call(t, "PATCH", "/v1/variants/"+f.burgerVariant, tok, map[string]any{"label": "porcija"}), http.StatusOK)
	h := call(t, "GET", "/v1/variants/"+f.burgerVariant+"/price-history", tok, nil)
	expect(t, h, http.StatusOK)
	items := h.body["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["old_price_minor"].(float64) != 89000 || items[0].(map[string]any)["new_price_minor"].(float64) != 95000 {
		t.Fatalf("history after single change: %v", items)
	}

	// +10% on drinks only, rounded to 10 RSD (1000 para): 25000 -> 27500 -> 28000, 32000 -> 35200 -> 35000.
	r = call(t, "POST", "/v1/menus/"+f.menu+"/price-adjustments", tok, map[string]any{
		"category_id": f.drinks, "percent": 10, "round_to_minor": 1000,
	})
	expect(t, r, http.StatusOK)
	if r.body["updated"].(float64) != 2 {
		t.Fatalf("updated: %v", r.body)
	}
	beer := call(t, "GET", "/v1/items/"+f.beer, tok, nil)
	vs := beer.body["variants"].([]any)
	if vs[0].(map[string]any)["price_minor"].(float64) != 28000 || vs[1].(map[string]any)["price_minor"].(float64) != 35000 {
		t.Fatalf("adjusted prices: %v", vs)
	}
	burger := call(t, "GET", "/v1/items/"+f.burger, tok, nil)
	if burger.body["variants"].([]any)[0].(map[string]any)["price_minor"].(float64) != 95000 {
		t.Fatal("price adjustment leaked outside the category")
	}

	// Fixed amount over the whole menu.
	r = call(t, "POST", "/v1/menus/"+f.menu+"/price-adjustments", tok, map[string]any{"amount_minor": -5000})
	expect(t, r, http.StatusOK)
	if r.body["updated"].(float64) != 3 {
		t.Fatalf("updated: %v", r.body)
	}
	h = call(t, "GET", "/v1/variants/"+f.beerSmall+"/price-history", tok, nil)
	if n := len(h.body["items"].([]any)); n != 2 {
		t.Fatalf("beer history entries = %d, want 2", n)
	}

	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/price-adjustments", tok, map[string]any{"percent": 5, "amount_minor": 100}), http.StatusUnprocessableEntity)
	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/price-adjustments", tok, map[string]any{}), http.StatusUnprocessableEntity)
	expect(t, call(t, "PATCH", "/v1/variants/"+f.burgerVariant, tok, map[string]any{"price_minor": -1}), http.StatusUnprocessableEntity)
}

func TestMenuValidation(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access
	bad := []map[string]any{
		{"name": "x"}, // no price
		{"name": "x", "price_minor": 100, "variants": []map[string]any{{"price_minor": 1}}},
		{"name": "x", "price_minor": 100, "translations": map[string]any{"sr": map[string]string{"name": "x"}}},
		{"name": "x", "price_minor": 100, "translations": map[string]any{"en": map[string]string{"color": "red"}}},
		{"name": "x", "price_minor": 100, "image_url": "javascript:alert(1)"},
		{"name": " ", "price_minor": 100},
		{"name": "x", "variants": []map[string]any{{"label": "big"}}},
	}
	for _, body := range bad {
		r := call(t, "POST", "/v1/categories/"+f.food+"/items", tok, body)
		if r.status != http.StatusUnprocessableEntity {
			t.Errorf("body %v: status %d, want 422 (%v)", body, r.status, r.body)
		}
	}
}

func TestMenuIsolation(t *testing.T) {
	needDB(t)
	a := newMenuFixture(t)
	b := newMenuFixture(t)
	tok := b.owner.access

	for _, c := range []struct{ method, path string }{
		{"GET", "/v1/venues/" + a.venue + "/menus"},
		{"GET", "/v1/menus/" + a.menu},
		{"GET", "/v1/items/" + a.beer},
		{"GET", "/v1/variants/" + a.beerLarge + "/price-history"},
	} {
		expect(t, call(t, c.method, c.path, tok, nil), http.StatusNotFound)
	}
	for _, c := range []struct {
		method, path string
		body         any
	}{
		{"POST", "/v1/venues/" + a.venue + "/menus", map[string]string{"name": "x"}},
		{"PATCH", "/v1/menus/" + a.menu, map[string]string{"name": "x"}},
		{"POST", "/v1/menus/" + a.menu + "/publish", nil},
		{"POST", "/v1/menus/" + a.menu + "/categories", map[string]string{"name": "x"}},
		{"POST", "/v1/menus/" + a.menu + "/price-adjustments", map[string]any{"percent": 50}},
		{"PATCH", "/v1/categories/" + a.food, map[string]string{"name": "x"}},
		{"POST", "/v1/categories/" + a.food + "/items", map[string]any{"name": "x", "price_minor": 1}},
		{"PATCH", "/v1/items/" + a.burger, map[string]string{"name": "x"}},
		{"PATCH", "/v1/items/" + a.burger + "/status", map[string]bool{"is_available": false}},
		{"POST", "/v1/items/" + a.burger + "/variants", map[string]any{"price_minor": 1}},
		{"PATCH", "/v1/variants/" + a.burgerVariant, map[string]any{"price_minor": 1}},
		{"DELETE", "/v1/variants/" + a.beerLarge, nil},
		{"DELETE", "/v1/items/" + a.burger, nil},
		{"DELETE", "/v1/categories/" + a.food, nil},
		{"DELETE", "/v1/menus/" + a.menu, nil},
	} {
		r := call(t, c.method, c.path, tok, c.body)
		if r.status != http.StatusNotFound {
			t.Errorf("%s %s by other tenant: status %d, want 404", c.method, c.path, r.status)
		}
	}
	// Moving own item into another tenant's category.
	r := call(t, "PATCH", "/v1/items/"+b.burger, tok, map[string]any{"category_id": a.food})
	if r.status != http.StatusNotFound {
		t.Errorf("cross-tenant move: status %d", r.status)
	}

	// Tenant A's data is untouched.
	tree := call(t, "GET", "/v1/menus/"+a.menu, a.owner.access, nil)
	expect(t, tree, http.StatusOK)
	if tree.body["name"] != "Glavni" || tree.body["status"] != "draft" {
		t.Fatalf("tenant A menu changed: %v", tree.body)
	}
	burger := call(t, "GET", "/v1/items/"+a.burger, a.owner.access, nil)
	if burger.body["is_available"] != true || burger.body["variants"].([]any)[0].(map[string]any)["price_minor"].(float64) != 89000 {
		t.Fatalf("tenant A item changed: %v", burger.body)
	}
}

func TestMenuRoles(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	staff := addMember(t, f.owner, register(t, "staff home"), "staff")
	manager := addMember(t, f.owner, register(t, "manager home"), "manager")

	// Staff: read and toggle, nothing else.
	expect(t, call(t, "GET", "/v1/menus/"+f.menu, staff, nil), http.StatusOK)
	expect(t, call(t, "PATCH", "/v1/items/"+f.burger+"/status", staff, map[string]bool{"is_available": false}), http.StatusOK)
	for _, c := range []struct {
		method, path string
		body         any
	}{
		{"POST", "/v1/venues/" + f.venue + "/menus", map[string]string{"name": "x"}},
		{"POST", "/v1/menus/" + f.menu + "/publish", nil},
		{"POST", "/v1/menus/" + f.menu + "/categories", map[string]string{"name": "x"}},
		{"PATCH", "/v1/items/" + f.burger, map[string]string{"name": "x"}},
		{"PATCH", "/v1/variants/" + f.burgerVariant, map[string]any{"price_minor": 1}},
		{"POST", "/v1/menus/" + f.menu + "/price-adjustments", map[string]any{"percent": 50}},
		{"DELETE", "/v1/items/" + f.burger, nil},
	} {
		if r := call(t, c.method, c.path, staff, c.body); r.status != http.StatusForbidden {
			t.Errorf("staff %s %s: status %d, want 403", c.method, c.path, r.status)
		}
	}

	// Manager edits menus and prices.
	expect(t, call(t, "PATCH", "/v1/variants/"+f.burgerVariant, manager, map[string]any{"price_minor": 99000}), http.StatusOK)
	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/publish", manager, nil), http.StatusOK)
}
