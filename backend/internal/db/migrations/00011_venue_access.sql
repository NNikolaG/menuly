-- +goose Up

-- Per-venue access for managers and staff. memberships.venue_ids lists the
-- venues a member may work in; empty means every venue of the tenant. Owners
-- always see every venue, whatever the column holds.
--
-- app_venue_scope() is the caller's list, or NULL when the caller is not
-- restricted: owners, unrestricted members, and contexts without a user
-- (background jobs, the public menu, platform admin).
CREATE FUNCTION app_venue_scope() RETURNS uuid[]
    LANGUAGE sql STABLE
    AS $$
        SELECT m.venue_ids FROM memberships m
        WHERE m.tenant_id = app_current_tenant()
          AND m.user_id = app_current_user()
          AND m.role <> 'owner'
          AND cardinality(m.venue_ids) > 0
    $$;

-- RESTRICTIVE policies are ANDed with tenant_isolation (and the other
-- permissive policies), so they only ever narrow what a caller sees.
-- Tables with a venue_id check it directly; their children go through the
-- parent, whose own policy does the filtering.
CREATE POLICY venue_access ON venues AS RESTRICTIVE
    USING (app_venue_scope() IS NULL OR id = ANY (app_venue_scope()));

-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['menus', 'promotions', 'import_jobs', 'menu_view_daily'] LOOP
        EXECUTE format(
            'CREATE POLICY venue_access ON %I AS RESTRICTIVE USING (app_venue_scope() IS NULL OR venue_id = ANY (app_venue_scope()))', t);
    END LOOP;
END
$$;
-- +goose StatementEnd

CREATE POLICY venue_access ON categories AS RESTRICTIVE
    USING (app_venue_scope() IS NULL OR menu_id IN (SELECT id FROM menus));
CREATE POLICY venue_access ON menu_themes AS RESTRICTIVE
    USING (app_venue_scope() IS NULL OR menu_id IN (SELECT id FROM menus));
CREATE POLICY venue_access ON menu_items AS RESTRICTIVE
    USING (app_venue_scope() IS NULL OR category_id IN (SELECT id FROM categories));
CREATE POLICY venue_access ON item_variants AS RESTRICTIVE
    USING (app_venue_scope() IS NULL OR item_id IN (SELECT id FROM menu_items));
CREATE POLICY venue_access ON price_changes AS RESTRICTIVE
    USING (app_venue_scope() IS NULL OR variant_id IN (SELECT id FROM item_variants));
CREATE POLICY venue_access ON promotion_slots AS RESTRICTIVE
    USING (app_venue_scope() IS NULL OR promotion_id IN (SELECT id FROM promotions));
CREATE POLICY venue_access ON promotion_slot_options AS RESTRICTIVE
    USING (app_venue_scope() IS NULL OR slot_id IN (SELECT id FROM promotion_slots));
CREATE POLICY venue_access ON import_pages AS RESTRICTIVE
    USING (app_venue_scope() IS NULL OR job_id IN (SELECT id FROM import_jobs));

-- Invitations carry the venues the new member gets on accept.
ALTER TABLE invitations ADD COLUMN venue_ids uuid[] NOT NULL DEFAULT '{}';

-- +goose Down
ALTER TABLE invitations DROP COLUMN IF EXISTS venue_ids;
-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['venues', 'menus', 'promotions', 'import_jobs', 'menu_view_daily',
                             'categories', 'menu_themes', 'menu_items', 'item_variants', 'price_changes',
                             'promotion_slots', 'promotion_slot_options', 'import_pages'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS venue_access ON %I', t);
    END LOOP;
END
$$;
-- +goose StatementEnd
DROP FUNCTION IF EXISTS app_venue_scope();
