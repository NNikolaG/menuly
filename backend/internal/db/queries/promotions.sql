-- name: CreatePromotion :one
INSERT INTO promotions (id, tenant_id, venue_id, name, description, translations, image_url, price_minor,
                        starts_at, ends_at, is_active, is_featured, position)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        (SELECT COALESCE(max(position) + 1, 0) FROM promotions p WHERE p.tenant_id = $2 AND p.venue_id = $3))
RETURNING *;

-- name: GetPromotion :one
SELECT * FROM promotions WHERE tenant_id = $1 AND id = $2;

-- name: GetPromotionForUpdate :one
SELECT * FROM promotions WHERE tenant_id = $1 AND id = $2 FOR UPDATE;

-- name: ListVenuePromotions :many
SELECT * FROM promotions WHERE tenant_id = $1 AND venue_id = $2 ORDER BY position, id;

-- name: UpdatePromotion :one
UPDATE promotions SET
    name         = COALESCE(sqlc.narg('name'), name),
    description  = COALESCE(sqlc.narg('description'), description),
    translations = COALESCE(sqlc.narg('translations'), translations),
    image_url    = COALESCE(sqlc.narg('image_url'), image_url),
    price_minor  = COALESCE(sqlc.narg('price_minor'), price_minor),
    starts_at    = CASE WHEN sqlc.arg('set_starts_at')::bool THEN sqlc.narg('starts_at') ELSE starts_at END,
    ends_at      = CASE WHEN sqlc.arg('set_ends_at')::bool THEN sqlc.narg('ends_at') ELSE ends_at END,
    is_active    = COALESCE(sqlc.narg('is_active'), is_active),
    is_featured  = COALESCE(sqlc.narg('is_featured'), is_featured)
WHERE tenant_id = sqlc.arg('tenant_id') AND id = sqlc.arg('id')
RETURNING *;

-- name: DeletePromotion :execrows
DELETE FROM promotions WHERE tenant_id = $1 AND id = $2;

-- name: CountVenuePromotions :one
SELECT count(*) FROM promotions WHERE tenant_id = $1 AND venue_id = $2;

-- name: ReorderPromotions :execrows
UPDATE promotions p SET position = o.ord - 1
FROM unnest(sqlc.arg('ids')::uuid[]) WITH ORDINALITY AS o(id, ord)
WHERE p.id = o.id AND p.tenant_id = sqlc.arg('tenant_id') AND p.venue_id = sqlc.arg('venue_id');

-- name: DeletePromotionSlots :exec
DELETE FROM promotion_slots WHERE tenant_id = $1 AND promotion_id = $2;

-- name: CreatePromotionSlot :one
INSERT INTO promotion_slots (id, tenant_id, promotion_id, label, translations, quantity, position)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: CreatePromotionSlotOption :exec
INSERT INTO promotion_slot_options (id, tenant_id, slot_id, item_id, variant_id, position)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: ListVenuePromotionSlots :many
SELECT s.* FROM promotion_slots s JOIN promotions p ON p.id = s.promotion_id
WHERE s.tenant_id = $1 AND p.venue_id = $2
ORDER BY s.promotion_id, s.position, s.id;

-- name: ListVenuePromotionOptions :many
-- Options with what the menu says about them now. price_minor is the pinned
-- variant's price, or the item's cheapest variant.
SELECT o.id, o.slot_id, o.item_id, o.variant_id, o.position,
       i.name AS item_name, i.translations AS item_translations,
       i.is_available, i.is_visible, c.is_visible AS category_visible, c.menu_id,
       v.label AS variant_label, v.translations AS variant_translations,
       COALESCE(v.price_minor, (SELECT min(x.price_minor) FROM item_variants x WHERE x.item_id = i.id), 0)::bigint AS price_minor
FROM promotion_slot_options o
JOIN promotion_slots s ON s.id = o.slot_id
JOIN promotions p ON p.id = s.promotion_id
JOIN menu_items i ON i.id = o.item_id
JOIN categories c ON c.id = i.category_id
LEFT JOIN item_variants v ON v.id = o.variant_id
WHERE o.tenant_id = $1 AND p.venue_id = $2
ORDER BY o.slot_id, o.position, o.id;

-- name: GetItemVenueID :one
SELECT m.venue_id FROM menu_items i
JOIN categories c ON c.id = i.category_id
JOIN menus m ON m.id = c.menu_id
WHERE i.tenant_id = $1 AND i.id = $2;
