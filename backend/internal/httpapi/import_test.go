package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nnikolag/menuly/backend/internal/ocr"
)

// The stub extractor answers by image width, so tests choose a page's
// content by the size of the PNG they upload.
type fakeExtractor struct {
	failWidth atomic.Int64 // pages of this width fail permanently
}

var stubExtractor = &fakeExtractor{}

func (f *fakeExtractor) Extract(_ context.Context, p ocr.Page) (ocr.Extracted, ocr.Usage, error) {
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(p.Data))
	if err != nil {
		return ocr.Extracted{}, ocr.Usage{}, fmt.Errorf("%w: not a jpeg", ocr.ErrPermanent)
	}
	usage := ocr.Usage{Provider: "stub", Model: "stub-1", InputTokens: 10, OutputTokens: 5}
	if int64(cfg.Width) == f.failWidth.Load() {
		return ocr.Extracted{}, usage, fmt.Errorf("%w: unreadable", ocr.ErrPermanent)
	}
	item := func(name, price string, conf float64) ocr.ExtractedItem {
		return ocr.ExtractedItem{Name: name, NameConfidence: conf, PriceConfidence: conf,
			Variants: []ocr.ExtractedVariant{{PriceText: price}}}
	}
	var e ocr.Extracted
	switch cfg.Width {
	case 101:
		e = ocr.Extracted{CurrencyHint: "din", Categories: []ocr.ExtractedCategory{
			{Name: "Pića", Items: []ocr.ExtractedItem{item("Pivo", "320,00", 0.95), item("Sok", "2?0", 0.4)}},
		}}
	case 102:
		e = ocr.Extracted{Categories: []ocr.ExtractedCategory{
			{Name: "PIĆA", Items: []ocr.ExtractedItem{item("Vino", "450", 0.9)}},
			{Name: "Hrana", Items: []ocr.ExtractedItem{item("Pljeskavica", "890", 0.9)}},
		}}
	case 103:
		e = ocr.Extracted{Categories: []ocr.ExtractedCategory{
			{Name: "Deserti", Items: []ocr.ExtractedItem{item("Palačinke", "300", 0.9)}},
		}}
	default:
		e = ocr.Extracted{Categories: []ocr.ExtractedCategory{
			{Name: "Ostalo", Items: []ocr.ExtractedItem{item("Kafa", "180", 0.9)}},
		}}
	}
	return e, usage, nil
}

