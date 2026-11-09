package httpapi

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/nnikolag/menuly/backend/internal/auth"
	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
	"github.com/nnikolag/menuly/backend/internal/mail"
)

const (
	inviteTTL = 7 * 24 * time.Hour
	resetTTL  = time.Hour
)

var errInvalidToken = &APIError{Status: http.StatusBadRequest, Code: "invalid_token", Message: "this link is invalid or has expired"}

type invitationDTO struct {
	ID        uuid.UUID   `json:"id"`
	Email     string      `json:"email"`
	Role      string      `json:"role"`
	VenueIDs  []uuid.UUID `json:"venue_ids"`
	ExpiresAt time.Time   `json:"expires_at"`
	CreatedAt time.Time   `json:"created_at"`
}

func toInvitationDTO(i sqlc.Invitation) invitationDTO {
	return invitationDTO{ID: i.ID, Email: i.Email, Role: i.Role, VenueIDs: memberVenues(i.Role, i.VenueIds), ExpiresAt: i.ExpiresAt, CreatedAt: i.CreatedAt}
}

// memberVenues is what clients see of memberships.venue_ids: never null, and
// empty for owners, who always reach every venue.
func memberVenues(role string, ids []uuid.UUID) []uuid.UUID {
	if role == auth.RoleOwner || ids == nil {
		return []uuid.UUID{}
	}
	return ids
}

// callerVenueScope returns the venues the caller is limited to, or nil when
// they reach every venue. Row-level security (policy venue_access) applies
// the same rule to every query; handlers need it only to stop a limited
// manager from handing out wider access than they have.
func callerVenueScope(ctx context.Context, q *sqlc.Queries, p Principal) ([]uuid.UUID, error) {
	if p.Role == auth.RoleOwner {
		return nil, nil
	}
	m, err := q.GetMembership(ctx, sqlc.GetMembershipParams{TenantID: p.TenantID, UserID: p.UserID})
	if err != nil {
		return nil, err
	}
	if len(m.VenueIds) == 0 {
		return nil, nil
	}
	return m.VenueIds, nil
}

var errUnknownVenues = errValidation("venue_ids contains a venue that does not exist or that you cannot access")

// cleanVenueIDs removes duplicates and checks that every id is a venue the
// caller can see (RLS hides the others, so a limited caller cannot name
// venues outside their own).
func cleanVenueIDs(ctx context.Context, q *sqlc.Queries, tenantID uuid.UUID, ids []uuid.UUID) ([]uuid.UUID, error) {
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	if len(out) == 0 {
		return out, nil
	}
	if len(out) > 200 {
		return nil, errValidation("venue_ids has too many entries")
	}
	n, err := q.CountVenuesIn(ctx, sqlc.CountVenuesInParams{TenantID: tenantID, Ids: out})
	if err != nil {
		return nil, err
	}
	if n != int64(len(out)) {
		return nil, errUnknownVenues
	}
	return out, nil
}

// sendMail logs instead of failing the request: the action (invite, reset)
// is already saved and can be repeated.
func (s *Server) sendMail(ctx context.Context, m mail.Message) {
	if err := s.mailer.Send(ctx, m); err != nil {
		slog.ErrorContext(ctx, "send email failed", "to", m.To, "subject", m.Subject, "err", err)
	}
}

func (s *Server) link(path, token string) string {
	return s.appURL + path + "?token=" + url.QueryEscape(token)
}

// Members ------------------------------------------------------------------------

// GET /v1/members (owner, manager)
func (s *Server) handleListMembers(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	var rows []sqlc.ListTenantMembersRow
	err := s.tx(r, func(q *sqlc.Queries) (err error) {
		rows, err = q.ListTenantMembers(r.Context(), p.TenantID)
		for i := range rows {
			rows[i].VenueIds = memberVenues(rows[i].Role, rows[i].VenueIds)
		}
		return err
	})
	writeResult(w, r, http.StatusOK, map[string]any{"items": rows}, err)
}

