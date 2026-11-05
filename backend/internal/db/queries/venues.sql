-- Tenant filtering is explicit in every query AND enforced by RLS.

-- name: CreateVenue :one
INSERT INTO venues (id, tenant_id, name, slug, address, phone, currency, timezone, opening_hours)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: ListVenues :many
SELECT * FROM venues WHERE tenant_id = $1 ORDER BY created_at, id;

-- name: GetVenue :one
SELECT * FROM venues WHERE tenant_id = $1 AND id = $2;

-- name: UpdateVenue :one
UPDATE venues SET
    name          = COALESCE(sqlc.narg('name'), name),
    slug          = COALESCE(sqlc.narg('slug'), slug),
    address       = COALESCE(sqlc.narg('address'), address),
    phone         = COALESCE(sqlc.narg('phone'), phone),
    currency      = COALESCE(sqlc.narg('currency'), currency),
    timezone      = COALESCE(sqlc.narg('timezone'), timezone),
    opening_hours = COALESCE(sqlc.narg('opening_hours'), opening_hours)
WHERE tenant_id = sqlc.arg('tenant_id') AND id = sqlc.arg('id')
RETURNING *;

-- name: DeleteVenue :execrows
DELETE FROM venues WHERE tenant_id = $1 AND id = $2;
