-- name: GetPublicTenantBySlug :one
-- Visible only through the public_lookup policy (app.public_tenant_slug).
SELECT id, name, slug FROM tenants WHERE slug = $1 AND status = 'active';

-- name: GetVenueBySlug :one
SELECT * FROM venues WHERE tenant_id = $1 AND slug = $2;
