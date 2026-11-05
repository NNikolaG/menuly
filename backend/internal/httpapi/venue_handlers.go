package httpapi

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

var (
	slugRe     = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	currencyRe = regexp.MustCompile(`^[A-Z]{3}$`)
	nonSlugRe  = regexp.MustCompile(`[^a-z0-9]+`)
	// Serbian Latin and Cyrillic to ASCII, so "Ćevapdžinica Đorđe" -> "cevapdzinica-djordje".
	slugReplacer = strings.NewReplacer(
		"č", "c", "ć", "c", "š", "s", "ž", "z", "đ", "dj",
		"а", "a", "б", "b", "в", "v", "г", "g", "д", "d", "ђ", "dj", "е", "e", "ж", "z", "з", "z",
		"и", "i", "ј", "j", "к", "k", "л", "l", "љ", "lj", "м", "m", "н", "n", "њ", "nj", "о", "o",
		"п", "p", "р", "r", "с", "s", "т", "t", "ћ", "c", "у", "u", "ф", "f", "х", "h", "ц", "c",
		"ч", "c", "џ", "dz", "ш", "s",
	)
)

func slugify(s string) string { return slugifyMax(s, 60) }

func slugifyMax(s string, max int) string {
	s = slugReplacer.Replace(strings.ToLower(s))
	s = strings.Trim(nonSlugRe.ReplaceAllString(s, "-"), "-")
	if len(s) > max {
		s = strings.TrimRight(s[:max], "-")
	}
	return s
}

const maxTenantSlugLen = 40

// Subdomains we keep for ourselves.
var reservedTenantSlugs = map[string]bool{
	"www": true, "api": true, "app": true, "admin": true,
	"mail": true, "static": true, "cdn": true, "docs": true,
	"help": true, "support": true, "status": true, "blog": true,
}

func validateTenantSlug(slug string) *APIError {
	if !slugRe.MatchString(slug) || len(slug) > maxTenantSlugLen {
		return errValidation("tenant_slug may contain only a-z, 0-9 and single dashes (max 40)")
	}
	if reservedTenantSlugs[slug] {
		return errValidation("tenant_slug is reserved")
	}
	return nil
}

