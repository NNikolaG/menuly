-- +goose Up

-- "mozaik": animated glyph-tile mosaic in the header band; featured combos become a dark mosaic card.
ALTER TABLE menu_themes DROP CONSTRAINT menu_themes_pattern_check;
ALTER TABLE menu_themes ADD CONSTRAINT menu_themes_pattern_check
    CHECK (pattern IN ('bauhaus', 'trake', 'mozaik'));

-- +goose Down
UPDATE menu_themes SET pattern = 'bauhaus' WHERE pattern = 'mozaik';
ALTER TABLE menu_themes DROP CONSTRAINT menu_themes_pattern_check;
ALTER TABLE menu_themes ADD CONSTRAINT menu_themes_pattern_check
    CHECK (pattern IN ('bauhaus', 'trake'));
