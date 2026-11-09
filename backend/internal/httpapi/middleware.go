package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

// Principal is the authenticated caller: user and tenant from the access
// token, role from the database (see requireAuth).
type Principal struct {
	UserID   uuid.UUID
	TenantID uuid.UUID
	Role     string
}

// Scope returns the RLS scope for the caller's tenant.
func (p Principal) Scope() db.Scope { return db.Scope{TenantID: p.TenantID, UserID: p.UserID} }

type (
	ctxKey     struct{}
	logSlotKey struct{}
)

func principalFrom(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(ctxKey{}).(Principal)
	return p, ok
}

func mustPrincipal(r *http.Request) Principal {
	p, ok := principalFrom(r.Context())
	if !ok {
		panic("mustPrincipal used on a route without requireAuth")
	}
	return p
}

var errTenantSuspended = &APIError{Status: http.StatusForbidden, Code: "tenant_suspended", Message: "this account is suspended"}

// requireAuth authenticates the access token and then reads the caller's
// membership from the database, so the role used by requireRole is the
// current one: a role change, a removed member or a suspended tenant takes
// effect on the next request, not when the token expires.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return s.authenticate(true, next)
}

// requireToken checks only the access token, for routes that must work
// while the caller's current tenant is unavailable (switching tenants).
func (s *Server) requireToken(next http.Handler) http.Handler {
	return s.authenticate(false, next)
}

func (s *Server) authenticate(checkMembership bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || raw == "" {
			writeError(w, r, errUnauthorized)
			return
		}
		claims, err := s.issuer.ParseAccess(raw)
		if err != nil {
			writeError(w, r, errUnauthorized)
			return
		}
		uid, _ := claims.UserID()
		p := Principal{UserID: uid, TenantID: claims.TenantID, Role: claims.Role}
		if checkMembership {
			var m sqlc.GetMemberAccessRow
			err := s.db.Tx(r.Context(), p.Scope(), func(q *sqlc.Queries) (err error) {
				m, err = q.GetMemberAccess(r.Context(), sqlc.GetMemberAccessParams{TenantID: p.TenantID, UserID: p.UserID})
				return err
			})
			switch {
			case errors.Is(err, pgx.ErrNoRows):
				writeError(w, r, errUnauthorized) // removed from the tenant
				return
			case err != nil:
				writeError(w, r, err)
				return
			case m.TenantStatus != "active":
				writeError(w, r, errTenantSuspended)
				return
			}
			p.Role = m.Role
		}
		if slot, ok := r.Context().Value(logSlotKey{}).(*Principal); ok {
			*slot = p
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, p)))
	})
}

// requireRole allows the request only if the caller has one of roles in the
// current tenant. Must be mounted after requireAuth.
func requireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := principalFrom(r.Context())
			if !ok {
				writeError(w, r, errUnauthorized)
				return
			}
			if !slices.Contains(roles, p.Role) {
				writeError(w, r, errForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		var slot Principal // filled in by requireAuth further down the chain
		next.ServeHTTP(ww, r.WithContext(context.WithValue(r.Context(), logSlotKey{}, &slot)))
		attrs := []any{
			"method", r.Method,
			"path", r.URL.Path,
			"status", ww.Status(),
			"bytes", ww.BytesWritten(),
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id", middleware.GetReqID(r.Context()),
		}
		if slot.UserID != uuid.Nil {
			attrs = append(attrs, "tenant_id", slot.TenantID, "user_id", slot.UserID)
		}
		slog.InfoContext(r.Context(), "request", attrs...)
	})
}
