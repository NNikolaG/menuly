package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

// publicCacheControl lets browsers and CDNs reuse the menu briefly. Price
// changes reach guests within max-age; revalidation with the ETag is cheap.
const publicCacheControl = "public, max-age=30, stale-while-revalidate=60"

type publicVariant struct {
	ID           uuid.UUID       `json:"id"`
	Label        string          `json:"label"`
	Translations json.RawMessage `json:"translations"`
	PriceMinor   int64           `json:"price_minor"`
}

type publicItem struct {
	ID           uuid.UUID       `json:"id"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Translations json.RawMessage `json:"translations"`
	Tags         []string        `json:"tags"`
	Allergens    []string        `json:"allergens"`
	ImageURL     string          `json:"image_url"`
	IsAvailable  bool            `json:"is_available"`
	Variants     []publicVariant `json:"variants"`
}

type publicCategory struct {
	ID           uuid.UUID       `json:"id"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Translations json.RawMessage `json:"translations"`
	Items        []publicItem    `json:"items"`
}

type publicMenu struct {
	Lang   string `json:"lang"`
	Tenant struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	} `json:"tenant"`
	Venue struct {
		Name     string `json:"name"`
		Slug     string `json:"slug"`
		Address  string `json:"address"`
		Phone    string `json:"phone"`
		Currency string `json:"currency"`
		Timezone string `json:"timezone"`
	} `json:"venue"`
	Menu struct {
		ID          uuid.UUID        `json:"id"`
		Name        string           `json:"name"`
		PublishedAt *time.Time       `json:"published_at"`
		Categories  []publicCategory `json:"categories"`
	} `json:"menu"`
	// Promotions that are live now; featured ones are meant for the banner.
	Promotions []publicPromotion `json:"promotions"`
}

// localize returns base, or the translation of field in lang when present.
func localize(translations []byte, lang, field, base string) string {
	if lang == "" || lang == "sr" {
		return base
	}
	var m map[string]map[string]string
	if json.Unmarshal(translations, &m) != nil {
		return base
	}
	if v := strings.TrimSpace(m[lang][field]); v != "" {
		return v
	}
	return base
}

// GET /v1/public/menus/{tenantSlug}/{venueSlug}?lang=en
//
// No auth. Returns the venue's published menu: visible categories and items
// only; unavailable items stay in, after the available ones of their
// category. With ?lang the text fields are translated where a translation
// exists, falling back to Serbian.
func (s *Server) handlePublicMenu(w http.ResponseWriter, r *http.Request) {
	tenantSlug := strings.ToLower(chi.URLParam(r, "tenantSlug"))
	venueSlug := strings.ToLower(chi.URLParam(r, "venueSlug"))
	lang := strings.ToLower(r.URL.Query().Get("lang"))
	if lang != "" && !langRe.MatchString(lang) {
		writeError(w, r, errValidation("lang must be a 2-letter language code"))
		return
	}

	var out publicMenu
	err := s.db.PublicTx(r.Context(), tenantSlug, func(q *sqlc.Queries, t sqlc.GetPublicTenantBySlugRow) error {
		ctx := r.Context()
		v, err := q.GetVenueBySlug(ctx, sqlc.GetVenueBySlugParams{TenantID: t.ID, Slug: venueSlug})
		if err != nil {
			return err
		}
		if v.ActiveMenuID == nil {
			return errNotFound
		}
		tree, err := loadMenuTree(r, q, t.ID, *v.ActiveMenuID)
		if err != nil {
			return err
		}
		if tree.Status != "published" {
			return errNotFound
		}
		out.Lang = lang
		if out.Lang == "" {
			out.Lang = "sr"
		}
		out.Tenant.Name, out.Tenant.Slug = t.Name, t.Slug
		out.Venue.Name, out.Venue.Slug, out.Venue.Address, out.Venue.Phone = v.Name, v.Slug, v.Address, v.Phone
		out.Venue.Currency, out.Venue.Timezone = v.Currency, v.Timezone
		out.Menu.ID, out.Menu.Name, out.Menu.PublishedAt = tree.ID, tree.Name, tree.PublishedAt
		out.Menu.Categories = buildPublicCategories(tree, lang)
		out.Promotions, err = buildPublicPromotions(ctx, q, t.ID, v, tree, lang)
		return err
	})
	if err != nil {
		writeError(w, r, notFoundAs(err))
		return
	}

	body, err := json.Marshal(out)
	if err != nil {
		writeError(w, r, err)
		return
	}
	sum := sha256.Sum256(body)
	etag := `"` + hex.EncodeToString(sum[:16]) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", publicCacheControl)
	w.Header().Set("Vary", "Accept-Encoding")
	if etagMatches(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write(body)
}

func buildPublicCategories(tree menuTreeDTO, lang string) []publicCategory {
	cats := make([]publicCategory, 0, len(tree.Categories))
	for _, c := range tree.Categories {
		if !c.IsVisible {
			continue
		}
		pc := publicCategory{
			ID:           c.ID,
			Name:         localize(c.Translations, lang, "name", c.Name),
			Description:  localize(c.Translations, lang, "description", c.Description),
			Translations: c.Translations,
			Items:        []publicItem{},
		}
		for _, it := range c.Items {
			if !it.IsVisible {
				continue
			}
			pi := publicItem{
				ID:           it.ID,
				Name:         localize(it.Translations, lang, "name", it.Name),
				Description:  localize(it.Translations, lang, "description", it.Description),
				Translations: it.Translations,
				Tags:         it.Tags, Allergens: it.Allergens, ImageURL: it.ImageUrl,
				IsAvailable: it.IsAvailable,
				Variants:    make([]publicVariant, 0, len(it.Variants)),
			}
			for _, v := range it.Variants {
				pi.Variants = append(pi.Variants, publicVariant{
					ID: v.ID, Label: localize(v.Translations, lang, "label", v.Label),
					Translations: v.Translations, PriceMinor: v.PriceMinor,
				})
			}
			pc.Items = append(pc.Items, pi)
		}
		// Items arrive in position order; move unavailable ones to the end,
		// keeping their relative order.
		sort.SliceStable(pc.Items, func(i, j int) bool { return pc.Items[i].IsAvailable && !pc.Items[j].IsAvailable })
		cats = append(cats, pc)
	}
	return cats
}

func etagMatches(header, etag string) bool {
	if header == "" {
		return false
	}
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimPrefix(strings.TrimSpace(part), "W/")
		if part == etag || part == "*" {
			return true
		}
	}
	return false
}
