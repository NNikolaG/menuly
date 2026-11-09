-- +goose Up

-- Guest-facing venue info: Wi-Fi next to the existing opening_hours.
-- wifi_access says how guests get the password: 'menu' shows it on the
-- public menu, 'staff' shows only the network name and asks guests to ask.
ALTER TABLE venues
    ADD COLUMN wifi_available boolean NOT NULL DEFAULT false,
    ADD COLUMN wifi_ssid      text    NOT NULL DEFAULT '',
    ADD COLUMN wifi_password  text    NOT NULL DEFAULT '',
    ADD COLUMN wifi_access    text    NOT NULL DEFAULT 'staff'
        CHECK (wifi_access IN ('menu', 'staff'));

-- +goose Down
ALTER TABLE venues
    DROP COLUMN wifi_access,
    DROP COLUMN wifi_password,
    DROP COLUMN wifi_ssid,
    DROP COLUMN wifi_available;
