package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/db"
)

// Principal is the authenticated caller, taken from the access token.
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

func (s *Server) requireAuth(next http.Handler) http.Handler {
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
