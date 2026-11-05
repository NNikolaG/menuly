-- name: CreateTenant :one
INSERT INTO tenants (id, name) VALUES ($1, $2)
RETURNING *;

-- name: GetTenant :one
SELECT * FROM tenants WHERE id = $1;

-- name: CreateUser :one
INSERT INTO users (id, email, password_hash, name, locale)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: CreateMembership :one
INSERT INTO memberships (tenant_id, user_id, role)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetMembership :one
SELECT * FROM memberships WHERE tenant_id = $1 AND user_id = $2;

-- name: ListUserMemberships :many
-- Relies on the memberships/tenants RLS policies that expose rows of the
-- current user (app.user_id) across tenants.
SELECT m.tenant_id, m.role, t.name AS tenant_name, t.status AS tenant_status
FROM memberships m
JOIN tenants t ON t.id = m.tenant_id
WHERE m.user_id = $1
ORDER BY m.created_at, m.tenant_id;

-- name: CreateRefreshToken :exec
INSERT INTO refresh_tokens (id, user_id, tenant_id, token_hash, expires_at)
VALUES ($1, $2, $3, $4, $5);

-- name: GetRefreshTokenForUpdate :one
SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE;

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL;

-- name: RevokeAllUserRefreshTokens :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL;
