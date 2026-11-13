-- +goose Up

-- What search engines and AI agents need to place a venue: its kind, a
-- structured address, coordinates, cuisine and a short description.
-- `address` stays the street line; city, postal code and country are new.
-- venue_type 'other' is the neutral default (schema.org FoodEstablishment).
ALTER TABLE venues
    ADD COLUMN venue_type  text NOT NULL DEFAULT 'other'
        CHECK (venue_type IN ('restaurant', 'cafe', 'bar', 'fast_food', 'bakery', 'pastry_shop', 'other')),
    ADD COLUMN city        text NOT NULL DEFAULT '',
    ADD COLUMN postal_code text NOT NULL DEFAULT '',
    ADD COLUMN country     text NOT NULL DEFAULT 'RS' CHECK (country ~ '^[A-Z]{2}$'),
    ADD COLUMN latitude    double precision CHECK (latitude BETWEEN -90 AND 90),
    ADD COLUMN longitude   double precision CHECK (longitude BETWEEN -180 AND 180),
    ADD COLUMN cuisine     text[] NOT NULL DEFAULT '{}',
    ADD COLUMN description text NOT NULL DEFAULT '',
    ADD CONSTRAINT venues_location_pair CHECK ((latitude IS NULL) = (longitude IS NULL));

-- +goose Down
ALTER TABLE venues
    DROP CONSTRAINT venues_location_pair,
    DROP COLUMN description,
    DROP COLUMN cuisine,
    DROP COLUMN longitude,
    DROP COLUMN latitude,
    DROP COLUMN country,
    DROP COLUMN postal_code,
    DROP COLUMN city,
    DROP COLUMN venue_type;
