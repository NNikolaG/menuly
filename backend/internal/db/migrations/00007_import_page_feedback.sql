-- +goose Up
-- Stable reason for a failed page, so the app can show its own text and
-- suggest retaking the photo.
ALTER TABLE import_pages ADD COLUMN error_code text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE import_pages DROP COLUMN IF EXISTS error_code;
