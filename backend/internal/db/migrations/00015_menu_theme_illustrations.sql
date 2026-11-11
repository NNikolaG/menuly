-- +goose Up

-- Geometric category illustrations (cup, cone, glass, plate...) picked on the web from the
-- category name. Off by default so existing menus keep their look.
ALTER TABLE menu_themes ADD COLUMN show_illustrations boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE menu_themes DROP COLUMN show_illustrations;
