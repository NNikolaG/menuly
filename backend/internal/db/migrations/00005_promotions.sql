-- +goose Up

-- Promotions of a venue. MVP has one type, "combo": a fixed price for a set
-- of slots, each slot either one fixed item or a choice between items.
CREATE TABLE promotions (
    id            uuid PRIMARY KEY,
    tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    venue_id      uuid NOT NULL,
    type          text NOT NULL DEFAULT 'combo' CHECK (type IN ('combo')),
    name          text NOT NULL,
    description   text NOT NULL DEFAULT '',
    translations  jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(translations) = 'object'),
    image_url     text NOT NULL DEFAULT '',
    price_minor   bigint NOT NULL CHECK (price_minor >= 0),
    -- Validity window; NULL means open-ended on that side.
    starts_at     timestamptz,
    ends_at       timestamptz,
    is_active     boolean NOT NULL DEFAULT true,
    is_featured   boolean NOT NULL DEFAULT false,
    position      integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT promotions_id_tenant_key UNIQUE (id, tenant_id),
    CONSTRAINT promotions_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
    FOREIGN KEY (venue_id, tenant_id) REFERENCES venues (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX promotions_venue_idx ON promotions (venue_id, position);
CREATE TRIGGER promotions_updated_at BEFORE UPDATE ON promotions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- "1x Burger" or "1 of: Coca-Cola, Fanta, Sprite".
CREATE TABLE promotion_slots (
    id            uuid PRIMARY KEY,
    tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    promotion_id  uuid NOT NULL,
    label         text NOT NULL DEFAULT '',
    translations  jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(translations) = 'object'),
    quantity      integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
    position      integer NOT NULL DEFAULT 0,
    CONSTRAINT promotion_slots_id_tenant_key UNIQUE (id, tenant_id),
    FOREIGN KEY (promotion_id, tenant_id) REFERENCES promotions (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX promotion_slots_promotion_idx ON promotion_slots (promotion_id, position);

-- One option = a fixed item; several = a choice. variant_id pins a size;
-- without it the item's cheapest variant counts.
CREATE TABLE promotion_slot_options (
    id          uuid PRIMARY KEY,
    tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    slot_id     uuid NOT NULL,
    item_id     uuid NOT NULL,
    variant_id  uuid,
    position    integer NOT NULL DEFAULT 0,
    FOREIGN KEY (slot_id, tenant_id) REFERENCES promotion_slots (id, tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id, tenant_id) REFERENCES menu_items (id, tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, tenant_id) REFERENCES item_variants (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX promotion_slot_options_slot_idx ON promotion_slot_options (slot_id, position);
CREATE INDEX promotion_slot_options_item_idx ON promotion_slot_options (item_id);

-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['promotions', 'promotion_slots', 'promotion_slot_options'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
    END LOOP;
END
$$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS promotion_slot_options;
DROP TABLE IF EXISTS promotion_slots;
DROP TABLE IF EXISTS promotions;
