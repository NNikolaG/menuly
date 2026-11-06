package httpapi_test

// Integration tests against a real Postgres. They need two URLs:
//
//	TEST_DATABASE_URL          app role (menuly_app, no BYPASSRLS)
//	TEST_MIGRATE_DATABASE_URL  schema owner
//
// The test database is reset on every run. Without the env vars the tests
// are skipped. `make test` / docker compose provide them.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nnikolag/menuly/backend/internal/auth"
	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
	"github.com/nnikolag/menuly/backend/internal/httpapi"
	"github.com/nnikolag/menuly/backend/internal/jobs"
	"github.com/nnikolag/menuly/backend/internal/mail"
	"github.com/nnikolag/menuly/backend/internal/storage"
)

var (
	dbAvailable bool
	srv         *httptest.Server
	appDB       *db.DB
	ownerURL    string
	mailbox     = &mail.Memory{}
)

// testAPIURL prefixes uploaded image URLs in tests.
const testAPIURL = "http://api.test"

func TestMain(m *testing.M) {
	appURL := os.Getenv("TEST_DATABASE_URL")
	ownerURL = os.Getenv("TEST_MIGRATE_DATABASE_URL")
	if appURL == "" || ownerURL == "" {
		fmt.Println("integration tests will be skipped: TEST_DATABASE_URL / TEST_MIGRATE_DATABASE_URL not set")
		os.Exit(m.Run())
	}
	dbAvailable = true
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	ctx := context.Background()
	if err := resetSchema(ctx, ownerURL); err != nil {
		panic(err)
	}
	if err := db.Migrate(ctx, ownerURL, "up"); err != nil {
		panic(err)
	}
	if err := jobs.Migrate(ctx, ownerURL); err != nil {
		panic(err)
	}
	var err error
	appDB, err = db.Open(ctx, appURL)
	if err != nil {
		panic(err)
	}
	issuer := auth.NewIssuer("test-secret-test-secret-test-secret!!", "menuly", time.Minute, time.Hour)
	uploads, err := os.MkdirTemp("", "menuly-uploads-")
	if err != nil {
		panic(err)
	}
	store := storage.Dir{Root: uploads}
	queue, err := jobs.New(jobs.Config{DB: appDB, Store: store, Extractor: stubExtractor, Workers: 2})
	if err != nil {
		panic(err)
	}
	if err := queue.Start(ctx); err != nil {
		panic(err)
	}
	srv = httptest.NewServer(httpapi.New(appDB, issuer).Handler(httpapi.Options{Store: store, Jobs: queue, Mailer: mailbox, AppURL: "http://app.test", PublicAPIURL: testAPIURL}))
	code := m.Run()
	_ = queue.Stop(ctx)
	srv.Close()
	appDB.Close()
	_ = os.RemoveAll(uploads)
	os.Exit(code)
}