// PATCH /v1/members/{userID} {"role"?: "manager"|"staff", "venue_ids"?: [...]}
// (owner). A new role applies from the member's next login or token
// refresh; venue access applies to their next request.
func (s *Server) handleUpdateMember(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	userID, err := urlID(r, "userID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in struct {
		Role     *string      `json:"role"`
		VenueIDs *[]uuid.UUID `json:"venue_ids"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	switch {
	case in.Role == nil && in.VenueIDs == nil:
		writeError(w, r, errValidation("send role or venue_ids"))
		return
	case in.Role != nil && *in.Role != auth.RoleManager && *in.Role != auth.RoleStaff:
		writeError(w, r, errValidation("role must be manager or staff"))
		return
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		params := sqlc.UpdateMembershipParams{TenantID: p.TenantID, UserID: userID, Role: in.Role}
		if in.VenueIDs != nil {
			ids, err := cleanVenueIDs(r.Context(), q, p.TenantID, *in.VenueIDs)
			if err != nil {
				return err
			}
			params.VenueIds = ids
		}
		n, err := q.UpdateMembership(r.Context(), params)
		if err == nil && n == 0 {
			return errNotFound // not a member, or the owner
		}
		return err
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}

// DELETE /v1/members/{userID} (owner) removes a manager or staff member and
// signs them out of this tenant.
func (s *Server) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	userID, err := urlID(r, "userID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		n, err := q.DeleteMembership(r.Context(), sqlc.DeleteMembershipParams{TenantID: p.TenantID, UserID: userID})
		if err != nil {
			return err
		}
		if n == 0 {
			return errNotFound
		}
		return q.RevokeUserTenantRefreshTokens(r.Context(), sqlc.RevokeUserTenantRefreshTokensParams{UserID: userID, TenantID: p.TenantID})
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}

// Invitations --------------------------------------------------------------------

// POST /v1/invitations {"email", "role", "venue_ids"?}: owners invite
// managers and staff, managers invite staff. A new invite replaces a pending
// one for the email. A manager limited to some venues must name venues, and
// only their own.
func (s *Server) handleCreateInvitation(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	var in struct {
		Email    string      `json:"email"`
		Role     string      `json:"role"`
		VenueIDs []uuid.UUID `json:"venue_ids"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	in.Email = strings.ToLower(trim(in.Email))
	switch {
	case !validEmail(in.Email):
		writeError(w, r, errValidation("email is invalid"))
		return
	case in.Role != auth.RoleManager && in.Role != auth.RoleStaff:
		writeError(w, r, errValidation("role must be manager or staff"))
		return
	case p.Role == auth.RoleManager && in.Role != auth.RoleStaff:
		writeError(w, r, errForbidden)
		return
	}
	token, hash, err := auth.NewRefreshToken()
	if err != nil {
		writeError(w, r, err)
		return
	}
	var (
		inv            sqlc.Invitation
		tenant         sqlc.Tenant
		inviter        sqlc.User
		existingMember bool
	)
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		if u, err := q.GetUserByEmail(ctx, in.Email); err == nil {
			if _, err := q.GetMembership(ctx, sqlc.GetMembershipParams{TenantID: p.TenantID, UserID: u.ID}); err == nil {
				existingMember = true
				return nil
			} else if !db.IsNotFound(err) {
				return err
			}
		} else if !db.IsNotFound(err) {
			return err
		}
		scope, err := callerVenueScope(ctx, q, p)
		if err != nil {
			return err
		}
		venueIDs, err := cleanVenueIDs(ctx, q, p.TenantID, in.VenueIDs)
		if err != nil {
			return err
		}
		if scope != nil && len(venueIDs) == 0 {
			return &APIError{Status: http.StatusUnprocessableEntity, Code: "venue_ids_required", Message: "you can only invite people to your own venues; pick at least one"}
		}
		if tenant, err = q.GetTenant(ctx, p.TenantID); err != nil {
			return err
		}
		if inviter, err = q.GetUserByID(ctx, p.UserID); err != nil {
			return err
		}
		if err := q.RevokePendingInvitationsFor(ctx, sqlc.RevokePendingInvitationsForParams{TenantID: p.TenantID, Email: in.Email}); err != nil {
			return err
		}
		inv, err = q.CreateInvitation(ctx, sqlc.CreateInvitationParams{
			ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, Email: in.Email, Role: in.Role,
			TokenHash: hash, InvitedBy: &p.UserID, ExpiresAt: time.Now().Add(inviteTTL), VenueIds: venueIDs,
		})
		return err
	})
	if err == nil && existingMember {
		err = &APIError{Status: http.StatusConflict, Code: "already_member", Message: "this person is already a member"}
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	role := map[string]string{auth.RoleManager: "menadžer", auth.RoleStaff: "osoblje"}[in.Role]
	s.sendMail(r.Context(), mail.Message{
		To:      in.Email,
		Subject: fmt.Sprintf("Poziv u %s na Menuly", tenant.Name),
		Text: fmt.Sprintf("Zdravo,\n\n%s vas poziva da se pridružite timu %s na Menuly (uloga: %s).\n\nPrihvatite poziv: %s\n\nLink važi 7 dana.\n",
			inviter.Name, tenant.Name, role, s.link("/invite", token)),
	})
	writeJSON(w, http.StatusCreated, toInvitationDTO(inv))
}