func randomSuffix() string {
	b := make([]byte, 2)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

var errSlugTaken = &APIError{Status: http.StatusConflict, Code: "slug_taken", Message: "another venue in this account already uses this slug"}

type venueInput struct {
	Name         *string          `json:"name"`
	Slug         *string          `json:"slug"`
	Address      *string          `json:"address"`
	Phone        *string          `json:"phone"`
	Currency     *string          `json:"currency"`
	Timezone     *string          `json:"timezone"`
	OpeningHours *json.RawMessage `json:"opening_hours"`
}

// normalize trims fields and validates whatever is present.
func (in *venueInput) normalize() *APIError {
	for _, f := range []*string{in.Name, in.Slug, in.Address, in.Phone, in.Currency, in.Timezone} {
		if f != nil {
			*f = trim(*f)
		}
	}
	if in.Name != nil && *in.Name == "" {
		return errValidation("name must not be empty")
	}
	if in.Slug != nil {
		*in.Slug = strings.ToLower(*in.Slug)
		if !slugRe.MatchString(*in.Slug) || len(*in.Slug) > 60 {
			return errValidation("slug may contain only a-z, 0-9 and single dashes (max 60)")
		}
	}
	if in.Currency != nil {
		*in.Currency = strings.ToUpper(*in.Currency)
		if !currencyRe.MatchString(*in.Currency) {
			return errValidation("currency must be an ISO 4217 code, e.g. RSD")
		}
	}
	if in.Timezone != nil {
		if _, err := time.LoadLocation(*in.Timezone); err != nil || *in.Timezone == "" {
			return errValidation("timezone must be an IANA name, e.g. Europe/Belgrade")
		}
	}
	if in.OpeningHours != nil {
		b := bytes.TrimSpace(*in.OpeningHours)
		if len(b) == 0 || b[0] != '{' {
			return errValidation("opening_hours must be a JSON object")
		}
	}
	return nil
}

func strOr(p *string, def string) string {
	if p == nil {
		return def
	}
	return *p
}

// GET /v1/venues
func (s *Server) handleListVenues(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	var venues []sqlc.Venue
	err := s.db.Tx(r.Context(), p.Scope(), func(q *sqlc.Queries) (err error) {
		venues, err = q.ListVenues(r.Context(), p.TenantID)
		return err
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": venues})
}

// POST /v1/venues
func (s *Server) handleCreateVenue(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	var in venueInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if in.Name == nil {
		writeError(w, r, errValidation("name is required"))
		return
	}
	if in.Slug == nil || trim(*in.Slug) == "" {
		slug := slugify(*in.Name)
		in.Slug = &slug
	}
	if apiErr := in.normalize(); apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	hours := json.RawMessage(`{}`)
	if in.OpeningHours != nil {
		hours = *in.OpeningHours
	}
	var v sqlc.Venue
	err := s.db.Tx(r.Context(), p.Scope(), func(q *sqlc.Queries) (err error) {
		v, err = q.CreateVenue(r.Context(), sqlc.CreateVenueParams{
			ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID,
			Name: *in.Name, Slug: *in.Slug,
			Address: strOr(in.Address, ""), Phone: strOr(in.Phone, ""),
			Currency: strOr(in.Currency, "RSD"), Timezone: strOr(in.Timezone, "Europe/Belgrade"),
			OpeningHours: hours,
		})
		return err
	})
	if db.IsUniqueViolation(err, "venues_tenant_slug_key") {
		writeError(w, r, errSlugTaken)
		return
	} else if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, v)
}

func venueID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, "venueID"))
	if err != nil {
		return uuid.Nil, errNotFound
	}
	return id, nil
}

// GET /v1/venues/{venueID}
func (s *Server) handleGetVenue(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := venueID(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	var v sqlc.Venue
	err = s.db.Tx(r.Context(), p.Scope(), func(q *sqlc.Queries) (err error) {
		v, err = q.GetVenue(r.Context(), sqlc.GetVenueParams{TenantID: p.TenantID, ID: id})
		return err
	})
	if db.IsNotFound(err) {
		writeError(w, r, errNotFound)
		return
	} else if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// PATCH /v1/venues/{venueID}
func (s *Server) handleUpdateVenue(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := venueID(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in venueInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if apiErr := in.normalize(); apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	params := sqlc.UpdateVenueParams{
		TenantID: p.TenantID, ID: id,
		Name: in.Name, Slug: in.Slug, Address: in.Address, Phone: in.Phone,
		Currency: in.Currency, Timezone: in.Timezone,
	}
	if in.OpeningHours != nil {
		params.OpeningHours = *in.OpeningHours
	}
	var v sqlc.Venue
	err = s.db.Tx(r.Context(), p.Scope(), func(q *sqlc.Queries) (err error) {
		v, err = q.UpdateVenue(r.Context(), params)
		return err
	})
	switch {
	case db.IsNotFound(err):
		writeError(w, r, errNotFound)
	case db.IsUniqueViolation(err, "venues_tenant_slug_key"):
		writeError(w, r, errSlugTaken)
	case err != nil:
		writeError(w, r, err)
	default:
		writeJSON(w, http.StatusOK, v)
	}
}

// DELETE /v1/venues/{venueID}
func (s *Server) handleDeleteVenue(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := venueID(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	var n int64
	err = s.db.Tx(r.Context(), p.Scope(), func(q *sqlc.Queries) (err error) {
		n, err = q.DeleteVenue(r.Context(), sqlc.DeleteVenueParams{TenantID: p.TenantID, ID: id})
		return err
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	if n == 0 {
		writeError(w, r, errNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
