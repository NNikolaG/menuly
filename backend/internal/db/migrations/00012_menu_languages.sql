-- +goose Up

-- Languages a menu offers besides Serbian, which is the base language and
-- always present (its text lives in the base columns). Each entry is
-- {"code": "en", "name": "English"}; translations jsonb is keyed by code.
ALTER TABLE menus ADD COLUMN languages jsonb NOT NULL DEFAULT '[]'
    CHECK (jsonb_typeof(languages) = 'array');

-- Menus that already carry English text keep offering it.
UPDATE menus m SET languages = '[{"code": "en", "name": "English"}]'
WHERE EXISTS (SELECT 1 FROM categories c WHERE c.menu_id = m.id AND c.translations ? 'en')
   OR EXISTS (SELECT 1 FROM menu_items i JOIN categories c ON c.id = i.category_id
              WHERE c.menu_id = m.id AND i.translations ? 'en')
   OR EXISTS (SELECT 1 FROM promotions p WHERE p.venue_id = m.venue_id AND p.translations ? 'en');

-- +goose Down
ALTER TABLE menus DROP COLUMN languages;