func resetSchema(ctx context.Context, url string) error {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return err
	}
	defer pool.Close()
	_, err = pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`)
	return err
}

// needDB skips tests that need Postgres when it is not configured.
func needDB(t *testing.T) {
	t.Helper()
	if !dbAvailable {
		t.Skip("TEST_DATABASE_URL not set")
	}
}

type resp struct {
	status int
	body   map[string]any
}

func call(t *testing.T, method, path, token string, body any) resp {
	t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, srv.URL+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	out := resp{status: res.StatusCode}
	raw, _ := io.ReadAll(res.Body)
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out.body)
	}
	return out
}

func expect(t *testing.T, r resp, status int) {
	t.Helper()
	if r.status != status {
		t.Fatalf("status = %d, want %d, body = %v", r.status, status, r.body)
	}
}

func errCode(r resp) string {
	e, _ := r.body["error"].(map[string]any)
	s, _ := e["code"].(string)
	return s
}

type account struct {
	access, refresh, tenantID, email string
}

func register(t *testing.T, business string) account {
	t.Helper()
	email := uuid.NewString()[:8] + "@example.com"
	r := call(t, "POST", "/v1/auth/register", "", map[string]string{
		"name": "Test", "email": email, "password": "secret123", "business_name": business,
	})
	expect(t, r, http.StatusCreated)
	return account{
		access: r.body["access_token"].(string), refresh: r.body["refresh_token"].(string),
		tenantID: r.body["tenant_id"].(string), email: email,
	}
}

func createVenue(t *testing.T, a account, name string) string {
	t.Helper()
	r := call(t, "POST", "/v1/venues", a.access, map[string]string{"name": name, "slug": "v-" + uuid.NewString()[:8]})
	expect(t, r, http.StatusCreated)
	return r.body["id"].(string)
}

func TestAuthFlow(t *testing.T) {
	needDB(t)
	a := register(t, "Kafić Test")

	// Duplicate email.
	r := call(t, "POST", "/v1/auth/register", "", map[string]string{
		"name": "X", "email": a.email, "password": "secret123", "business_name": "Y",
	})
	expect(t, r, http.StatusConflict)

	// Wrong password / unknown user give the same error.
	expect(t, call(t, "POST", "/v1/auth/login", "", map[string]string{"email": a.email, "password": "nope-nope"}), http.StatusUnauthorized)
	expect(t, call(t, "POST", "/v1/auth/login", "", map[string]string{"email": "ghost@example.com", "password": "nope-nope"}), http.StatusUnauthorized)

	r = call(t, "POST", "/v1/auth/login", "", map[string]string{"email": a.email, "password": "secret123"})
	expect(t, r, http.StatusOK)
	if r.body["tenant_id"] != a.tenantID || r.body["role"] != "owner" {
		t.Fatalf("login picked wrong tenant/role: %v", r.body)
	}

	me := call(t, "GET", "/v1/me", a.access, nil)
	expect(t, me, http.StatusOK)
	expect(t, call(t, "GET", "/v1/me", "", nil), http.StatusUnauthorized)
	expect(t, call(t, "GET", "/v1/me", "garbage", nil), http.StatusUnauthorized)

	// Refresh rotates the token; the old one stops working, and reusing it
	// revokes the new one as well.
	r = call(t, "POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": a.refresh})
	expect(t, r, http.StatusOK)
	rotated := r.body["refresh_token"].(string)
	expect(t, call(t, "POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": a.refresh}), http.StatusUnauthorized)
	expect(t, call(t, "POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": rotated}), http.StatusUnauthorized)

	// Logout revokes.
	r = call(t, "POST", "/v1/auth/login", "", map[string]string{"email": a.email, "password": "secret123"})
	rt := r.body["refresh_token"].(string)
	expect(t, call(t, "POST", "/v1/auth/logout", "", map[string]string{"refresh_token": rt}), http.StatusNoContent)
	expect(t, call(t, "POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": rt}), http.StatusUnauthorized)
}

func TestTenantIsolationOverHTTP(t *testing.T) {
	needDB(t)
	a, b := register(t, "Tenant A"), register(t, "Tenant B")
	va := createVenue(t, a, "A venue")
	createVenue(t, b, "B venue")

	list := call(t, "GET", "/v1/venues", b.access, nil)
	expect(t, list, http.StatusOK)
	items := list.body["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["name"] != "B venue" {
		t.Fatalf("tenant B sees %v", items)
	}

	expect(t, call(t, "GET", "/v1/venues/"+va, b.access, nil), http.StatusNotFound)
	expect(t, call(t, "PATCH", "/v1/venues/"+va, b.access, map[string]string{"name": "hacked"}), http.StatusNotFound)
	expect(t, call(t, "DELETE", "/v1/venues/"+va, b.access, nil), http.StatusNotFound)

	r := call(t, "GET", "/v1/venues/"+va, a.access, nil)
	expect(t, r, http.StatusOK)
	if r.body["name"] != "A venue" {
		t.Fatalf("venue was modified by another tenant: %v", r.body)
	}

	// Cannot switch into a tenant you are not a member of.
	expect(t, call(t, "POST", "/v1/auth/switch-tenant", b.access, map[string]string{"tenant_id": a.tenantID}), http.StatusForbidden)
}

// TestRLSWithoutAppFilters proves the database itself enforces isolation,
// even for queries that forget the tenant_id filter.
func TestRLSWithoutAppFilters(t *testing.T) {
	needDB(t)
	ctx := context.Background()
	a, b := register(t, "RLS A"), register(t, "RLS B")
	createVenue(t, a, "rls a")
	createVenue(t, b, "rls b")
	ta, tb := uuid.MustParse(a.tenantID), uuid.MustParse(b.tenantID)

	countAll := func(scope db.Scope) (n int) {
		t.Helper()
		pool := appDB.Pool
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		if scope.TenantID != uuid.Nil {
			if _, err := tx.Exec(ctx, `SELECT set_config('app.tenant_id', $1, true)`, scope.TenantID.String()); err != nil {
				t.Fatal(err)
			}
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM venues`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if n := countAll(db.Scope{}); n != 0 {
		t.Fatalf("no tenant context: saw %d venues, want 0", n)
	}
	if n := countAll(db.Scope{TenantID: ta}); n != 1 {
		t.Fatalf("tenant A context: saw %d venues, want 1", n)
	}

	// Writing a row for another tenant is rejected by WITH CHECK.
	err := appDB.Tx(ctx, db.Scope{TenantID: ta}, func(q *sqlc.Queries) error {
		_, err := q.CreateVenue(ctx, sqlc.CreateVenueParams{
			ID: uuid.Must(uuid.NewV7()), TenantID: tb, Name: "sneaky", Slug: "sneaky-" + uuid.NewString()[:8],
			Currency: "RSD", Timezone: "Europe/Belgrade", OpeningHours: json.RawMessage(`{}`),
		})
		return err
	})
	if err == nil {
		t.Fatal("inserting a venue for another tenant succeeded")
	}
}

