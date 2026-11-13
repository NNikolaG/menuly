-- Tenant filtering is explicit in every query AND enforced by RLS.

-- name: CreateVenue :one
INSERT INTO venues (id, tenant_id, name, slug, address, phone, currency, timezone, opening_hours,
                    wifi_available, wifi_ssid, wifi_password, wifi_access,
                    venue_type, city, postal_code, country, latitude, longitude, cuisine, description)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21)
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
    opening_hours = COALESCE(sqlc.narg('opening_hours'), opening_hours),
    wifi_available = COALESCE(sqlc.narg('wifi_available'), wifi_available),
    wifi_ssid     = COALESCE(sqlc.narg('wifi_ssid'), wifi_ssid),
    wifi_password = COALESCE(sqlc.narg('wifi_password'), wifi_password),
    wifi_access   = COALESCE(sqlc.narg('wifi_access'), wifi_access),
    venue_type    = COALESCE(sqlc.narg('venue_type'), venue_type),
    city          = COALESCE(sqlc.narg('city'), city),
    postal_code   = COALESCE(sqlc.narg('postal_code'), postal_code),
    country       = COALESCE(sqlc.narg('country'), country),
    -- Coordinates can be cleared, so they are written (even as NULL) whenever set_location is true.
    latitude      = CASE WHEN sqlc.arg('set_location')::boolean THEN sqlc.narg('latitude') ELSE latitude END,
    longitude     = CASE WHEN sqlc.arg('set_location')::boolean THEN sqlc.narg('longitude') ELSE longitude END,
    cuisine       = COALESCE(sqlc.narg('cuisine')::text[], cuisine),
    description   = COALESCE(sqlc.narg('description'), description)
WHERE tenant_id = sqlc.arg('tenant_id') AND id = sqlc.arg('id')
RETURNING *;

-- name: DeleteVenue :execrows
DELETE FROM venues WHERE tenant_id = $1 AND id = $2;
