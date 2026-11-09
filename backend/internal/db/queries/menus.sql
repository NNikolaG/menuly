-- Tenant filtering is explicit in every query AND enforced by RLS.

-- Menus ------------------------------------------------------------------------

-- name: CreateMenu :one
INSERT INTO menus (id, tenant_id, venue_id, name) VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListVenueMenus :many
SELECT * FROM menus WHERE tenant_id = $1 AND venue_id = $2 ORDER BY created_at, id;

-- name: GetMenu :one
SELECT * FROM menus WHERE tenant_id = $1 AND id = $2;

-- name: UpdateMenu :one
UPDATE menus SET
    name      = COALESCE(sqlc.narg('name'), name),
    languages = COALESCE(sqlc.narg('languages'), languages)
WHERE tenant_id = sqlc.arg('tenant_id') AND id = sqlc.arg('id')
RETURNING *;

-- name: DeleteMenu :execrows
DELETE FROM menus WHERE tenant_id = $1 AND id = $2;

-- name: UnpublishVenueMenus :exec
UPDATE menus SET status = 'draft', published_at = NULL
WHERE tenant_id = $1 AND venue_id = $2 AND status = 'published';

-- name: PublishMenu :one
UPDATE menus SET status = 'published', published_at = now()
WHERE tenant_id = $1 AND id = $2
RETURNING *;

-- name: UnpublishMenu :one
UPDATE menus SET status = 'draft', published_at = NULL
WHERE tenant_id = $1 AND id = $2
RETURNING *;

-- name: SetVenueActiveMenu :exec
UPDATE venues SET active_menu_id = sqlc.narg('menu_id')
WHERE tenant_id = sqlc.arg('tenant_id') AND id = sqlc.arg('venue_id');

-- Categories ---------------------------------------------------------------------

-- name: CreateCategory :one
INSERT INTO categories (id, tenant_id, menu_id, name, description, translations, is_visible, position)
VALUES ($1, $2, $3, $4, $5, $6, $7,
        (SELECT COALESCE(max(position) + 1, 0) FROM categories c WHERE c.tenant_id = $2 AND c.menu_id = $3))
RETURNING *;

-- name: GetCategory :one
SELECT * FROM categories WHERE tenant_id = $1 AND id = $2;

-- name: ListMenuCategories :many
SELECT * FROM categories WHERE tenant_id = $1 AND menu_id = $2 ORDER BY position, id;

-- name: UpdateCategory :one
UPDATE categories SET
    name         = COALESCE(sqlc.narg('name'), name),
    description  = COALESCE(sqlc.narg('description'), description),
    translations = COALESCE(sqlc.narg('translations'), translations),
    is_visible   = COALESCE(sqlc.narg('is_visible'), is_visible)
WHERE tenant_id = sqlc.arg('tenant_id') AND id = sqlc.arg('id')
RETURNING *;

-- name: DeleteCategory :execrows
DELETE FROM categories WHERE tenant_id = $1 AND id = $2;

-- name: ReorderCategories :execrows
UPDATE categories c SET position = o.ord - 1
FROM unnest(sqlc.arg('ids')::uuid[]) WITH ORDINALITY AS o(id, ord)
WHERE c.id = o.id AND c.tenant_id = sqlc.arg('tenant_id') AND c.menu_id = sqlc.arg('menu_id');

-- name: CountMenuCategories :one
SELECT count(*) FROM categories WHERE tenant_id = $1 AND menu_id = $2;

-- Items --------------------------------------------------------------------------

-- name: CreateItem :one
INSERT INTO menu_items (id, tenant_id, category_id, name, description, translations, image_url,
                        tags, allergens, is_available, is_visible, position)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        (SELECT COALESCE(max(position) + 1, 0) FROM menu_items i WHERE i.tenant_id = $2 AND i.category_id = $3))
RETURNING *;

-- name: GetItem :one
SELECT * FROM menu_items WHERE tenant_id = $1 AND id = $2;

-- name: GetItemMenuID :one
SELECT c.menu_id FROM menu_items i JOIN categories c ON c.id = i.category_id
WHERE i.tenant_id = $1 AND i.id = $2;

-- name: ListMenuItems :many
SELECT i.* FROM menu_items i
JOIN categories c ON c.id = i.category_id
WHERE i.tenant_id = $1 AND c.menu_id = $2
ORDER BY i.category_id, i.position, i.id;