func TestRoles(t *testing.T) {
	needDB(t)
	ctx := context.Background()
	owner := register(t, "Roles")
	v := createVenue(t, owner, "Main")
	staff := register(t, "Staff own tenant")

	// Add the staff user to the owner's tenant directly (invitations come later).
	pool, err := pgxpool.New(ctx, ownerURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	// FORCE ROW LEVEL SECURITY applies to the owner too, so set the context.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `SELECT set_config('app.tenant_id', $1, true)`, owner.tenantID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO memberships (tenant_id, user_id, role)
		SELECT $1, id, 'staff' FROM users WHERE email = $2`, owner.tenantID, staff.email); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	r := call(t, "POST", "/v1/auth/switch-tenant", staff.access, map[string]string{"tenant_id": owner.tenantID})
	expect(t, r, http.StatusOK)
	staffTok := r.body["access_token"].(string)

	me := call(t, "GET", "/v1/me", staffTok, nil)
	expect(t, me, http.StatusOK)
	if me.body["role"] != "staff" || len(me.body["memberships"].([]any)) != 2 {
		t.Fatalf("unexpected /me for staff: %v", me.body)
	}

	expect(t, call(t, "GET", "/v1/venues/"+v, staffTok, nil), http.StatusOK)
	r = call(t, "POST", "/v1/venues", staffTok, map[string]string{"name": "nope"})
	expect(t, r, http.StatusForbidden)
	if errCode(r) != "forbidden" {
		t.Fatalf("code = %q", errCode(r))
	}
	expect(t, call(t, "PATCH", "/v1/venues/"+v, staffTok, map[string]string{"name": "nope"}), http.StatusForbidden)
	expect(t, call(t, "DELETE", "/v1/venues/"+v, staffTok, nil), http.StatusForbidden)
}

func TestVenueValidationAndUpdate(t *testing.T) {
	needDB(t)
	a := register(t, "Validation")
	expect(t, call(t, "POST", "/v1/venues", a.access, map[string]string{}), http.StatusUnprocessableEntity)
	expect(t, call(t, "POST", "/v1/venues", a.access, map[string]string{"name": "x", "currency": "dinar"}), http.StatusUnprocessableEntity)
	expect(t, call(t, "POST", "/v1/venues", a.access, map[string]string{"name": "x", "timezone": "Mars/Base"}), http.StatusUnprocessableEntity)
	expect(t, call(t, "POST", "/v1/venues", a.access, map[string]any{"name": "x", "unknown": 1}), http.StatusBadRequest)

	id := createVenue(t, a, "Bar")
	r := call(t, "PATCH", "/v1/venues/"+id, a.access, map[string]any{
		"phone": "+381 11 123", "currency": "eur", "opening_hours": map[string]any{"mon": []string{"08:00-23:00"}},
	})
	expect(t, r, http.StatusOK)
	if r.body["currency"] != "EUR" || r.body["phone"] != "+381 11 123" || r.body["name"] != "Bar" {
		t.Fatalf("patch result: %v", r.body)
	}
	expect(t, call(t, "DELETE", "/v1/venues/"+id, a.access, nil), http.StatusNoContent)
	expect(t, call(t, "GET", "/v1/venues/"+id, a.access, nil), http.StatusNotFound)
}

func TestTenantAndVenueSlugs(t *testing.T) {
	needDB(t)
	// Auto slug from business name; the same name twice gets distinct slugs.
	reg := func(body map[string]string) resp {
		body["name"], body["password"] = "T", "secret123"
		body["email"] = uuid.NewString()[:8] + "@example.com"
		return call(t, "POST", "/v1/auth/register", "", body)
	}
	name := "Kafana Šumadija " + uuid.NewString()[:4]
	r1 := reg(map[string]string{"business_name": name})
	expect(t, r1, http.StatusCreated)
	s1 := r1.body["tenant"].(map[string]any)["slug"].(string)
	if s1 != "kafana-sumadija-"+name[len(name)-4:] {
		t.Fatalf("auto slug = %q", s1)
	}
	r2 := reg(map[string]string{"business_name": name})
	expect(t, r2, http.StatusCreated)
	if s2 := r2.body["tenant"].(map[string]any)["slug"].(string); s2 == s1 {
		t.Fatalf("duplicate business names got the same slug %q", s2)
	}

	// Explicit slug: taken -> 409, reserved/invalid -> 422.
	r := reg(map[string]string{"business_name": "X", "tenant_slug": s1})
	expect(t, r, http.StatusConflict)
	if errCode(r) != "tenant_slug_taken" {
		t.Fatalf("code = %q", errCode(r))
	}
	expect(t, reg(map[string]string{"business_name": "X", "tenant_slug": "admin"}), http.StatusUnprocessableEntity)
	expect(t, reg(map[string]string{"business_name": "X", "tenant_slug": "Not Valid"}), http.StatusUnprocessableEntity)

	// Venue slugs are unique per tenant only.
	a := account{access: r1.body["access_token"].(string)}
	b := account{access: r2.body["access_token"].(string)}
	expect(t, call(t, "POST", "/v1/venues", a.access, map[string]string{"name": "Centar"}), http.StatusCreated)
	expect(t, call(t, "POST", "/v1/venues", b.access, map[string]string{"name": "Centar"}), http.StatusCreated)
	expect(t, call(t, "POST", "/v1/venues", a.access, map[string]string{"name": "x", "slug": "en"}), http.StatusUnprocessableEntity)
	r = call(t, "POST", "/v1/venues", a.access, map[string]string{"name": "EN"})
	expect(t, r, http.StatusCreated)
	if r.body["slug"] == "en" {
		t.Fatal("auto slug took reserved path en")
	}
	r = call(t, "POST", "/v1/venues", a.access, map[string]string{"name": "Centar"})
	expect(t, r, http.StatusConflict)
	if errCode(r) != "slug_taken" {
		t.Fatalf("code = %q", errCode(r))
	}
}
