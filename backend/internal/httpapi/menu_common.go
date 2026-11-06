package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

// tx runs fn in a transaction scoped to the caller's tenant.
func (s *Server) tx(r *http.Request, fn func(q *sqlc.Queries) error) error {
	return s.db.Tx(r.Context(), mustPrincipal(r).Scope(), fn)
}

// urlID parses a UUID path parameter; malformed IDs are reported as 404.
func urlID(r *http.Request, name string) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		return uuid.Nil, errNotFound
	}
	return id, nil
}

// notFoundAs maps "no rows" to a 404 and leaves other errors alone.
func notFoundAs(err error) error {
	if db.IsNotFound(err) {
		return errNotFound
	}
	return err
}

func writeResult(w http.ResponseWriter, r *http.Request, status int, v any, err error) {
	if err != nil {
		writeError(w, r, notFoundAs(err))
		return
	}
	if v == nil {
		w.WriteHeader(status)
		return
	}
	writeJSON(w, status, v)
}

var langRe = regexp.MustCompile(`^[a-z]{2}$`)

// normalizeTranslations validates {"en": {"name": "...", ...}}. Only the
// given fields are allowed per language. Serbian ("sr") lives in the base
// columns, so it is rejected here to avoid two sources of truth.
func normalizeTranslations(raw *json.RawMessage, fields ...string) ([]byte, *APIError) {
	if raw == nil {
		return nil, nil
	}
	if bytes.Equal(bytes.TrimSpace(*raw), []byte("null")) {
		return []byte(`{}`), nil
	}
	var m map[string]map[string]string
	if err := json.Unmarshal(*raw, &m); err != nil {
		return nil, errValidation(`translations must look like {"en": {"name": "..."}}`)
	}
	for lang, tr := range m {
		if !langRe.MatchString(lang) || lang == "sr" {
			return nil, errValidation("translations: language must be a 2-letter code other than sr (got " + lang + ")")
		}
		for k, v := range tr {
			if !slices.Contains(fields, k) {
				return nil, errValidation("translations: unknown field " + k + " (allowed: " + strings.Join(fields, ", ") + ")")
			}
			tr[k] = strings.TrimSpace(v)
		}
	}
	b, _ := json.Marshal(m)
	return b, nil
}

// normalizeLabels trims, lowercases and de-duplicates tags/allergens.
func normalizeLabels(in []string, field string) ([]string, *APIError) {
	if in == nil {
		return nil, nil
	}
	out := make([]string, 0, len(in))
	for _, v := range in {
		v = strings.ToLower(strings.TrimSpace(v))
		if v == "" || slices.Contains(out, v) {
			continue
		}
		if len(v) > 40 {
			return nil, errValidation(field + ": each value must be at most 40 characters")
		}
		out = append(out, v)
	}
	if len(out) > 20 {
		return nil, errValidation(field + ": at most 20 values")
	}
	return out, nil
}

func requireName(p *string, field string) *APIError {
	if p == nil {
		return nil
	}
	*p = trim(*p)
	if *p == "" {
		return errValidation(field + " must not be empty")
	}
	if len(*p) > 200 {
		return errValidation(field + " must be at most 200 characters")
	}
	return nil
}

// checkImageURL trims the URL and accepts empty or an absolute http(s) URL.
func checkImageURL(p *string) *APIError {
	trimPtr(p)
	if p == nil || *p == "" {
		return nil
	}
	if u, err := url.Parse(*p); err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || len(*p) > 2000 {
		return errValidation("image_url must be an http(s) URL")
	}
	return nil
}

func trimPtr(p *string) {
	if p != nil {
		*p = trim(*p)
	}
}

type orderInput struct {
	IDs []uuid.UUID `json:"ids"`
}

var errBadOrder = errValidation("ids must list every child exactly once")

func (in orderInput) validate(count int64) *APIError {
	if int64(len(in.IDs)) != count {
		return errBadOrder
	}
	seen := make(map[uuid.UUID]bool, len(in.IDs))
	for _, id := range in.IDs {
		if seen[id] {
			return errBadOrder
		}
		seen[id] = true
	}
	return nil
}
