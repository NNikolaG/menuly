-- +goose Up

-- Uploaded images (item photos, logos, covers) reuse media_files.
ALTER TABLE media_files ADD COLUMN purpose text NOT NULL DEFAULT 'import'
    CHECK (purpose IN ('import', 'item', 'logo', 'cover', 'promotion'));

-- Public menu opens per venue and day (the guest app reports one per visit).
CREATE TABLE menu_view_daily (
    tenant_id  uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    venue_id   uuid NOT NULL,
    day        date NOT NULL,
    views      bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (venue_id, day),
    FOREIGN KEY (venue_id, tenant_id) REFERENCES venues (id, tenant_id) ON DELETE CASCADE
);

-- Team invitations. The link carries a random token; only its hash is kept.
CREATE TABLE invitations (
    id           uuid PRIMARY KEY,
    tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    email        citext NOT NULL,
    role         text NOT NULL CHECK (role IN ('manager', 'staff')),
    token_hash   bytea NOT NULL UNIQUE,
    invited_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    expires_at   timestamptz NOT NULL,
    accepted_at  timestamptz,
    revoked_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_tenant_idx ON invitations (tenant_id, created_at DESC);

-- Password reset links (global, like users).
CREATE TABLE password_resets (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  bytea NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);

-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['menu_view_daily', 'invitations'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
    END LOOP;
    -- Platform admins (Menuly staff) see and manage every tenant. The API
    -- sets app.platform_admin only after checking users.is_platform_admin.
    FOREACH t IN ARRAY ARRAY['tenants', 'memberships', 'venues', 'menus', 'import_jobs', 'import_pages', 'menu_view_daily'] LOOP
        EXECUTE format(
            'CREATE POLICY platform_admin ON %I USING (current_setting(''app.platform_admin'', true) = ''on'')', t);
    END LOOP;
END
$$;
-- +goose StatementEnd

-- Someone opening an invite link has no tenant context yet: expose only the
-- invitation whose token hash is in app.invite_token_hash (hex).
CREATE POLICY invite_lookup ON invitations FOR SELECT
    USING (encode(token_hash, 'hex') = NULLIF(current_setting('app.invite_token_hash', true), ''));
CREATE POLICY invite_lookup ON tenants FOR SELECT
    USING (id IN (SELECT i.tenant_id FROM invitations i
                  WHERE encode(i.token_hash, 'hex') = NULLIF(current_setting('app.invite_token_hash', true), '')));

-- +goose Down
DROP POLICY IF EXISTS invite_lookup ON tenants;
-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['tenants', 'memberships', 'venues', 'menus', 'import_jobs', 'import_pages'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS platform_admin ON %I', t);
    END LOOP;
END
$$;
-- +goose StatementEnd
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS menu_view_daily;
ALTER TABLE media_files DROP COLUMN IF EXISTS purpose;
