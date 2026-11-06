// Package httpapi exposes the REST API.
package httpapi

import (
	"context"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/nnikolag/menuly/backend/internal/auth"
	"github.com/nnikolag/menuly/backend/internal/db"
)

type Server struct {
	db     *db.DB
	issuer *auth.Issuer
}

type Options struct {
	CORSAllowedOrigins []string
	// DocsEnabled serves Swagger UI at /docs and the spec at /openapi.yaml.
	DocsEnabled bool
}

func New(database *db.DB, issuer *auth.Issuer) *Server {
	return &Server{db: database, issuer: issuer}
}

func (s *Server) Handler(opts Options) http.Handler {
	r := chi.NewRouter()
	editors := requireRole(auth.RoleOwner, auth.RoleManager)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(requestLogger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		// Admin routes accept the configured origins; the public menu is
		// read from every tenant subdomain, so it accepts any origin.
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			return strings.HasPrefix(r.URL.Path, "/v1/public/") || slices.Contains(opts.CORSAllowedOrigins, origin)
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "If-None-Match"},
		ExposedHeaders:   []string{"X-Request-Id", "ETag"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/readyz", s.handleReady)
	if opts.DocsEnabled {
		r.Get("/openapi.yaml", handleOpenAPI)
		r.Get("/docs", handleDocs)
	}

	r.Route("/v1", func(r chi.Router) {
		r.Get("/public/menus/{tenantSlug}/{venueSlug}", s.handlePublicMenu)

		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", s.handleRegister)
			r.Post("/login", s.handleLogin)
			r.Post("/refresh", s.handleRefresh)
			r.Post("/logout", s.handleLogout)
			r.With(s.requireAuth).Post("/switch-tenant", s.handleSwitchTenant)
		})

		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)
			r.Get("/me", s.handleMe)

			r.Route("/venues", func(r chi.Router) {
				r.Get("/", s.handleListVenues)
				r.With(requireRole(auth.RoleOwner)).Post("/", s.handleCreateVenue)
				r.Route("/{venueID}", func(r chi.Router) {
					r.Get("/", s.handleGetVenue)
					r.With(editors).Patch("/", s.handleUpdateVenue)
					r.With(requireRole(auth.RoleOwner)).Delete("/", s.handleDeleteVenue)
					r.Get("/menus", s.handleListMenus)
					r.With(editors).Post("/menus", s.handleCreateMenu)
				})
			})

			// Menu editing: reads for every member, writes for owner/manager.
			// Staff may only toggle item availability/visibility.
			r.Route("/menus/{menuID}", func(r chi.Router) {
				r.Get("/", s.handleGetMenu)
				r.With(editors).Patch("/", s.handleUpdateMenu)
				r.With(editors).Delete("/", s.handleDeleteMenu)
				r.With(editors).Post("/publish", s.handlePublishMenu)
				r.With(editors).Post("/unpublish", s.handleUnpublishMenu)
				r.With(editors).Post("/categories", s.handleCreateCategory)
				r.With(editors).Put("/categories/order", s.handleReorderCategories)
				r.With(editors).Post("/price-adjustments", s.handlePriceAdjustment)
			})
			r.Route("/categories/{categoryID}", func(r chi.Router) {
				r.With(editors).Patch("/", s.handleUpdateCategory)
				r.With(editors).Delete("/", s.handleDeleteCategory)
				r.With(editors).Post("/items", s.handleCreateItem)
				r.With(editors).Put("/items/order", s.handleReorderItems)
			})
			r.Route("/items/{itemID}", func(r chi.Router) {
				r.Get("/", s.handleGetItem)
				r.With(editors).Patch("/", s.handleUpdateItem)
				r.With(editors).Delete("/", s.handleDeleteItem)
				r.Patch("/status", s.handleUpdateItemStatus)
				r.With(editors).Post("/variants", s.handleCreateVariant)
			})
			r.Route("/variants/{variantID}", func(r chi.Router) {
				r.With(editors).Patch("/", s.handleUpdateVariant)
				r.With(editors).Delete("/", s.handleDeleteVariant)
				r.Get("/price-history", s.handlePriceHistory)
			})
		})
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) { writeError(w, r, errNotFound) })
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, r, &APIError{Status: http.StatusMethodNotAllowed, Code: "method_not_allowed", Message: "method not allowed"})
	})
	return r
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Pool.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "db_unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}
