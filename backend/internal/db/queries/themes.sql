-- name: GetMenuTheme :one
SELECT * FROM menu_themes WHERE tenant_id = $1 AND menu_id = $2;

-- name: UpsertMenuTheme :one
INSERT INTO menu_themes (
    menu_id, tenant_id, template, accent, font, color_mode,
    show_images, show_descriptions, show_pattern, logo_url, cover_url, pattern, show_illustrations
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
ON CONFLICT (menu_id) DO UPDATE SET
    template = EXCLUDED.template,
    accent = EXCLUDED.accent,
    font = EXCLUDED.font,
    color_mode = EXCLUDED.color_mode,
    show_images = EXCLUDED.show_images,
    show_descriptions = EXCLUDED.show_descriptions,
    show_pattern = EXCLUDED.show_pattern,
    logo_url = EXCLUDED.logo_url,
    cover_url = EXCLUDED.cover_url,
    pattern = EXCLUDED.pattern,
    show_illustrations = EXCLUDED.show_illustrations
WHERE menu_themes.tenant_id = EXCLUDED.tenant_id
RETURNING *;
