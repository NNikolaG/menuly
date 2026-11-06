-- name: CreateMediaFile :one
INSERT INTO media_files (id, tenant_id, storage_key, mime, size_bytes, filename, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetMediaFile :one
SELECT * FROM media_files WHERE tenant_id = $1 AND id = $2;

-- name: CountVenueImports :one
-- Failed imports do not count against the venue's limit.
SELECT count(*) FROM import_jobs WHERE tenant_id = $1 AND venue_id = $2 AND status <> 'failed';

-- name: CreateImportJob :one
INSERT INTO import_jobs (id, tenant_id, venue_id, created_by)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetImportJob :one
SELECT * FROM import_jobs WHERE tenant_id = $1 AND id = $2;

-- name: GetImportJobForUpdate :one
SELECT * FROM import_jobs WHERE tenant_id = $1 AND id = $2 FOR UPDATE;

-- name: ListVenueImportJobs :many
SELECT * FROM import_jobs WHERE tenant_id = $1 AND venue_id = $2 ORDER BY created_at DESC, id DESC;

-- name: SetImportJobResult :exec
UPDATE import_jobs SET status = $3, draft = $4, error = $5 WHERE tenant_id = $1 AND id = $2;

-- name: SetImportJobStatus :exec
UPDATE import_jobs SET status = $3 WHERE tenant_id = $1 AND id = $2;

-- name: UpdateImportDraft :exec
UPDATE import_jobs SET draft = $3, draft_edited = true WHERE tenant_id = $1 AND id = $2;

-- name: CommitImportJob :exec
UPDATE import_jobs SET status = 'committed', committed_menu_id = $3, committed_at = now()
WHERE tenant_id = $1 AND id = $2;

-- name: CreateImportPage :one
INSERT INTO import_pages (id, tenant_id, job_id, media_file_id, page_index, page_count)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListImportPages :many
SELECT * FROM import_pages WHERE tenant_id = $1 AND job_id = $2 ORDER BY page_index;

-- name: GetImportPage :one
SELECT * FROM import_pages WHERE tenant_id = $1 AND id = $2;

-- name: GetImportPageForUpdate :one
SELECT * FROM import_pages WHERE tenant_id = $1 AND id = $2 FOR UPDATE;

-- name: StartImportPage :exec
UPDATE import_pages SET status = 'processing', attempts = attempts + 1, error = '', error_code = ''
WHERE tenant_id = $1 AND id = $2;

-- name: FinishImportPage :exec
UPDATE import_pages SET
    status = sqlc.arg('status'), raw_result = sqlc.narg('raw_result'), parsed_result = sqlc.narg('parsed_result'),
    error = sqlc.arg('error'), error_code = sqlc.arg('error_code'), provider = sqlc.arg('provider'), model = sqlc.arg('model'),
    input_tokens = input_tokens + sqlc.arg('input_tokens'), output_tokens = output_tokens + sqlc.arg('output_tokens'),
    cost_micros = cost_micros + sqlc.arg('cost_micros')
WHERE tenant_id = sqlc.arg('tenant_id') AND id = sqlc.arg('id');

-- name: RequeueImportPage :exec
UPDATE import_pages SET status = 'queued', error = '', error_code = '' WHERE tenant_id = $1 AND id = $2;

-- name: GetMenuCategoryByName :one
SELECT * FROM categories WHERE tenant_id = $1 AND menu_id = $2 AND lower(name) = lower($3) LIMIT 1;

-- name: LockVenueImportLimit :one
-- Locks the venue row so concurrent uploads cannot both pass the limit check.
SELECT ocr_import_limit FROM venues WHERE tenant_id = $1 AND id = $2 FOR UPDATE;

-- name: ReopenImportJob :exec
UPDATE import_jobs SET status = 'processing', error = '' WHERE tenant_id = $1 AND id = $2;

-- name: MarkImportPagesMerged :exec
UPDATE import_pages SET merged = true WHERE tenant_id = $1 AND job_id = $2 AND status = 'done';

-- name: ReplaceImportPageFile :exec
-- A retaken photo: new file, read again from scratch.
UPDATE import_pages SET media_file_id = $3, page_count = $4, status = 'queued', error = '', error_code = '',
    raw_result = NULL, parsed_result = NULL, merged = false
WHERE tenant_id = $1 AND id = $2;

-- name: SetImportJobDraft :exec
UPDATE import_jobs SET draft = $3 WHERE tenant_id = $1 AND id = $2;

-- name: DeleteImportPage :exec
DELETE FROM import_pages WHERE tenant_id = $1 AND id = $2;

-- name: ImportPageStats :one
SELECT COALESCE(max(page_index) + 1, 0)::int AS next_index, COALESCE(sum(page_count), 0)::int AS total_pages,
       count(*)::int AS files
FROM import_pages WHERE tenant_id = $1 AND job_id = $2;
