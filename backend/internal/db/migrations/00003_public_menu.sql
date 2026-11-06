-- +goose Up

-- Guests have no tenant context. The public menu endpoint first resolves the
-- tenant by its slug (subdomain) through this narrow policy, then sets
-- app.tenant_id and reads everything else through the normal policies.
CREATE POLICY public_lookup ON tenants FOR SELECT
    USING (slug = NULLIF(current_setting('app.public_tenant_slug', true), ''));

-- +goose Down
DROP POLICY IF EXISTS public_lookup ON tenants;
