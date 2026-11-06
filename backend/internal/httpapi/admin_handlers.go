package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

// requirePlatformAdmin checks users.is_platform_admin on every request (not
// a token claim), so revoking the flag takes effect at once.
func (s *Server) requirePlatformAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := mustPrincipal(r)
		var u sqlc.User
		err := s.db.Tx(r.Context(), db.Scope{}, func(q *sqlc.Queries) (err error) {
			u, err = q.GetUserByID(r.Context(), p.UserID)
			return err
		})
		if err != nil || !u.IsPlatformAdmin {
			writeError(w, r, errForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// GET /v1/admin/tenants?q=
func (s *Server) handleAdminListTenants(w http.ResponseWriter, r *http.Request) {
	var rows []sqlc.AdminListTenantsRow
	err := s.db.AdminTx(r.Context(), func(q *sqlc.Queries) (err error) {
		rows, err = q.AdminListTenants(r.Context(), strings.TrimSpace(r.URL.Query().Get("q")))
		return err
	})
	writeResult(w, r, http.StatusOK, map[string]any{"items": rows}, err)
}

// GET /v1/admin/tenants/{tenantID}: tenant, owners and venues with their
// import quota.
func (s *Server) handleAdminGetTenant(w http.ResponseWriter, r *http.Request) {
	id, err := urlID(r, "tenantID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var out struct {
		Tenant tenantDTO                       `json:"tenant"`
		Owners []sqlc.AdminListTenantOwnersRow `json:"owners"`
		Venues []sqlc.AdminListTenantVenuesRow `json:"venues"`
	}
	err = s.db.AdminTx(r.Context(), func(q *sqlc.Queries) error {
		t, err := q.AdminGetTenant(r.Context(), id)
		if err != nil {
			return err
		}
		out.Tenant = toTenantDTO(t)
		if out.Owners, err = q.AdminListTenantOwners(r.Context(), id); err != nil {
			return err
		}
		out.Venues, err = q.AdminListTenantVenues(r.Context(), id)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// PATCH /v1/admin/tenants/{tenantID} {"status": "active"|"suspended"}. A
// suspended tenant's public menu is offline (404).
func (s *Server) handleAdminUpdateTenant(w http.ResponseWriter, r *http.Request) {
	id, err := urlID(r, "tenantID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if in.Status != "active" && in.Status != "suspended" {
		writeError(w, r, errValidation("status must be active or suspended"))
		return
	}
	var out tenantDTO
	err = s.db.AdminTx(r.Context(), func(q *sqlc.Queries) error {
		t, err := q.AdminSetTenantStatus(r.Context(), sqlc.AdminSetTenantStatusParams{ID: id, Status: in.Status})
		out = toTenantDTO(t)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// PATCH /v1/admin/venues/{venueID} {"ocr_import_limit": n}
func (s *Server) handleAdminUpdateVenue(w http.ResponseWriter, r *http.Request) {
	id, err := urlID(r, "venueID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in struct {
		OCRImportLimit *int32 `json:"ocr_import_limit"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if in.OCRImportLimit == nil || *in.OCRImportLimit < 0 || *in.OCRImportLimit > 1000 {
		writeError(w, r, errValidation("ocr_import_limit must be between 0 and 1000"))
		return
	}
	var out sqlc.Venue
	err = s.db.AdminTx(r.Context(), func(q *sqlc.Queries) (err error) {
		out, err = q.AdminSetVenueImportLimit(r.Context(), sqlc.AdminSetVenueImportLimitParams{ID: id, OcrImportLimit: *in.OCRImportLimit})
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// GET /v1/admin/ocr-usage?days=30: OCR pages, tokens and estimated cost per
// tenant and model.
func (s *Server) handleAdminOCRUsage(w http.ResponseWriter, r *http.Request) {
	days := 30
	if v := r.URL.Query().Get("days"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 365 {
			writeError(w, r, errValidation("days must be between 1 and 365"))
			return
		}
		days = n
	}
	var out struct {
		Items           []sqlc.AdminOCRUsageRow `json:"items"`
		TotalCostMicros int64                   `json:"total_cost_micros"`
	}
	err := s.db.AdminTx(r.Context(), func(q *sqlc.Queries) (err error) {
		out.Items, err = q.AdminOCRUsage(r.Context(), time.Now().AddDate(0, 0, -days))
		for _, it := range out.Items {
			out.TotalCostMicros += it.CostMicros
		}
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}
