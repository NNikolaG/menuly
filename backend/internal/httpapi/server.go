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
	"github.com/nnikolag/menuly/backend/internal/mail"
	"github.com/nnikolag/menuly/backend/internal/storage"
)

type Server struct {
	db     *db.DB
	issuer *auth.Issuer
	// publicURLTemplate builds a venue's public menu URL, e.g.
	// "https://{tenant}.menuly.app/{venue}".
	publicURLTemplate string
	// store and jobs back menu imports; nil disables the upload endpoints.
	store storage.Store
	jobs  JobQueue
	// mailer sends invitations and password reset links to appURL.
	mailer mail.Mailer
	appURL string
	apiURL string
}

type Options struct {
	CORSAllowedOrigins []string
	// DocsEnabled serves Swagger UI at /docs and the spec at /openapi.yaml.
	DocsEnabled bool
	// PublicMenuURL is the template for QR codes and public links.
	PublicMenuURL string
	// Store keeps uploaded files; Jobs enqueues OCR work. Both are needed
	// for imports, which answer 503 without them.
	Store storage.Store
	Jobs  JobQueue
	// Mailer defaults to logging. AppURL (web admin) is used in email links,
	// PublicAPIURL in uploaded image URLs.
	Mailer       mail.Mailer
	AppURL       string
	PublicAPIURL string
}

func New(database *db.DB, issuer *auth.Issuer) *Server {
	return &Server{db: database, issuer: issuer}
}

func (s *Server) Handler(opts Options) http.Handler {
	s.publicURLTemplate = opts.PublicMenuURL
	s.store, s.jobs = opts.Store, opts.Jobs
	s.mailer, s.appURL, s.apiURL = opts.Mailer, strings.TrimRight(opts.AppURL, "/"), strings.TrimRight(opts.PublicAPIURL, "/")
	if s.mailer == nil {
		s.mailer = mail.Log{}
	}
	if s.appURL == "" {
		s.appURL = "http://localhost:4200"
	}
	if s.apiURL == "" {
		s.apiURL = "http://localhost:8080"
	}
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
		r.Post("/public/menus/{tenantSlug}/{venueSlug}/views", s.handlePublicMenuView)
		r.Get("/public/media/{tenantID}/{name}", s.handlePublicMedia)
		r.Get("/public/invitations/{token}", s.handleGetPublicInvitation)

		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", s.handleRegister)
			r.Post("/login", s.handleLogin)
			r.Post("/refresh", s.handleRefresh)
			r.Post("/logout", s.handleLogout)
			r.With(s.requireAuth).Post("/switch-tenant", s.handleSwitchTenant)
			r.Post("/accept-invite", s.handleAcceptInvitation)
			r.Post("/forgot-password", s.handleForgotPassword)
			r.Post("/reset-password", s.handleResetPassword)
		})

		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)
			r.Get("/me", s.handleMe)
			r.With(editors).Post("/media/images", s.handleUploadImage)

			r.With(editors).Get("/members", s.handleListMembers)
			r.With(requireRole(auth.RoleOwner)).Patch("/members/{userID}", s.handleUpdateMember)
			r.With(requireRole(auth.RoleOwner)).Delete("/members/{userID}", s.handleRemoveMember)
			r.With(editors).Get("/invitations", s.handleListInvitations)
			r.With(editors).Post("/invitations", s.handleCreateInvitation)
			r.With(editors).Delete("/invitations/{invitationID}", s.handleRevokeInvitation)

			r.Route("/admin", func(r chi.Router) {
				r.Use(s.requirePlatformAdmin)
				r.Get("/tenants", s.handleAdminListTenants)
				r.Get("/tenants/{tenantID}", s.handleAdminGetTenant)
				r.Patch("/tenants/{tenantID}", s.handleAdminUpdateTenant)
				r.Patch("/venues/{venueID}", s.handleAdminUpdateVenue)
				r.Get("/ocr-usage", s.handleAdminOCRUsage)
			})

			r.Route("/venues", func(r chi.Router) {
				r.Get("/", s.handleListVenues)
				r.With(requireRole(auth.RoleOwner)).Post("/", s.handleCreateVenue)
				r.Route("/{venueID}", func(r chi.Router) {
					r.Get("/", s.handleGetVenue)
					r.With(editors).Patch("/", s.handleUpdateVenue)
					r.With(requireRole(auth.RoleOwner)).Delete("/", s.handleDeleteVenue)
					r.Get("/menus", s.handleListMenus)
					r.Get("/public-link", s.handleVenuePublicLink)
					r.Get("/stats", s.handleVenueStats)
					r.Get("/qr", s.handleVenueQR)
					r.With(editors).Post("/menus", s.handleCreateMenu)
					r.Get("/promotions", s.handleListPromotions)
					r.With(editors).Post("/promotions", s.handleCreatePromotion)
					r.With(editors).Put("/promotions/order", s.handleReorderPromotions)
					r.Get("/imports", s.handleListImports)
					r.With(editors).Post("/imports", s.handleCreateImport)
				})
			})

			r.Route("/promotions/{promotionID}", func(r chi.Router) {
				r.Get("/", s.handleGetPromotion)
				r.With(editors).Patch("/", s.handleUpdatePromotion)
				r.With(editors).Delete("/", s.handleDeletePromotion)
			})

			// OCR import review: reads for every member, changes for owner/manager.
			r.Route("/imports/{importID}", func(r chi.Router) {
				r.Get("/", s.handleGetImport)
				r.Get("/pages/{pageID}/file", s.handleGetImportFile)
				r.With(editors).Post("/pages", s.handleAddImportPages)
				r.With(editors).Put("/pages/{pageID}/file", s.handleReplaceImportPage)
				r.With(editors).Delete("/pages/{pageID}", s.handleDeleteImportPage)
				r.With(editors).Post("/pages/{pageID}/retry", s.handleRetryImportPage)
				r.With(editors).Put("/draft", s.handleUpdateImportDraft)
				r.With(editors).Post("/commit", s.handleCommitImport)
			})

			// Menu editing: reads for every member, writes for owner/manager.
			// Staff may only toggle item availability/visibility.
			r.Route("/menus/{menuID}", func(r chi.Router) {
				r.Get("/", s.handleGetMenu)
				r.With(editors).Patch("/", s.handleUpdateMenu)
				r.With(editors).Delete("/", s.handleDeleteMenu)
				r.With(editors).Post("/publish", s.handlePublishMenu)
				r.With(editors).Post("/unpublish", s.handleUnpublishMenu)
				r.Get("/theme", s.handleGetMenuTheme)
				r.With(editors).Put("/theme", s.handlePutMenuTheme)
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
