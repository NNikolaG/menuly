-- +goose Up

-- One theme per menu (1:1). A menu without a row renders with the defaults
-- below; the API returns those defaults too, so clients never see "no theme".
-- accent and font are keys of presets the web app defines (Receipt design
-- system); they are validated in the API so the list can grow without a
-- migration.
CREATE TABLE menu_themes (
    menu_id            uuid PRIMARY KEY,
    tenant_id          uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    template           text NOT NULL DEFAULT 'racun' CHECK (template IN ('racun', 'galerija', 'tabla')),
    accent             text NOT NULL DEFAULT 'tinta',
    font               text NOT NULL DEFAULT 'onest',
    color_mode         text NOT NULL DEFAULT 'auto' CHECK (color_mode IN ('auto', 'light', 'dark')),
    show_images        boolean NOT NULL DEFAULT true,
    show_descriptions  boolean NOT NULL DEFAULT true,
    show_pattern       boolean NOT NULL DEFAULT true,
    logo_url           text NOT NULL DEFAULT '',
    cover_url          text NOT NULL DEFAULT '',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (menu_id, tenant_id) REFERENCES menus (id, tenant_id) ON DELETE CASCADE
);
CREATE TRIGGER menu_themes_updated_at BEFORE UPDATE ON menu_themes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE menu_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_themes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON menu_themes
    USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

-- +goose Down
DROP TABLE IF EXISTS menu_themes;
