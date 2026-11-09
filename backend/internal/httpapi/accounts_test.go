package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func ownerExec(t *testing.T, sql string, args ...any) {
	t.Helper()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, ownerURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err := pool.Exec(ctx, sql, args...); err != nil {
		t.Fatal(err)
	}
}

var tokenRe = regexp.MustCompile(`token=([A-Za-z0-9_-]+)`)

func mailToken(t *testing.T, to string) string {
	t.Helper()
	m, ok := mailbox.Last(to)
	if !ok {
		t.Fatalf("no email to %s", to)
	}
	match := tokenRe.FindStringSubmatch(m.Text)
	if match == nil {
		t.Fatalf("no token in %q", m.Text)
	}
	return match[1]
}

func uploadImage(t *testing.T, token, purpose string, data []byte) resp {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	_ = mw.WriteField("purpose", purpose)
	fw, _ := mw.CreateFormFile("file", "photo.png")
	_, _ = fw.Write(data)
	_ = mw.Close()
	req, _ := http.NewRequest("POST", srv.URL+"/v1/media/images", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	out := resp{status: res.StatusCode}
	raw, _ := io.ReadAll(res.Body)
	_ = json.Unmarshal(raw, &out.body)
	return out
}

func TestImageUpload(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access

	big := image.NewRGBA(image.Rect(0, 0, 3000, 1500))
	var buf bytes.Buffer
	_ = png.Encode(&buf, big)
	r := uploadImage(t, tok, "item", buf.Bytes())
	expect(t, r, http.StatusCreated)
	url := r.body["url"].(string)
	if !strings.HasPrefix(url, testAPIURL+"/v1/public/media/"+f.owner.tenantID+"/") || r.body["width"].(float64) != 1600 || r.body["mime"] != "image/jpeg" {
		t.Fatalf("upload: %v", r.body)
	}
	// Anyone can load it (guests see item photos).
	res, err := http.Get(srv.URL + strings.TrimPrefix(url, testAPIURL))
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || !strings.Contains(res.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("serve: %d %v", res.StatusCode, res.Header)
	}
	if cfg, err := jpeg.DecodeConfig(bytes.NewReader(data)); err != nil || cfg.Width != 1600 {
		t.Fatalf("served image: %v %v", cfg, err)
	}
	// The URL fits the item's image_url.
	expect(t, call(t, "PATCH", "/v1/items/"+f.burger, tok, map[string]any{"image_url": url}), http.StatusOK)

	// A transparent logo stays PNG.
	logo := image.NewNRGBA(image.Rect(0, 0, 800, 800))
	logo.Set(10, 10, color.NRGBA{R: 255, A: 255})
	buf.Reset()
	_ = png.Encode(&buf, logo)
	r = uploadImage(t, tok, "logo", buf.Bytes())
	expect(t, r, http.StatusCreated)
	if r.body["mime"] != "image/png" || r.body["width"].(float64) != 512 {
		t.Fatalf("logo: %v", r.body)
	}

	expect(t, uploadImage(t, tok, "item", []byte("not an image")), http.StatusUnsupportedMediaType)
	expect(t, uploadImage(t, tok, "poster", buf.Bytes()), http.StatusUnprocessableEntity)
	staff := addMember(t, f.owner, register(t, "Img Staff"), "staff")
	expect(t, uploadImage(t, staff, "item", buf.Bytes()), http.StatusForbidden)

	for _, path := range []string{
		"/v1/public/media/" + f.owner.tenantID + "/" + uuid.NewString() + ".jpg",
		"/v1/public/media/" + f.owner.tenantID + "/..%2Fimports%2Fx.jpg",
		"/v1/public/media/not-a-uuid/x.jpg",
	} {
		res, _ := http.Get(srv.URL + path)
		res.Body.Close()
		if res.StatusCode != 404 {
			t.Errorf("%s: %d", path, res.StatusCode)
		}
	}
}

func TestMenuViews(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	ts, vs := tenantSlug(t, f.owner), venueSlug(t, f.owner, f.venue)
	for range 3 {
		expect(t, call(t, "POST", "/v1/public/menus/"+ts+"/"+vs+"/views", "", nil), http.StatusNoContent)
	}
	expect(t, call(t, "POST", "/v1/public/menus/"+ts+"/nope/views", "", nil), http.StatusNotFound)
	r := call(t, "GET", "/v1/venues/"+f.venue+"/stats?days=7", f.owner.access, nil)
	expect(t, r, http.StatusOK)
	days := r.body["days"].([]any)
	if r.body["total"].(float64) != 3 || len(days) != 7 || days[6].(map[string]any)["views"].(float64) != 3 {
		t.Fatalf("stats: %v", r.body)
	}
	other := register(t, "Stats Intruder")
	expect(t, call(t, "GET", "/v1/venues/"+f.venue+"/stats", other.access, nil), http.StatusNotFound)
}

func TestInvitations(t *testing.T) {
	needDB(t)
	owner := register(t, "Invite Owner")
	email := "new-" + uuid.NewString()[:8] + "@example.com"

	r := call(t, "POST", "/v1/invitations", owner.access, map[string]string{"email": email, "role": "manager"})
	expect(t, r, http.StatusCreated)
	token := mailToken(t, email)

	r = call(t, "GET", "/v1/public/invitations/"+token, "", nil)
	expect(t, r, http.StatusOK)
	if r.body["status"] != "pending" || r.body["tenant_name"] != "Invite Owner" || r.body["has_account"] != false || r.body["role"] != "manager" {
		t.Fatalf("public invite: %v", r.body)
	}
	expect(t, call(t, "GET", "/v1/public/invitations/bogus", "", nil), http.StatusNotFound)

	expect(t, call(t, "POST", "/v1/auth/accept-invite", "", map[string]string{"token": token, "name": "Nova"}), http.StatusUnprocessableEntity)
	r = call(t, "POST", "/v1/auth/accept-invite", "", map[string]string{"token": token, "name": "Nova", "password": "secret123"})
	expect(t, r, http.StatusOK)
	if r.body["role"] != "manager" || r.body["tenant_id"] != owner.tenantID {
		t.Fatalf("accept: %v", r.body)
	}
	manager := r.body["access_token"].(string)
	expect(t, call(t, "POST", "/v1/auth/accept-invite", "", map[string]string{"token": token, "name": "X", "password": "secret123"}), http.StatusBadRequest)

	// The new manager sees the venues and can invite staff, but not managers.
	expect(t, call(t, "GET", "/v1/venues", manager, nil), http.StatusOK)
	expect(t, call(t, "POST", "/v1/invitations", manager, map[string]string{"email": "m2@example.com", "role": "manager"}), http.StatusForbidden)
	expect(t, call(t, "POST", "/v1/invitations", owner.access, map[string]string{"email": email, "role": "staff"}), http.StatusConflict)

	// An existing account accepts while logged in, as the invited email.
	existing := register(t, "Elsewhere")
	expect(t, call(t, "POST", "/v1/invitations", manager, map[string]string{"email": existing.email, "role": "staff"}), http.StatusCreated)
	token = mailToken(t, existing.email)
	expect(t, call(t, "POST", "/v1/auth/accept-invite", "", map[string]string{"token": token, "name": "X", "password": "secret123"}), http.StatusConflict)
	expect(t, call(t, "POST", "/v1/auth/accept-invite", owner.access, map[string]string{"token": token}), http.StatusForbidden)
	r = call(t, "POST", "/v1/auth/accept-invite", existing.access, map[string]string{"token": token})
	expect(t, r, http.StatusOK)
	if r.body["role"] != "staff" {
		t.Fatalf("existing accept: %v", r.body)
	}
	me := call(t, "GET", "/v1/me", r.body["access_token"].(string), nil)
	if n := len(me.body["memberships"].([]any)); n != 2 {
		t.Fatalf("memberships: %d", n)
	}

	// Members: list, change role, remove; the owner cannot be changed.
	r = call(t, "GET", "/v1/members", owner.access, nil)
	expect(t, r, http.StatusOK)
	members := r.body["items"].([]any)
	if len(members) != 3 {
		t.Fatalf("members: %v", members)
	}
	staffID := members[2].(map[string]any)["user_id"].(string)
	ownerID := members[0].(map[string]any)["user_id"].(string)
	expect(t, call(t, "PATCH", "/v1/members/"+staffID, manager, map[string]string{"role": "manager"}), http.StatusForbidden)
	expect(t, call(t, "PATCH", "/v1/members/"+staffID, owner.access, map[string]string{"role": "manager"}), http.StatusNoContent)
	expect(t, call(t, "PATCH", "/v1/members/"+ownerID, owner.access, map[string]string{"role": "staff"}), http.StatusNotFound)
	expect(t, call(t, "DELETE", "/v1/members/"+staffID, owner.access, nil), http.StatusNoContent)

	// Pending invites: list and revoke; a revoked link stops working.
	r = call(t, "POST", "/v1/invitations", owner.access, map[string]string{"email": "later@example.com", "role": "staff"})
	expect(t, r, http.StatusCreated)
	inv := id(r)
	token = mailToken(t, "later@example.com")
	r = call(t, "GET", "/v1/invitations", owner.access, nil)
	if len(r.body["items"].([]any)) != 1 {
		t.Fatalf("pending: %v", r.body)
	}
	other := register(t, "Invite Intruder")
	expect(t, call(t, "DELETE", "/v1/invitations/"+inv, other.access, nil), http.StatusNotFound)
	expect(t, call(t, "DELETE", "/v1/invitations/"+inv, owner.access, nil), http.StatusNoContent)
	r = call(t, "GET", "/v1/public/invitations/"+token, "", nil)
	if r.body["status"] != "revoked" {
		t.Fatalf("revoked: %v", r.body)
	}
	expect(t, call(t, "POST", "/v1/auth/accept-invite", "", map[string]string{"token": token, "name": "X", "password": "secret123"}), http.StatusBadRequest)
}

func TestPasswordReset(t *testing.T) {
	needDB(t)
	a := register(t, "Reset Me")
	expect(t, call(t, "POST", "/v1/auth/forgot-password", "", map[string]string{"email": "nobody@example.com"}), http.StatusNoContent)
	expect(t, call(t, "POST", "/v1/auth/forgot-password", "", map[string]string{"email": a.email}), http.StatusNoContent)
	token := mailToken(t, a.email)

	expect(t, call(t, "POST", "/v1/auth/reset-password", "", map[string]string{"token": token, "password": "short"}), http.StatusUnprocessableEntity)
	expect(t, call(t, "POST", "/v1/auth/reset-password", "", map[string]string{"token": "wrong", "password": "newsecret1"}), http.StatusBadRequest)
	expect(t, call(t, "POST", "/v1/auth/reset-password", "", map[string]string{"token": token, "password": "newsecret1"}), http.StatusNoContent)
	expect(t, call(t, "POST", "/v1/auth/reset-password", "", map[string]string{"token": token, "password": "newsecret2"}), http.StatusBadRequest)

	expect(t, call(t, "POST", "/v1/auth/login", "", map[string]string{"email": a.email, "password": "secret123"}), http.StatusUnauthorized)
	expect(t, call(t, "POST", "/v1/auth/login", "", map[string]string{"email": a.email, "password": "newsecret1"}), http.StatusOK)
	// Old sessions are signed out.
	expect(t, call(t, "POST", "/v1/auth/refresh", "", map[string]string{"refresh_token": a.refresh}), http.StatusUnauthorized)

	// At most 3 links per hour.
	before := len(mailbox.Sent)
	for range 4 {
		expect(t, call(t, "POST", "/v1/auth/forgot-password", "", map[string]string{"email": a.email}), http.StatusNoContent)
	}
	if sent := len(mailbox.Sent) - before; sent != 2 { // 1 used above + 2 more = 3
		t.Fatalf("sent %d", sent)
	}
}

func TestPlatformAdmin(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	admin := register(t, "Menuly Staff")
	expect(t, call(t, "GET", "/v1/admin/tenants", admin.access, nil), http.StatusForbidden)
	ownerExec(t, `UPDATE users SET is_platform_admin = true WHERE email = $1`, admin.email)

	ts := tenantSlug(t, f.owner)
	r := call(t, "GET", "/v1/admin/tenants?q="+ts, admin.access, nil)
	expect(t, r, http.StatusOK)
	items := r.body["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["venues"].(float64) != 1 {
		t.Fatalf("tenants: %v", items)
	}
	r = call(t, "GET", "/v1/admin/tenants/"+f.owner.tenantID, admin.access, nil)
	expect(t, r, http.StatusOK)
	if len(r.body["owners"].([]any)) != 1 || len(r.body["venues"].([]any)) != 1 {
		t.Fatalf("tenant: %v", r.body)
	}
	me := call(t, "GET", "/v1/me", admin.access, nil)
	if me.body["user"].(map[string]any)["is_platform_admin"] != true {
		t.Fatalf("me: %v", me.body)
	}

	// Raise a venue's import limit.
	r = call(t, "PATCH", "/v1/admin/venues/"+f.venue, admin.access, map[string]any{"ocr_import_limit": 10})
	expect(t, r, http.StatusOK)
	r = call(t, "GET", "/v1/venues/"+f.venue+"/imports", f.owner.access, nil)
	if r.body["import_limit"].(float64) != 10 {
		t.Fatalf("limit: %v", r.body)
	}

	// Suspending takes the public menu offline.
	expect(t, call(t, "POST", "/v1/menus/"+f.menu+"/publish", f.owner.access, nil), http.StatusOK)
	public := "/v1/public/menus/" + ts + "/" + venueSlug(t, f.owner, f.venue)
	expect(t, call(t, "GET", public, "", nil), http.StatusOK)
	expect(t, call(t, "PATCH", "/v1/admin/tenants/"+f.owner.tenantID, admin.access, map[string]string{"status": "suspended"}), http.StatusOK)
	expect(t, call(t, "GET", public, "", nil), http.StatusNotFound)
	expect(t, call(t, "PATCH", "/v1/admin/tenants/"+f.owner.tenantID, admin.access, map[string]string{"status": "active"}), http.StatusOK)

	r = call(t, "GET", "/v1/admin/ocr-usage?days=7", admin.access, nil)
	expect(t, r, http.StatusOK)
	expect(t, call(t, "GET", "/v1/admin/ocr-usage", f.owner.access, nil), http.StatusForbidden)

	// Admin mode does not leak into normal requests: the admin's own tenant
	// still sees only its own venues.
	r = call(t, "GET", "/v1/venues", admin.access, nil)
	if len(r.body["items"].([]any)) != 0 {
		t.Fatalf("admin venues: %v", r.body)
	}
}

// A role change, removal or suspension applies to the next request, even
// with an access token issued before it.
func TestAccessChangesApplyAtOnce(t *testing.T) {
	needDB(t)
	owner := register(t, "Access Owner")
	email := "staff-" + uuid.NewString()[:8] + "@example.com"
	expect(t, call(t, "POST", "/v1/invitations", owner.access, map[string]string{"email": email, "role": "staff"}), http.StatusCreated)
	r := call(t, "POST", "/v1/auth/accept-invite", "", map[string]string{"token": mailToken(t, email), "name": "Osoblje", "password": "secret123"})
	expect(t, r, http.StatusOK)
	member := r.body["access_token"].(string)
	memberID := r.body["user"].(map[string]any)["id"].(string)
	venue := map[string]string{"name": "Bašta"}

	expect(t, call(t, "GET", "/v1/members", member, nil), http.StatusForbidden)
	expect(t, call(t, "PATCH", "/v1/members/"+memberID, owner.access, map[string]string{"role": "manager"}), http.StatusNoContent)
	expect(t, call(t, "GET", "/v1/members", member, nil), http.StatusOK) // same token, new role
	if me := call(t, "GET", "/v1/me", member, nil); me.body["role"] != "manager" {
		t.Fatalf("me role: %v", me.body["role"])
	}
	expect(t, call(t, "POST", "/v1/venues", member, venue), http.StatusForbidden) // still not owner

	expect(t, call(t, "PATCH", "/v1/members/"+memberID, owner.access, map[string]string{"role": "staff"}), http.StatusNoContent)
	expect(t, call(t, "GET", "/v1/members", member, nil), http.StatusForbidden)

	admin := register(t, "Access Admin")
	ownerExec(t, `UPDATE users SET is_platform_admin = true WHERE email = $1`, admin.email)
	expect(t, call(t, "PATCH", "/v1/admin/tenants/"+owner.tenantID, admin.access, map[string]string{"status": "suspended"}), http.StatusOK)
	r = call(t, "GET", "/v1/venues", owner.access, nil)
	expect(t, r, http.StatusForbidden)
	if r.body["error"].(map[string]any)["code"] != "tenant_suspended" {
		t.Fatalf("suspended: %v", r.body)
	}
	expect(t, call(t, "PATCH", "/v1/admin/tenants/"+owner.tenantID, admin.access, map[string]string{"status": "active"}), http.StatusOK)

	expect(t, call(t, "DELETE", "/v1/members/"+memberID, owner.access, nil), http.StatusNoContent)
	expect(t, call(t, "GET", "/v1/venues", member, nil), http.StatusUnauthorized)
	expect(t, call(t, "GET", "/v1/venues", owner.access, nil), http.StatusOK)
}
