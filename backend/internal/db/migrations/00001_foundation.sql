-- +goose Up

-- The API connects as menuly_app, a role WITHOUT superuser and WITHOUT
-- BYPASSRLS, so row-level security applies to every query it runs.
-- Migrations run as the schema owner. In production the login password for
-- menuly_app is set outside of migrations (see deploy/postgres/init.sql).
-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'menuly_app') THEN
        CREATE ROLE menuly_app NOLOGIN;
    END IF;
END
$$;
-- +goose StatementEnd

CREATE EXTENSION IF NOT EXISTS citext;

-- Tenant context is set per transaction with set_config('app.tenant_id', ..., true).
-- Missing or empty setting resolves to NULL, which matches no rows.
CREATE FUNCTION app_current_tenant() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE FUNCTION app_current_user() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Global tables (not tenant scoped) ------------------------------------------

CREATE TABLE users (
    id                uuid PRIMARY KEY,
    email             citext NOT NULL UNIQUE,
    password_hash     text NOT NULL,
    name              text NOT NULL,
    locale            text NOT NULL DEFAULT 'sr-Latn',
    is_platform_admin boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Refresh tokens are looked up by hash before any tenant is known, so this
-- table is global. tenant_id restores the tenant context on refresh.
CREATE TABLE refresh_tokens (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tenant_id   uuid NOT NULL,
    token_hash  bytea NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- Tenant tables ----------------------------------------------------------------

CREATE TABLE tenants (
    id          uuid PRIMARY KEY,
    name        text NOT NULL,
    plan        text NOT NULL DEFAULT 'free',
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE refresh_tokens
    ADD CONSTRAINT refresh_tokens_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

CREATE TABLE memberships (
    tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
    venue_ids   uuid[] NOT NULL DEFAULT '{}',  -- empty = all venues
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON memberships
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE venues (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name           text NOT NULL,
    slug           citext NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    address        text NOT NULL DEFAULT '',
    phone          text NOT NULL DEFAULT '',
    currency       text NOT NULL DEFAULT 'RSD' CHECK (currency ~ '^[A-Z]{3}$'),
    timezone       text NOT NULL DEFAULT 'Europe/Belgrade',
    opening_hours  jsonb NOT NULL DEFAULT '{}',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venues_tenant_idx ON venues (tenant_id);
CREATE TRIGGER venues_updated_at BEFORE UPDATE ON venues
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row-level security -------------------------------------------------------------
-- FORCE makes the policies apply to the table owner as well. Every new tenant
-- table must get ENABLE + FORCE + a tenant_isolation policy like venues below.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
-- A user sees the current tenant plus every tenant they are a member of
-- (needed for login and the tenant switcher).
CREATE POLICY tenant_isolation ON tenants
    USING (
        id = app_current_tenant()
        OR id IN (SELECT m.tenant_id FROM memberships m WHERE m.user_id = app_current_user())
    )
    WITH CHECK (id = app_current_tenant());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
    USING (tenant_id = app_current_tenant() OR user_id = app_current_user())
    WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON venues
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());

-- Privileges for the application role -----------------------------------------------

GRANT USAGE ON SCHEMA public TO menuly_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO menuly_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO menuly_app;
-- goose_db_version is owned by the migrator; the app does not need it.
REVOKE ALL ON goose_db_version FROM menuly_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO menuly_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO menuly_app;

-- +goose Down
DROP TABLE IF EXISTS venues;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS tenants;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS set_updated_at();
DROP FUNCTION IF EXISTS app_current_user();
DROP FUNCTION IF EXISTS app_current_tenant();
