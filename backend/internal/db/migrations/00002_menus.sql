-- +goose Up

-- Composite (id, tenant_id) keys let children reference parents of the SAME
-- tenant only. Foreign key checks bypass RLS, so this is what stops a row in
-- tenant A from pointing at a parent in tenant B.
ALTER TABLE venues ADD CONSTRAINT venues_id_tenant_key UNIQUE (id, tenant_id);

CREATE TABLE menus (
    id            uuid PRIMARY KEY,
    tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    venue_id      uuid NOT NULL,
    name          text NOT NULL,
    status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT menus_id_tenant_key UNIQUE (id, tenant_id),
    FOREIGN KEY (venue_id, tenant_id) REFERENCES venues (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX menus_venue_idx ON menus (venue_id);
-- MVP: a venue has at most one published menu.
CREATE UNIQUE INDEX menus_one_published_per_venue ON menus (venue_id) WHERE status = 'published';
CREATE TRIGGER menus_updated_at BEFORE UPDATE ON menus
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE venues ADD COLUMN active_menu_id uuid REFERENCES menus (id) ON DELETE SET NULL;

-- translations: {"en": {"name": "...", "description": "..."}}. Base columns
-- hold the Serbian text; the public menu falls back to them.
CREATE TABLE categories (
    id            uuid PRIMARY KEY,
    tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    menu_id       uuid NOT NULL,
    name          text NOT NULL,
    description   text NOT NULL DEFAULT '',
    translations  jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(translations) = 'object'),
    position      integer NOT NULL DEFAULT 0,
    is_visible    boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT categories_id_tenant_key UNIQUE (id, tenant_id),
    FOREIGN KEY (menu_id, tenant_id) REFERENCES menus (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX categories_menu_idx ON categories (menu_id, position);
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE menu_items (
    id            uuid PRIMARY KEY,
    tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    category_id   uuid NOT NULL,
    name          text NOT NULL,
    description   text NOT NULL DEFAULT '',
    translations  jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(translations) = 'object'),
    image_url     text NOT NULL DEFAULT '',
    tags          text[] NOT NULL DEFAULT '{}',
    allergens     text[] NOT NULL DEFAULT '{}',
    position      integer NOT NULL DEFAULT 0,
    is_available  boolean NOT NULL DEFAULT true,
    is_visible    boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT menu_items_id_tenant_key UNIQUE (id, tenant_id),
    FOREIGN KEY (category_id, tenant_id) REFERENCES categories (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX menu_items_category_idx ON menu_items (category_id, position);
CREATE TRIGGER menu_items_updated_at BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every item has at least one variant; an item without sizes has one variant
-- with an empty label. Prices are integers in the minor unit (para for RSD).
CREATE TABLE item_variants (
    id            uuid PRIMARY KEY,
    tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    item_id       uuid NOT NULL,
    label         text NOT NULL DEFAULT '',
    translations  jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(translations) = 'object'),
    price_minor   bigint NOT NULL CHECK (price_minor >= 0),
    position      integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT item_variants_id_tenant_key UNIQUE (id, tenant_id),
    FOREIGN KEY (item_id, tenant_id) REFERENCES menu_items (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX item_variants_item_idx ON item_variants (item_id, position);
CREATE TRIGGER item_variants_updated_at BEFORE UPDATE ON item_variants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE price_changes (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    variant_id       uuid NOT NULL,
    old_price_minor  bigint NOT NULL,
    new_price_minor  bigint NOT NULL,
    changed_by       uuid REFERENCES users (id) ON DELETE SET NULL,
    changed_at       timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (variant_id, tenant_id) REFERENCES item_variants (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX price_changes_variant_idx ON price_changes (variant_id, changed_at DESC);

-- Row-level security, same pattern as venues.
-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['menus', 'categories', 'menu_items', 'item_variants', 'price_changes'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
    END LOOP;
END
$$;
-- +goose StatementEnd

-- +goose Down
ALTER TABLE venues DROP COLUMN IF EXISTS active_menu_id;
DROP TABLE IF EXISTS price_changes;
DROP TABLE IF EXISTS item_variants;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS menus;
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_id_tenant_key;