-- name: UpdateItem :one
UPDATE menu_items SET
    category_id  = COALESCE(sqlc.narg('category_id'), category_id),
    name         = COALESCE(sqlc.narg('name'), name),
    description  = COALESCE(sqlc.narg('description'), description),
    translations = COALESCE(sqlc.narg('translations'), translations),
    image_url    = COALESCE(sqlc.narg('image_url'), image_url),
    tags         = COALESCE(sqlc.narg('tags'), tags),
    allergens    = COALESCE(sqlc.narg('allergens'), allergens),
    is_available = COALESCE(sqlc.narg('is_available'), is_available),
    is_visible   = COALESCE(sqlc.narg('is_visible'), is_visible),
    position     = COALESCE(sqlc.narg('position'), position)
WHERE tenant_id = sqlc.arg('tenant_id') AND id = sqlc.arg('id')
RETURNING *;

-- name: UpdateItemStatus :one
UPDATE menu_items SET
    is_available = COALESCE(sqlc.narg('is_available'), is_available),
    is_visible   = COALESCE(sqlc.narg('is_visible'), is_visible)
WHERE tenant_id = sqlc.arg('tenant_id') AND id = sqlc.arg('id')
RETURNING *;

-- name: NextItemPosition :one
SELECT COALESCE(max(position) + 1, 0)::int AS position FROM menu_items WHERE tenant_id = $1 AND category_id = $2;

-- name: DeleteItem :execrows
DELETE FROM menu_items WHERE tenant_id = $1 AND id = $2;

-- name: ReorderItems :execrows
UPDATE menu_items i SET position = o.ord - 1
FROM unnest(sqlc.arg('ids')::uuid[]) WITH ORDINALITY AS o(id, ord)
WHERE i.id = o.id AND i.tenant_id = sqlc.arg('tenant_id') AND i.category_id = sqlc.arg('category_id');

-- name: CountCategoryItems :one
SELECT count(*) FROM menu_items WHERE tenant_id = $1 AND category_id = $2;

-- Variants -----------------------------------------------------------------------

-- name: CreateVariant :one
INSERT INTO item_variants (id, tenant_id, item_id, label, translations, price_minor, position)
VALUES ($1, $2, $3, $4, $5, $6,
        (SELECT COALESCE(max(position) + 1, 0) FROM item_variants v WHERE v.tenant_id = $2 AND v.item_id = $3))
RETURNING *;

-- name: GetVariantForUpdate :one
SELECT * FROM item_variants WHERE tenant_id = $1 AND id = $2 FOR UPDATE;

-- name: ListItemVariants :many
SELECT * FROM item_variants WHERE tenant_id = $1 AND item_id = $2 ORDER BY position, id;

-- name: ListMenuVariants :many
SELECT v.* FROM item_variants v
JOIN menu_items i ON i.id = v.item_id
JOIN categories c ON c.id = i.category_id
WHERE v.tenant_id = $1 AND c.menu_id = $2
ORDER BY v.item_id, v.position, v.id;

-- name: UpdateVariant :one
UPDATE item_variants SET
    label        = COALESCE(sqlc.narg('label'), label),
    translations = COALESCE(sqlc.narg('translations'), translations),
    price_minor  = COALESCE(sqlc.narg('price_minor'), price_minor)
WHERE tenant_id = sqlc.arg('tenant_id') AND id = sqlc.arg('id')
RETURNING *;

-- name: DeleteVariant :execrows
DELETE FROM item_variants WHERE tenant_id = $1 AND id = $2;

-- name: CountItemVariants :one
SELECT count(*) FROM item_variants WHERE tenant_id = $1 AND item_id = $2;

-- Prices -------------------------------------------------------------------------

-- name: CreatePriceChange :exec
INSERT INTO price_changes (id, tenant_id, variant_id, old_price_minor, new_price_minor, changed_by)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: ListPriceChanges :many
SELECT * FROM price_changes WHERE tenant_id = $1 AND variant_id = $2
ORDER BY changed_at DESC, id DESC
LIMIT 100;

-- name: ListVariantsForAdjustment :many
-- Variants of a menu, optionally limited to one category, locked for update.
SELECT v.* FROM item_variants v
JOIN menu_items i ON i.id = v.item_id
JOIN categories c ON c.id = i.category_id
WHERE v.tenant_id = sqlc.arg('tenant_id') AND c.menu_id = sqlc.arg('menu_id')
  AND (sqlc.narg('category_id')::uuid IS NULL OR c.id = sqlc.narg('category_id'))
ORDER BY v.id
FOR UPDATE OF v;

-- name: SetVariantPrice :exec
UPDATE item_variants SET price_minor = $3 WHERE tenant_id = $1 AND id = $2;

-- name: GetVariant :one
SELECT * FROM item_variants WHERE tenant_id = $1 AND id = $2;
