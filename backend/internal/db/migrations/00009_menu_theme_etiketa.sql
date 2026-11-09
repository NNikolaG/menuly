-- +goose Up

-- "etiketa": spec-label template (item code, color stripe per category, combo tickets).
ALTER TABLE menu_themes DROP CONSTRAINT menu_themes_template_check;
ALTER TABLE menu_themes ADD CONSTRAINT menu_themes_template_check
    CHECK (template IN ('racun', 'galerija', 'tabla', 'etiketa'));

-- +goose Down
UPDATE menu_themes SET template = 'racun' WHERE template = 'etiketa';
ALTER TABLE menu_themes DROP CONSTRAINT menu_themes_template_check;
ALTER TABLE menu_themes ADD CONSTRAINT menu_themes_template_check
    CHECK (template IN ('racun', 'galerija', 'tabla'));
