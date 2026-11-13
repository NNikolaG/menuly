-- name: GetPublicTenantBySlug :one
-- Visible only through the public_lookup policy (app.public_tenant_slug).
SELECT id, name, slug FROM tenants WHERE slug = $1 AND status = 'active';

-- name: GetVenueBySlug :one
SELECT * FROM venues WHERE tenant_id = $1 AND slug = $2;

-- name: ListPublicVenues :many
-- Venues guests can open: the ones whose active menu is published.
SELECT v.name, v.slug, v.venue_type, v.address, v.city,
       m.languages, GREATEST(v.updated_at, m.updated_at)::timestamptz AS updated_at
FROM venues v
JOIN menus m ON m.id = v.active_menu_id AND m.status = 'published'
WHERE v.tenant_id = $1
ORDER BY v.name, v.slug;
