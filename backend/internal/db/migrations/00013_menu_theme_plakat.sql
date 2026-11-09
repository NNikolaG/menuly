-- +goose Up

-- "plakat": poster template (black capsule category heads, one accent dot).
-- pattern: which generated art fills the header band when show_pattern is on.
ALTER TABLE menu_themes DROP CONSTRAINT menu_themes_template_check;
ALTER TABLE menu_themes ADD CONSTRAINT menu_themes_template_check
    CHECK (template IN ('racun', 'galerija', 'tabla', 'etiketa', 'plakat'));
ALTER TABLE menu_themes ADD COLUMN pattern text NOT NULL DEFAULT 'bauhaus'
    CHECK (pattern IN ('bauhaus', 'trake'));

-- +goose Down
ALTER TABLE menu_themes DROP COLUMN pattern;
UPDATE menu_themes SET template = 'racun' WHERE template = 'plakat';
ALTER TABLE menu_themes DROP CONSTRAINT menu_themes_template_check;
ALTER TABLE menu_themes ADD CONSTRAINT menu_themes_template_check
    CHECK (template IN ('racun', 'galerija', 'tabla', 'etiketa'));
