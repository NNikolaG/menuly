package httpapi

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	qrcode "github.com/skip2/go-qrcode"

	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

const defaultPublicMenuURL = "https://{tenant}.menuly.app/{venue}"

// publicMenuURL fills the {tenant} and {venue} placeholders of the template.
func (s *Server) publicMenuURL(tenantSlug, venueSlug string) string {
	tpl := s.publicURLTemplate
	if tpl == "" {
		tpl = defaultPublicMenuURL
	}
	return strings.NewReplacer("{tenant}", tenantSlug, "{venue}", venueSlug).Replace(tpl)
}

func (s *Server) venuePublicURL(r *http.Request) (url, venueSlug string, err error) {
	p := mustPrincipal(r)
	id, err := urlID(r, "venueID")
	if err != nil {
		return "", "", err
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		v, err := q.GetVenue(r.Context(), sqlc.GetVenueParams{TenantID: p.TenantID, ID: id})
		if err != nil {
			return err
		}
		t, err := q.GetTenant(r.Context(), p.TenantID)
		if err != nil {
			return err
		}
		url, venueSlug = s.publicMenuURL(t.Slug, v.Slug), v.Slug
		return nil
	})
	return url, venueSlug, notFoundAs(err)
}

// GET /v1/venues/{venueID}/public-link
func (s *Server) handleVenuePublicLink(w http.ResponseWriter, r *http.Request) {
	url, _, err := s.venuePublicURL(r)
	writeResult(w, r, http.StatusOK, map[string]string{"url": url}, err)
}

// GET /v1/venues/{venueID}/qr?format=png|svg&size=512&download=1
func (s *Server) handleVenueQR(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	format := strings.ToLower(q.Get("format"))
	if format == "" {
		format = "png"
	}
	if format != "png" && format != "svg" {
		writeError(w, r, errValidation("format must be png or svg"))
		return
	}
	size := 512
	if v := q.Get("size"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 128 || n > 2048 {
			writeError(w, r, errValidation("size must be between 128 and 2048"))
			return
		}
		size = n
	}

	url, slug, err := s.venuePublicURL(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	// Medium error correction survives a scuffed table card and still keeps
	// the code small.
	code, err := qrcode.New(url, qrcode.Medium)
	if err != nil {
		writeError(w, r, err)
		return
	}

	w.Header().Set("Cache-Control", "private, max-age=300")
	if q.Get("download") == "1" {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="menuly-%s.%s"`, slug, format))
	}
	if format == "svg" {
		w.Header().Set("Content-Type", "image/svg+xml")
		_, _ = w.Write([]byte(qrSVG(code.Bitmap(), size)))
		return
	}
	png, err := code.PNG(size)
	if err != nil {
		writeError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	_, _ = w.Write(png)
}

// qrSVG renders the bitmap (which already includes the quiet zone) as one
// path of unit squares, scaled by viewBox, so it prints sharp at any size.
func qrSVG(bitmap [][]bool, size int) string {
	n := len(bitmap)
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" shape-rendering="crispEdges">`, size, size, n, n)
	fmt.Fprintf(&b, `<rect width="%d" height="%d" fill="#fff"/><path fill="#000" d="`, n, n)
	for y, row := range bitmap {
		for x := 0; x < len(row); x++ {
			if !row[x] {
				continue
			}
			start := x
			for x < len(row) && row[x] {
				x++
			}
			fmt.Fprintf(&b, "M%d %dh%dv1h-%dz", start, y, x-start, x-start)
		}
	}
	b.WriteString(`"/></svg>`)
	return b.String()
}
