package httpapi

import (
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/auth"
	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

const minPasswordLen = 8

type userDTO struct {
	ID     uuid.UUID `json:"id"`
	Email  string    `json:"email"`
	Name   string    `json:"name"`
	Locale string    `json:"locale"`
}

func toUserDTO(u sqlc.User) userDTO {
	return userDTO{ID: u.ID, Email: u.Email, Name: u.Name, Locale: u.Locale}
}

type tenantDTO struct {
	ID     uuid.UUID `json:"id"`
	Name   string    `json:"name"`
	Slug   string    `json:"slug"`
	Plan   string    `json:"plan"`
	Status string    `json:"status"`
}

func toTenantDTO(t sqlc.Tenant) tenantDTO {
	return tenantDTO{ID: t.ID, Name: t.Name, Slug: t.Slug, Plan: t.Plan, Status: t.Status}
}

type tokenPair struct {
	TokenType             string    `json:"token_type"`
	AccessToken           string    `json:"access_token"`
	AccessTokenExpiresAt  time.Time `json:"access_token_expires_at"`
	RefreshToken          string    `json:"refresh_token"`
	RefreshTokenExpiresAt time.Time `json:"refresh_token_expires_at"`
	TenantID              uuid.UUID `json:"tenant_id"`
	Role                  string    `json:"role"`
}

// issueTokens creates a refresh token row inside q's transaction and signs an
// access token for (user, tenant, role).
func (s *Server) issueTokens(r *http.Request, q *sqlc.Queries, userID, tenantID uuid.UUID, role string) (tokenPair, error) {
	refresh, hash, err := auth.NewRefreshToken()
	if err != nil {
		return tokenPair{}, err
	}
	refreshExp := time.Now().Add(s.issuer.RefreshTTL())
	if err := q.CreateRefreshToken(r.Context(), sqlc.CreateRefreshTokenParams{
		ID: uuid.Must(uuid.NewV7()), UserID: userID, TenantID: tenantID, TokenHash: hash, ExpiresAt: refreshExp,
	}); err != nil {
		return tokenPair{}, err
	}
	access, accessExp, err := s.issuer.IssueAccess(userID, tenantID, role)
	if err != nil {
		return tokenPair{}, err
	}
	return tokenPair{
		TokenType: "Bearer", AccessToken: access, AccessTokenExpiresAt: accessExp,
		RefreshToken: refresh, RefreshTokenExpiresAt: refreshExp,
		TenantID: tenantID, Role: role,
	}, nil
}

// POST /v1/auth/register
func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name         string `json:"name"`
		Email        string `json:"email"`
		Password     string `json:"password"`
		BusinessName string `json:"business_name"`
		TenantSlug   string `json:"tenant_slug"`
		Locale       string `json:"locale"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	in.Name, in.BusinessName, in.Email = trim(in.Name), trim(in.BusinessName), trim(in.Email)
	if in.Locale == "" {
		in.Locale = "sr-Latn"
	}
	switch {
	case in.Name == "":
		writeError(w, r, errValidation("name is required"))
		return
	case in.BusinessName == "":
		writeError(w, r, errValidation("business_name is required"))
		return
	case !validEmail(in.Email):
		writeError(w, r, errValidation("email is invalid"))
		return
	case len(in.Password) < minPasswordLen:
		writeError(w, r, errValidation("password must be at least 8 characters"))
		return
	}
	// The tenant slug is the public subdomain. If the client does not choose
	// one it is derived from the business name, with a random suffix on
	// collision.
	autoSlug := trim(in.TenantSlug) == ""
	slug := strings.ToLower(trim(in.TenantSlug))
	if autoSlug {
		slug = slugifyMax(in.BusinessName, maxTenantSlugLen)
		if slug == "" || reservedTenantSlugs[slug] {
			slug = strings.Trim(slug+"-"+randomSuffix(), "-")
		}
	} else if apiErr := validateTenantSlug(slug); apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		writeError(w, r, err)
		return
	}

	tenantID, userID := uuid.Must(uuid.NewV7()), uuid.Must(uuid.NewV7())
	var (
		out struct {
			tokenPair
			User   userDTO   `json:"user"`
			Tenant tenantDTO `json:"tenant"`
		}
	)
	for attempt := 0; ; attempt++ {
		err = s.db.Tx(r.Context(), db.Scope{TenantID: tenantID, UserID: userID}, func(q *sqlc.Queries) error {
			return s.createAccount(r, q, &out.tokenPair, &out.User, &out.Tenant, createAccountInput{
				tenantID: tenantID, userID: userID, slug: slug, business: in.BusinessName,
				name: in.Name, email: in.Email, hash: hash, locale: in.Locale,
			})
		})
		if !db.IsUniqueViolation(err, "tenants_slug_key") {
			break
		}
		if !autoSlug || attempt >= 2 {
			err = &APIError{Status: http.StatusConflict, Code: "tenant_slug_taken", Message: "this subdomain is already taken"}
			break
		}
		base := strings.TrimRight(slugifyMax(in.BusinessName, maxTenantSlugLen-5), "-")
		slug = strings.Trim(base+"-"+randomSuffix(), "-")
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

type createAccountInput struct {
	tenantID, userID                          uuid.UUID
	slug, business, name, email, hash, locale string
}

// createAccount creates tenant, owner user, membership and tokens in one tx.
func (s *Server) createAccount(r *http.Request, q *sqlc.Queries, tokens *tokenPair, user *userDTO, tenant *tenantDTO, in createAccountInput) error {
	tenantID, userID := in.tenantID, in.userID
	t, err := q.CreateTenant(r.Context(), sqlc.CreateTenantParams{ID: tenantID, Name: in.business, Slug: in.slug})
	if err != nil {
		return err
	}
	u, err := q.CreateUser(r.Context(), sqlc.CreateUserParams{
		ID: userID, Email: in.email, PasswordHash: in.hash, Name: in.name, Locale: in.locale,
	})
	if err != nil {
		if db.IsUniqueViolation(err, "users_email_key") {
			return &APIError{Status: http.StatusConflict, Code: "email_taken", Message: "an account with this email already exists"}
		}
		return err
	}
	if _, err := q.CreateMembership(r.Context(), sqlc.CreateMembershipParams{
		TenantID: tenantID, UserID: userID, Role: auth.RoleOwner,
	}); err != nil {
		return err
	}
	*tokens, err = s.issueTokens(r, q, userID, tenantID, auth.RoleOwner)
	*user, *tenant = toUserDTO(u), toTenantDTO(t)
	return err
}

var errBadCredentials = &APIError{Status: http.StatusUnauthorized, Code: "invalid_credentials", Message: "email or password is incorrect"}

// POST /v1/auth/login
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string     `json:"email"`
		Password string     `json:"password"`
		TenantID *uuid.UUID `json:"tenant_id"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	var u sqlc.User
	err := s.db.Tx(r.Context(), db.Scope{}, func(q *sqlc.Queries) (err error) {
		u, err = q.GetUserByEmail(r.Context(), trim(in.Email))
		return err
	})
	if db.IsNotFound(err) {
		auth.CheckPasswordDummy(in.Password)
		writeError(w, r, errBadCredentials)
		return
	} else if err != nil {
		writeError(w, r, err)
		return
	}
	if !auth.CheckPassword(u.PasswordHash, in.Password) {
		writeError(w, r, errBadCredentials)
		return
	}

	var out tokenPair
	err = s.db.Tx(r.Context(), db.Scope{UserID: u.ID}, func(q *sqlc.Queries) error {
		ms, err := q.ListUserMemberships(r.Context(), u.ID)
		if err != nil {
			return err
		}
		m, apiErr := pickMembership(ms, in.TenantID)
		if apiErr != nil {
			return apiErr
		}
		out, err = s.issueTokens(r, q, u.ID, m.TenantID, m.Role)
		return err
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// pickMembership chooses the requested tenant, or the first active one.
func pickMembership(ms []sqlc.ListUserMembershipsRow, want *uuid.UUID) (sqlc.ListUserMembershipsRow, *APIError) {
	for _, m := range ms {
		if want != nil && m.TenantID != *want {
			continue
		}
		if m.TenantStatus != "active" {
			if want != nil {
				return m, &APIError{Status: http.StatusForbidden, Code: "tenant_suspended", Message: "this account is suspended"}
			}
			continue
		}
		return m, nil
	}
	return sqlc.ListUserMembershipsRow{}, &APIError{Status: http.StatusForbidden, Code: "no_tenant", Message: "user is not an active member of the requested tenant"}
}

var errBadRefresh = &APIError{Status: http.StatusUnauthorized, Code: "invalid_refresh_token", Message: "refresh token is invalid or expired"}

// POST /v1/auth/refresh rotates the refresh token. Reusing a revoked token
// revokes every session of that user (token theft detection).
func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	var old sqlc.RefreshToken
	valid := false
	err := s.db.Tx(r.Context(), db.Scope{}, func(q *sqlc.Queries) (err error) {
		old, err = q.GetRefreshTokenForUpdate(r.Context(), auth.HashRefreshToken(in.RefreshToken))
		if err != nil {
			return err
		}
		switch {
		case old.RevokedAt != nil:
			return q.RevokeAllUserRefreshTokens(r.Context(), old.UserID)
		case time.Now().After(old.ExpiresAt):
			return nil
		}
		valid = true
		return q.RevokeRefreshToken(r.Context(), old.ID)
	})
	if db.IsNotFound(err) || (err == nil && !valid) {
		writeError(w, r, errBadRefresh)
		return
	} else if err != nil {
		writeError(w, r, err)
		return
	}

	var out tokenPair
	err = s.db.Tx(r.Context(), db.Scope{TenantID: old.TenantID, UserID: old.UserID}, func(q *sqlc.Queries) error {
		m, err := q.GetMembership(r.Context(), sqlc.GetMembershipParams{TenantID: old.TenantID, UserID: old.UserID})
		if db.IsNotFound(err) {
			return errBadRefresh
		} else if err != nil {
			return err
		}
		t, err := q.GetTenant(r.Context(), old.TenantID)
		if err != nil {
			return err
		}
		if t.Status != "active" {
			return &APIError{Status: http.StatusForbidden, Code: "tenant_suspended", Message: "this account is suspended"}
		}
		out, err = s.issueTokens(r, q, old.UserID, old.TenantID, m.Role)
		return err
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /v1/auth/logout revokes the given refresh token. Always 204 so the
// endpoint does not reveal whether a token existed.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	err := s.db.Tx(r.Context(), db.Scope{}, func(q *sqlc.Queries) error {
		t, err := q.GetRefreshTokenForUpdate(r.Context(), auth.HashRefreshToken(in.RefreshToken))
		if db.IsNotFound(err) {
			return nil
		} else if err != nil {
			return err
		}
		return q.RevokeRefreshToken(r.Context(), t.ID)
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /v1/auth/switch-tenant issues tokens for another tenant the caller
// belongs to.
func (s *Server) handleSwitchTenant(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	var in struct {
		TenantID uuid.UUID `json:"tenant_id"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	var out tokenPair
	err := s.db.Tx(r.Context(), db.Scope{UserID: p.UserID}, func(q *sqlc.Queries) error {
		ms, err := q.ListUserMemberships(r.Context(), p.UserID)
		if err != nil {
			return err
		}
		m, apiErr := pickMembership(ms, &in.TenantID)
		if apiErr != nil {
			return apiErr
		}
		out, err = s.issueTokens(r, q, p.UserID, m.TenantID, m.Role)
		return err
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

type membershipDTO struct {
	TenantID     uuid.UUID `json:"tenant_id"`
	TenantName   string    `json:"tenant_name"`
	TenantStatus string    `json:"tenant_status"`
	Role         string    `json:"role"`
}

// GET /v1/me
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	var out struct {
		User        userDTO         `json:"user"`
		Tenant      tenantDTO       `json:"tenant"`
		Role        string          `json:"role"`
		Memberships []membershipDTO `json:"memberships"`
	}
	err := s.db.Tx(r.Context(), p.Scope(), func(q *sqlc.Queries) error {
		u, err := q.GetUserByID(r.Context(), p.UserID)
		if err != nil {
			return err
		}
		t, err := q.GetTenant(r.Context(), p.TenantID)
		if err != nil {
			return err
		}
		ms, err := q.ListUserMemberships(r.Context(), p.UserID)
		if err != nil {
			return err
		}
		out.User, out.Tenant, out.Role = toUserDTO(u), toTenantDTO(t), p.Role
		out.Memberships = make([]membershipDTO, 0, len(ms))
		for _, m := range ms {
			out.Memberships = append(out.Memberships, membershipDTO{
				TenantID: m.TenantID, TenantName: m.TenantName, TenantStatus: m.TenantStatus, Role: m.Role,
			})
		}
		return nil
	})
	if db.IsNotFound(err) {
		writeError(w, r, errUnauthorized)
		return
	} else if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func validEmail(s string) bool {
	a, err := mail.ParseAddress(s)
	return err == nil && a.Address == s
}
