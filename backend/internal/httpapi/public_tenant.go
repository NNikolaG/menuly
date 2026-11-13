package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

type publicTenantVenue struct {
	Name    string `json:"name"`
	Slug    string `json:"slug"`
	Type    string `json:"type"`
	Address string `json:"address"`
	City    string `json:"city"`
	// Language codes of the published menu, Serbian first.
	Languages []string `json:"languages"`
	// Last change of the venue or its menu.
	UpdatedAt time.Time `json:"updated_at"`
}

type publicTenant struct {
	Tenant struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	} `json:"tenant"`
	Venues []publicTenantVenue `json:"venues"`
}

// GET /v1/public/tenants/{tenantSlug}
//
// No auth. The tenant and its venues that have a published menu: what the
// tenant's own page lists and what its sitemap is built from.
func (s *Server) handlePublicTenant(w http.ResponseWriter, r *http.Request) {
	tenantSlug := strings.ToLower(chi.URLParam(r, "tenantSlug"))
	out := publicTenant{Venues: []publicTenantVenue{}}
	err := s.db.PublicTx(r.Context(), tenantSlug, func(q *sqlc.Queries, t sqlc.GetPublicTenantBySlugRow) error {
		out.Tenant.Name, out.Tenant.Slug = t.Name, t.Slug
		rows, err := q.ListPublicVenues(r.Context(), t.ID)
		if err != nil {
			return err
		}
		for _, v := range rows {
			languages := []string{baseLanguage.Code}
			for _, l := range parseLanguages(v.Languages) {
				languages = append(languages, l.Code)
			}
			out.Venues = append(out.Venues, publicTenantVenue{
				Name: v.Name, Slug: v.Slug, Type: v.VenueType, Address: v.Address, City: v.City,
				Languages: languages, UpdatedAt: v.UpdatedAt,
			})
		}
		return nil
	})
	if err != nil {
		writeError(w, r, notFoundAs(err))
		return
	}
	w.Header().Set("Cache-Control", publicCacheControl)
	writeJSON(w, http.StatusOK, out)
}
