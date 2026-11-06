-- +goose Up

-- Uploaded originals (menu photos/PDFs now, item images later).
CREATE TABLE media_files (
    id           uuid PRIMARY KEY,
    tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    storage_key  text NOT NULL UNIQUE,
    mime         text NOT NULL,
    size_bytes   bigint NOT NULL CHECK (size_bytes >= 0),
    filename     text NOT NULL DEFAULT '',
    created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT media_files_id_tenant_key UNIQUE (id, tenant_id)
);

-- One OCR import of a venue's existing menu. Status:
--   processing -> ready_for_review | failed -> committed
CREATE TABLE import_jobs (
    id                 uuid PRIMARY KEY,
    tenant_id          uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    venue_id           uuid NOT NULL,
    status             text NOT NULL DEFAULT 'processing'
                       CHECK (status IN ('processing', 'ready_for_review', 'failed', 'committed')),
    -- The editable result the user reviews; built from the pages.
    draft              jsonb,
    draft_edited       boolean NOT NULL DEFAULT false,
    committed_menu_id  uuid REFERENCES menus (id) ON DELETE SET NULL,
    error              text NOT NULL DEFAULT '',
    created_by         uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    committed_at       timestamptz,
    CONSTRAINT import_jobs_id_tenant_key UNIQUE (id, tenant_id),
    FOREIGN KEY (venue_id, tenant_id) REFERENCES venues (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX import_jobs_venue_idx ON import_jobs (venue_id, created_at DESC);
CREATE TRIGGER import_jobs_updated_at BEFORE UPDATE ON import_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One uploaded file of an import (an image, or a PDF of 1..n pages).
CREATE TABLE import_pages (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    job_id         uuid NOT NULL,
    media_file_id  uuid NOT NULL,
    page_index     integer NOT NULL,
    page_count     integer NOT NULL DEFAULT 1 CHECK (page_count >= 1),
    status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
    attempts       integer NOT NULL DEFAULT 0,
    raw_result     jsonb,
    parsed_result  jsonb,
    -- Whether parsed_result is already part of the job's draft.
    merged         boolean NOT NULL DEFAULT false,
    error          text NOT NULL DEFAULT '',
    provider       text NOT NULL DEFAULT '',
    model          text NOT NULL DEFAULT '',
    input_tokens   bigint NOT NULL DEFAULT 0,
    output_tokens  bigint NOT NULL DEFAULT 0,
    -- Estimated provider cost in millionths of a USD.
    cost_micros    bigint NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (job_id, page_index),
    FOREIGN KEY (job_id, tenant_id) REFERENCES import_jobs (id, tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (media_file_id, tenant_id) REFERENCES media_files (id, tenant_id)
);
CREATE TRIGGER import_pages_updated_at BEFORE UPDATE ON import_pages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['media_files', 'import_jobs', 'import_pages'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())', t);
    END LOOP;
END
$$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS import_pages;
DROP TABLE IF EXISTS import_jobs;
DROP TABLE IF EXISTS media_files;