func pngOfWidth(t *testing.T, w int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, 50))
	for x := 0; x < w; x++ {
		img.Set(x, 10, color.Black)
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func upload(t *testing.T, token, venue string, files ...[]byte) resp {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for i, f := range files {
		fw, _ := mw.CreateFormFile("files", fmt.Sprintf("page-%d.png", i+1))
		_, _ = fw.Write(f)
	}
	_ = mw.Close()
	req, _ := http.NewRequest("POST", srv.URL+"/v1/venues/"+venue+"/imports", &body)
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

// waitImport polls until the import leaves "processing".
func waitImport(t *testing.T, token, importID string) resp {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for {
		r := call(t, "GET", "/v1/imports/"+importID, token, nil)
		expect(t, r, http.StatusOK)
		if r.body["status"] != "processing" {
			return r
		}
		if time.Now().After(deadline) {
			t.Fatalf("import still processing: %v", r.body)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func draftOf(t *testing.T, r resp) ocr.Draft {
	t.Helper()
	b, _ := json.Marshal(r.body["draft"])
	var d ocr.Draft
	if err := json.Unmarshal(b, &d); err != nil {
		t.Fatal(err)
	}
	return d
}

func TestImportFlow(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	tok := f.owner.access
	stubExtractor.failWidth.Store(103)

	r := upload(t, tok, f.venue, pngOfWidth(t, 101), pngOfWidth(t, 102), pngOfWidth(t, 103))
	expect(t, r, http.StatusAccepted)
	importID := id(r)
	if pages := r.body["pages"].([]any); len(pages) != 3 {
		t.Fatalf("pages: %v", pages)
	}

	r = waitImport(t, tok, importID)
	if r.body["status"] != "ready_for_review" || r.body["error"] != "1 of 3 files could not be read" {
		t.Fatalf("after processing: %v", r.body)
	}
	pages := r.body["pages"].([]any)
	if p := pages[2].(map[string]any); p["status"] != "failed" || p["error"] == "" {
		t.Fatalf("page 3: %v", p)
	}
	d := draftOf(t, r)
	if d.Currency != "RSD" || len(d.Categories) != 2 || d.Categories[0].Name != "Pića" || len(d.Categories[0].Items) != 3 {
		t.Fatalf("draft: %+v", d)
	}
	sok := d.Categories[0].Items[1]
	if sok.Name != "Sok" || len(sok.Uncertain) == 0 || sok.Variants[0].PriceMinor != nil {
		t.Fatalf("uncertain item: %+v", sok)
	}

	// The original is served for the review screen.
	page1 := pages[0].(map[string]any)["id"].(string)
	req, _ := http.NewRequest("GET", srv.URL+"/v1/imports/"+importID+"/pages/"+page1+"/file", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/jpeg" {
		t.Fatalf("file: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}

	// Commit is refused while a price is missing.
	r = call(t, "POST", "/v1/imports/"+importID+"/commit", tok, map[string]any{"menu_id": f.menu})
	expect(t, r, http.StatusUnprocessableEntity)
	if errCode(r) != "draft_invalid" {
		t.Fatalf("code %s", errCode(r))
	}

	// The reviewer fixes the price and renames an item.
	price := int64(25000)
	d.Categories[0].Items[1].Variants[0].PriceMinor = &price
	d.Categories[0].Items[0].Name = "Pivo točeno"
	r = call(t, "PUT", "/v1/imports/"+importID+"/draft", tok, d)
	expect(t, r, http.StatusOK)
	if r.body["draft_edited"] != true {
		t.Fatalf("draft_edited: %v", r.body)
	}

	// Retrying the failed page keeps the edits and appends the new page.
	stubExtractor.failWidth.Store(0)
	page3 := pages[2].(map[string]any)["id"].(string)
	r = call(t, "POST", "/v1/imports/"+importID+"/pages/"+page1+"/retry", tok, nil)
	expect(t, r, http.StatusConflict)
	r = call(t, "POST", "/v1/imports/"+importID+"/pages/"+page3+"/retry", tok, nil)
	expect(t, r, http.StatusAccepted)
	r = waitImport(t, tok, importID)
	d = draftOf(t, r)
	if r.body["status"] != "ready_for_review" || r.body["error"] != "" || len(d.Categories) != 3 ||
		d.Categories[0].Items[0].Name != "Pivo točeno" || d.Categories[2].Name != "Deserti" {
		t.Fatalf("after retry: %v / %+v", r.body, d)
	}

	// Commit into the existing menu: "Pića" is extended, the rest is new.
	r = call(t, "POST", "/v1/imports/"+importID+"/commit", tok, map[string]any{"menu_id": f.menu})
	expect(t, r, http.StatusOK)
	if r.body["items_created"].(float64) != 5 || r.body["import"].(map[string]any)["status"] != "committed" {
		t.Fatalf("commit: %v", r.body)
	}
	r = call(t, "GET", "/v1/menus/"+f.menu, tok, nil)
	expect(t, r, http.StatusOK)
	cats := r.body["categories"].([]any)
	if len(cats) != 3 { // Pića and Hrana extended by name, Deserti new
		names := []any{}
		for _, c := range cats {
			names = append(names, c.(map[string]any)["name"])
		}
		t.Fatalf("categories: %v", names)
	}
	drinks := cats[0].(map[string]any)
	if items := drinks["items"].([]any); len(items) != 4 { // Pivo + 3 imported
		t.Fatalf("drinks items: %d", len(items))
	}

	r = call(t, "POST", "/v1/imports/"+importID+"/commit", tok, map[string]any{"menu_id": f.menu})
	expect(t, r, http.StatusConflict)
	r = call(t, "PUT", "/v1/imports/"+importID+"/draft", tok, d)
	expect(t, r, http.StatusConflict)

	r = call(t, "GET", "/v1/venues/"+f.venue+"/imports", tok, nil)
	expect(t, r, http.StatusOK)
	if r.body["imports_used"].(float64) != 1 || r.body["import_limit"].(float64) != 3 || len(r.body["items"].([]any)) != 1 {
		t.Fatalf("list: %v", r.body)
	}
}

func TestImportCommitToNewMenu(t *testing.T) {
	needDB(t)
	a := register(t, "Import New Menu")
	venue := createVenue(t, a, "Kafana")
	r := upload(t, a.access, venue, pngOfWidth(t, 120))
	expect(t, r, http.StatusAccepted)
	importID := id(r)
	waitImport(t, a.access, importID)

	r = call(t, "POST", "/v1/imports/"+importID+"/commit", a.access, map[string]any{})
	expect(t, r, http.StatusUnprocessableEntity)
	other := register(t, "Other")
	otherMenu := call(t, "POST", "/v1/venues/"+createVenue(t, other, "X")+"/menus", other.access, map[string]string{"name": "M"})
	r = call(t, "POST", "/v1/imports/"+importID+"/commit", a.access, map[string]any{"menu_id": id(otherMenu)})
	expect(t, r, http.StatusUnprocessableEntity)

	r = call(t, "POST", "/v1/imports/"+importID+"/commit", a.access, map[string]any{"menu_name": "Uvezeni"})
	expect(t, r, http.StatusOK)
	menuID := r.body["menu_id"].(string)
	r = call(t, "GET", "/v1/menus/"+menuID, a.access, nil)
	expect(t, r, http.StatusOK)
	if r.body["name"] != "Uvezeni" || len(r.body["categories"].([]any)) != 1 {
		t.Fatalf("menu: %v", r.body)
	}
}

func TestImportLimitsAndValidation(t *testing.T) {
	needDB(t)
	a := register(t, "Import Limits")
	venue := createVenue(t, a, "Bar")

	// Wrong type, too many pages, no files.
	r := upload(t, a.access, venue, []byte("just some text, not a menu"))
	expect(t, r, http.StatusUnsupportedMediaType)
	many := make([][]byte, 21)
	for i := range many {
		many[i] = pngOfWidth(t, 120)
	}
	r = upload(t, a.access, venue, many...)
	expect(t, r, http.StatusUnprocessableEntity)
	r = upload(t, a.access, venue)
	expect(t, r, http.StatusUnprocessableEntity)

	// Lower the limit (platform admins change it) to 1.
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, ownerURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, _ := pool.Begin(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.tenant_id', $1, true)`, a.tenantID)
	if _, err := tx.Exec(ctx, `UPDATE venues SET ocr_import_limit = 1 WHERE id = $1`, venue); err != nil {
		t.Fatal(err)
	}
	_ = tx.Commit(ctx)

	// A fully failed import does not use up the limit.
	stubExtractor.failWidth.Store(130)
	r = upload(t, a.access, venue, pngOfWidth(t, 130))
	expect(t, r, http.StatusAccepted)
	failed := id(r)
	if r = waitImport(t, a.access, failed); r.body["status"] != "failed" {
		t.Fatalf("expected failed: %v", r.body)
	}
	stubExtractor.failWidth.Store(0)

	r = upload(t, a.access, venue, pngOfWidth(t, 120))
	expect(t, r, http.StatusAccepted)
	r = upload(t, a.access, venue, pngOfWidth(t, 120))
	expect(t, r, http.StatusConflict)
	if errCode(r) != "import_limit_reached" {
		t.Fatalf("code: %s", errCode(r))
	}
	// Retrying the failed one would bring it back over the limit.
	page := waitImport(t, a.access, failed).body["pages"].([]any)[0].(map[string]any)["id"].(string)
	r = call(t, "POST", "/v1/imports/"+failed+"/pages/"+page+"/retry", a.access, nil)
	expect(t, r, http.StatusConflict)
}

func TestImportRolesAndIsolation(t *testing.T) {
	needDB(t)
	a := register(t, "Import Owner")
	venue := createVenue(t, a, "Bar")
	r := upload(t, a.access, venue, pngOfWidth(t, 120))
	expect(t, r, http.StatusAccepted)
	importID := id(r)
	waitImport(t, a.access, importID)

	staff := addMember(t, a, register(t, "Staff Home"), "staff")
	r = upload(t, staff, venue, pngOfWidth(t, 120))
	expect(t, r, http.StatusForbidden)
	r = call(t, "GET", "/v1/imports/"+importID, staff, nil)
	expect(t, r, http.StatusOK)
	r = call(t, "POST", "/v1/imports/"+importID+"/commit", staff, map[string]any{"menu_name": "X"})
	expect(t, r, http.StatusForbidden)

	other := register(t, "Import Intruder")
	for _, path := range []string{"/v1/imports/" + importID, "/v1/venues/" + venue + "/imports"} {
		r = call(t, "GET", path, other.access, nil)
		expect(t, r, http.StatusNotFound)
	}
	r = upload(t, other.access, venue, pngOfWidth(t, 120))
	expect(t, r, http.StatusNotFound)
	r = call(t, "POST", "/v1/imports/"+importID+"/commit", other.access, map[string]any{"menu_name": "X"})
	expect(t, r, http.StatusNotFound)
}
