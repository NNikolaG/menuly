-- Media -------------------------------------------------------------------------

-- name: CreateImageFile :one
INSERT INTO media_files (id, tenant_id, storage_key, mime, size_bytes, filename, created_by, purpose)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- Views -------------------------------------------------------------------------

-- name: CountMenuView :exec
INSERT INTO menu_view_daily (tenant_id, venue_id, day, views)
VALUES ($1, $2, $3, 1)
ON CONFLICT (venue_id, day) DO UPDATE SET views = menu_view_daily.views + 1;

-- name: ListVenueViews :many
SELECT day, views FROM menu_view_daily
WHERE tenant_id = $1 AND venue_id = $2 AND day >= sqlc.arg('since')::date
ORDER BY day;

-- Invitations -------------------------------------------------------------------

-- name: CreateInvitation :one
INSERT INTO invitations (id, tenant_id, email, role, token_hash, invited_by, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListPendingInvitations :many
SELECT * FROM invitations
WHERE tenant_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
ORDER BY created_at DESC;

-- name: RevokeInvitation :execrows
UPDATE invitations SET revoked_at = now()
WHERE tenant_id = $1 AND id = $2 AND accepted_at IS NULL AND revoked_at IS NULL;

-- name: RevokePendingInvitationsFor :exec
UPDATE invitations SET revoked_at = now()
WHERE tenant_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL;

-- name: GetInvitationByTokenHash :one
-- Runs under the invite_lookup policy (app.invite_token_hash).
SELECT i.*, t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status
FROM invitations i JOIN tenants t ON t.id = i.tenant_id
WHERE i.token_hash = $1;

-- name: AcceptInvitation :exec
UPDATE invitations SET accepted_at = now() WHERE tenant_id = $1 AND id = $2;

-- name: ListTenantMembers :many
SELECT m.user_id, m.role, m.created_at, u.name, u.email
FROM memberships m JOIN users u ON u.id = m.user_id
WHERE m.tenant_id = $1
ORDER BY m.created_at, m.user_id;

-- name: UpdateMembershipRole :execrows
UPDATE memberships SET role = $3 WHERE tenant_id = $1 AND user_id = $2 AND role <> 'owner';

-- name: DeleteMembership :execrows
DELETE FROM memberships WHERE tenant_id = $1 AND user_id = $2 AND role <> 'owner';

-- name: RevokeUserTenantRefreshTokens :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL;

-- Password reset ----------------------------------------------------------------

-- name: CreatePasswordReset :exec
INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4);

-- name: GetPasswordResetForUpdate :one
SELECT * FROM password_resets WHERE token_hash = $1 FOR UPDATE;

-- name: UsePasswordReset :exec
UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL;

-- name: CountRecentPasswordResets :one
SELECT count(*) FROM password_resets WHERE user_id = $1 AND created_at > now() - interval '1 hour';

-- name: SetUserPassword :exec
UPDATE users SET password_hash = $2 WHERE id = $1;

-- Platform admin ----------------------------------------------------------------
-- These run with app.platform_admin = 'on' (see db.AdminTx).

-- name: AdminListTenants :many
SELECT t.id, t.name, t.slug, t.status, t.plan, t.created_at,
       (SELECT count(*) FROM venues v WHERE v.tenant_id = t.id) AS venues,
       (SELECT count(*) FROM memberships m WHERE m.tenant_id = t.id) AS members,
       (SELECT count(*) FROM import_jobs j WHERE j.tenant_id = t.id) AS imports,
       (SELECT COALESCE(sum(p.cost_micros), 0) FROM import_pages p WHERE p.tenant_id = t.id)::bigint AS ocr_cost_micros,
       (SELECT COALESCE(sum(d.views), 0) FROM menu_view_daily d WHERE d.tenant_id = t.id AND d.day >= current_date - 29)::bigint AS views_30d
FROM tenants t
WHERE sqlc.arg('q')::text = '' OR t.name ILIKE '%' || sqlc.arg('q')::text || '%' OR t.slug::text ILIKE '%' || sqlc.arg('q')::text || '%'
ORDER BY t.created_at DESC
LIMIT 200;

-- name: AdminGetTenant :one
SELECT * FROM tenants WHERE id = $1;

-- name: AdminSetTenantStatus :one
UPDATE tenants SET status = $2 WHERE id = $1 RETURNING *;

-- name: AdminListTenantVenues :many
SELECT v.id, v.name, v.slug, v.ocr_import_limit, v.created_at,
       (SELECT count(*) FROM import_jobs j WHERE j.venue_id = v.id AND j.status <> 'failed') AS imports_used
FROM venues v WHERE v.tenant_id = $1 ORDER BY v.created_at;

-- name: AdminListTenantOwners :many
SELECT u.id, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id
WHERE m.tenant_id = $1 AND m.role = 'owner';

-- name: AdminSetVenueImportLimit :one
UPDATE venues SET ocr_import_limit = $2 WHERE id = $1 RETURNING *;

-- name: AdminOCRUsage :many
SELECT p.tenant_id, t.name AS tenant_name, p.model,
       count(*) AS pages, sum(p.input_tokens)::bigint AS input_tokens, sum(p.output_tokens)::bigint AS output_tokens,
       sum(p.cost_micros)::bigint AS cost_micros
FROM import_pages p JOIN tenants t ON t.id = p.tenant_id
WHERE p.created_at >= sqlc.arg('since')::timestamptz AND p.model <> ''
GROUP BY p.tenant_id, t.name, p.model
ORDER BY cost_micros DESC;
