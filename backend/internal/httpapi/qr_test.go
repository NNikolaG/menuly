package httpapi_test

import (
	"bytes"
	"image/png"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestVenueQRAndPublicLink(t *testing.T) {
	needDB(t)
	f := newMenuFixture(t)
	ts, vs := tenantSlug(t, f.owner), venueSlug(t, f.owner, f.venue)

	r := call(t, "GET", "/v1/venues/"+f.venue+"/public-link", f.owner.access, nil)
	expect(t, r, http.StatusOK)
	if want := "https://" + ts + ".menuly.app/" + vs; r.body["url"] != want {
		t.Fatalf("url = %v, want %s", r.body["url"], want)
	}

	get := func(query string) *http.Response {
		req, _ := http.NewRequest("GET", srv.URL+"/v1/venues/"+f.venue+"/qr"+query, nil)
		req.Header.Set("Authorization", "Bearer "+f.owner.access)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return res
	}

	res := get("?size=300&download=1")
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("png: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	if !strings.Contains(res.Header.Get("Content-Disposition"), "menuly-"+vs+".png") {
		t.Fatalf("disposition: %q", res.Header.Get("Content-Disposition"))
	}
	img, err := png.Decode(bytes.NewReader(body))
	if err != nil || img.Bounds().Dx() != 300 {
		t.Fatalf("png decode: %v, bounds %v", err, img)
	}

	res = get("?format=svg")
	body, _ = io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/svg+xml" || !bytes.HasPrefix(body, []byte("<svg")) {
		t.Fatalf("svg: %d %s %.40s", res.StatusCode, res.Header.Get("Content-Type"), body)
	}

	for _, q := range []string{"?format=gif", "?size=10", "?size=abc"} {
		res = get(q)
		res.Body.Close()
		if res.StatusCode != http.StatusUnprocessableEntity {
			t.Errorf("%s: status %d", q, res.StatusCode)
		}
	}

	other := newMenuFixture(t)
	expect(t, call(t, "GET", "/v1/venues/"+f.venue+"/qr", other.owner.access, nil), http.StatusNotFound)
	expect(t, call(t, "GET", "/v1/venues/"+f.venue+"/public-link", other.owner.access, nil), http.StatusNotFound)
}
