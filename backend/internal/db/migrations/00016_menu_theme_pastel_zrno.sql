-- +goose Up

-- "pastel": airy cream template with crayon grain; "zrno": stippled grain waves under a white
-- header card; "leptiri": butterflies flying across a pastel sky.
ALTER TABLE menu_themes DROP CONSTRAINT menu_themes_template_check;
ALTER TABLE menu_themes ADD CONSTRAINT menu_themes_template_check
    CHECK (template IN ('racun', 'galerija', 'tabla', 'etiketa', 'plakat', 'pastel'));
ALTER TABLE menu_themes DROP CONSTRAINT menu_themes_pattern_check;
ALTER TABLE menu_themes ADD CONSTRAINT menu_themes_pattern_check
    CHECK (pattern IN ('bauhaus', 'trake', 'mozaik', 'zrno', 'leptiri'));

-- +goose Down
UPDATE menu_themes SET template = 'racun' WHERE template = 'pastel';
UPDATE menu_themes SET pattern = 'bauhaus' WHERE pattern IN ('zrno', 'leptiri');
ALTER TABLE menu_themes DROP CONSTRAINT menu_themes_template_check;
ALTER TABLE menu_themes ADD CONSTRAINT menu_themes_template_check
    CHECK (template IN ('racun', 'galerija', 'tabla', 'etiketa', 'plakat'));
ALTER TABLE menu_themes DROP CONSTRAINT menu_themes_pattern_check;
ALTER TABLE menu_themes ADD CONSTRAINT menu_themes_pattern_check
    CHECK (pattern IN ('bauhaus', 'trake', 'mozaik'));