// GET /v1/invitations (owner, manager): pending invitations.
func (s *Server) handleListInvitations(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	out := []invitationDTO{}
	err := s.tx(r, func(q *sqlc.Queries) error {
		list, err := q.ListPendingInvitations(r.Context(), p.TenantID)
		for _, i := range list {
			out = append(out, toInvitationDTO(i))
		}
		return err
	})
	writeResult(w, r, http.StatusOK, map[string]any{"items": out}, err)
}

// DELETE /v1/invitations/{invitationID} (owner, manager)
func (s *Server) handleRevokeInvitation(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "invitationID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		n, err := q.RevokeInvitation(r.Context(), sqlc.RevokeInvitationParams{TenantID: p.TenantID, ID: id})
		if err == nil && n == 0 {
			return errNotFound
		}
		return err
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}

func invitationStatus(i sqlc.GetInvitationByTokenHashRow) string {
	switch {
	case i.AcceptedAt != nil:
		return "accepted"
	case i.RevokedAt != nil:
		return "revoked"
	case !time.Now().Before(i.ExpiresAt), i.TenantStatus != "active":
		return "expired"
	}
	return "pending"
}

// GET /v1/public/invitations/{token}: what the invite page shows before the
// person signs up or logs in.
func (s *Server) handleGetPublicInvitation(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	var out struct {
		Email      string    `json:"email"`
		Role       string    `json:"role"`
		TenantName string    `json:"tenant_name"`
		ExpiresAt  time.Time `json:"expires_at"`
		Status     string    `json:"status"`
		HasAccount bool      `json:"has_account"`
	}
	err := s.db.InviteTx(r.Context(), auth.HashRefreshToken(token), uuid.Nil, func(_ pgx.Tx, q *sqlc.Queries) error {
		inv, err := q.GetInvitationByTokenHash(r.Context(), auth.HashRefreshToken(token))
		if err != nil {
			return err
		}
		out.Email, out.Role, out.TenantName, out.ExpiresAt, out.Status = inv.Email, inv.Role, inv.TenantName, inv.ExpiresAt, invitationStatus(inv)
		_, err = q.GetUserByEmail(r.Context(), inv.Email)
		out.HasAccount = err == nil
		if db.IsNotFound(err) {
			err = nil
		}
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// POST /v1/auth/accept-invite {"token", "name"?, "password"?}
//
// Without an account, name and password create one. With an account, the
// person must be logged in as the invited email (Authorization header).
// Returns tokens for the inviting tenant.
func (s *Server) handleAcceptInvitation(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token    string `json:"token"`
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	var caller *Principal
	if raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok && raw != "" {
		claims, err := s.issuer.ParseAccess(raw)
		if err != nil {
			writeError(w, r, errUnauthorized)
			return
		}
		uid, _ := claims.UserID()
		caller = &Principal{UserID: uid}
	}
	in.Name = trim(in.Name)
	hash := auth.HashRefreshToken(trim(in.Token))
	var callerID uuid.UUID
	if caller != nil {
		callerID = caller.UserID
	}
	var out struct {
		tokenPair
		User userDTO `json:"user"`
	}
	err := s.db.InviteTx(r.Context(), hash, callerID, func(tx pgx.Tx, q *sqlc.Queries) error {
		ctx := r.Context()
		inv, err := q.GetInvitationByTokenHash(ctx, hash)
		if db.IsNotFound(err) || (err == nil && invitationStatus(inv) != "pending") {
			return errInvalidToken
		} else if err != nil {
			return err
		}
		var user sqlc.User
		if caller != nil {
			if user, err = q.GetUserByID(ctx, caller.UserID); err != nil {
				return errUnauthorized
			}
			if !strings.EqualFold(user.Email, inv.Email) {
				return &APIError{Status: http.StatusForbidden, Code: "invite_email_mismatch", Message: "this invitation is for " + inv.Email}
			}
		} else {
			if _, err := q.GetUserByEmail(ctx, inv.Email); err == nil {
				return &APIError{Status: http.StatusConflict, Code: "login_required", Message: "an account with this email exists; log in to accept"}
			} else if !db.IsNotFound(err) {
				return err
			}
			switch {
			case in.Name == "":
				return errValidation("name is required")
			case len(in.Password) < minPasswordLen:
				return errValidation("password must be at least 8 characters")
			}
			pw, err := auth.HashPassword(in.Password)
			if err != nil {
				return err
			}
			if user, err = q.CreateUser(ctx, sqlc.CreateUserParams{
				ID: uuid.Must(uuid.NewV7()), Email: inv.Email, PasswordHash: pw, Name: in.Name, Locale: "sr-Latn",
			}); err != nil {
				return err
			}
		}
		if err := db.SetTenant(ctx, tx, inv.TenantID); err != nil {
			return err
		}
		if _, err := q.CreateMembership(ctx, sqlc.CreateMembershipParams{TenantID: inv.TenantID, UserID: user.ID, Role: inv.Role, VenueIds: inv.VenueIds}); err != nil {
			if db.IsUniqueViolation(err, "") {
				return &APIError{Status: http.StatusConflict, Code: "already_member", Message: "you are already a member"}
			}
			return err
		}
		if err := q.AcceptInvitation(ctx, sqlc.AcceptInvitationParams{TenantID: inv.TenantID, ID: inv.ID}); err != nil {
			return err
		}
		out.User = toUserDTO(user)
		out.tokenPair, err = s.issueTokens(r, q, user.ID, inv.TenantID, inv.Role)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// Password reset -----------------------------------------------------------------

// POST /v1/auth/forgot-password {"email"}: always 204, so the answer does not
// reveal whether an account exists. At most 3 links per hour per account.
func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	token, hash, err := auth.NewRefreshToken()
	if err != nil {
		writeError(w, r, err)
		return
	}
	var user sqlc.User
	send := false
	err = s.db.Tx(r.Context(), db.Scope{}, func(q *sqlc.Queries) error {
		var err error
		user, err = q.GetUserByEmail(r.Context(), trim(in.Email))
		if db.IsNotFound(err) {
			return nil
		} else if err != nil {
			return err
		}
		n, err := q.CountRecentPasswordResets(r.Context(), user.ID)
		if err != nil || n >= 3 {
			return err
		}
		send = true
		return q.CreatePasswordReset(r.Context(), sqlc.CreatePasswordResetParams{
			ID: uuid.Must(uuid.NewV7()), UserID: user.ID, TokenHash: hash, ExpiresAt: time.Now().Add(resetTTL),
		})
	})
	if err != nil {
		writeError(w, r, err)
		return
	}
	if send {
		s.sendMail(r.Context(), mail.Message{
			To:      user.Email,
			Subject: "Nova lozinka za Menuly",
			Text: fmt.Sprintf("Zdravo %s,\n\nza novu lozinku otvorite: %s\n\nLink važi 1 sat. Ako niste tražili novu lozinku, zanemarite ovu poruku.\n",
				user.Name, s.link("/reset-password", token)),
		})
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /v1/auth/reset-password {"token", "password"}: sets the password and
// signs the account out everywhere.
func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if len(in.Password) < minPasswordLen {
		writeError(w, r, errValidation("password must be at least 8 characters"))
		return
	}
	pw, err := auth.HashPassword(in.Password)
	if err != nil {
		writeError(w, r, err)
		return
	}
	err = s.db.Tx(r.Context(), db.Scope{}, func(q *sqlc.Queries) error {
		ctx := r.Context()
		pr, err := q.GetPasswordResetForUpdate(ctx, auth.HashRefreshToken(trim(in.Token)))
		if db.IsNotFound(err) || (err == nil && (pr.UsedAt != nil || !time.Now().Before(pr.ExpiresAt))) {
			return errInvalidToken
		} else if err != nil {
			return err
		}
		if err := q.SetUserPassword(ctx, sqlc.SetUserPasswordParams{ID: pr.UserID, PasswordHash: pw}); err != nil {
			return err
		}
		if err := q.UsePasswordReset(ctx, pr.UserID); err != nil {
			return err
		}
		return q.RevokeAllUserRefreshTokens(ctx, pr.UserID)
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}
