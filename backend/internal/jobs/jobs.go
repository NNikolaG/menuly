// Package jobs runs background work (OCR imports) on a Postgres-backed queue
// (River). Jobs carry the tenant ID and every job runs inside that tenant's
// RLS scope.
package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
	"github.com/nnikolag/menuly/backend/internal/ocr"
	"github.com/nnikolag/menuly/backend/internal/storage"
)

// ExtractPageArgs asks a worker to read one uploaded file of an import.
type ExtractPageArgs struct {
	TenantID uuid.UUID `json:"tenant_id"`
	JobID    uuid.UUID `json:"job_id"`
	PageID   uuid.UUID `json:"page_id"`
}

func (ExtractPageArgs) Kind() string { return "ocr_extract_page" }

// InsertOpts: paid calls, so only a few attempts for transient errors.
func (ExtractPageArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{MaxAttempts: 3, Queue: "ocr"}
}

// Migrate creates/updates River's own tables. It runs after the app
// migrations, as the schema owner.
func Migrate(ctx context.Context, ownerURL string) error {
	pool, err := pgxpool.New(ctx, ownerURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	m, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return err
	}
	_, err = m.Migrate(ctx, rivermigrate.DirectionUp, nil)
	return err
}

// Queue enqueues jobs, inside the caller's transaction when given one.
type Queue struct {
	client *river.Client[pgx.Tx]
}

type Config struct {
	DB        *db.DB
	Store     storage.Store
	Extractor ocr.MenuExtractor // nil: imports fail with "not configured"
	// Workers > 0 also processes jobs in this process.
	Workers int
}

func New(cfg Config) (*Queue, error) {
	workers := river.NewWorkers()
	river.AddWorker(workers, &extractWorker{db: cfg.DB, store: cfg.Store, extractor: cfg.Extractor})
	rc := &river.Config{Workers: workers, Logger: slog.Default()}
	if cfg.Workers > 0 {
		rc.Queues = map[string]river.QueueConfig{"ocr": {MaxWorkers: cfg.Workers}}
	}
	client, err := river.NewClient(riverpgxv5.New(cfg.DB.Pool), rc)
	if err != nil {
		return nil, err
	}
	return &Queue{client: client}, nil
}

func (q *Queue) Start(ctx context.Context) error { return q.client.Start(ctx) }
func (q *Queue) Stop(ctx context.Context) error  { return q.client.Stop(ctx) }

// EnqueueTx adds the job in tx, so it only runs if tx commits.
func (q *Queue) EnqueueTx(ctx context.Context, tx pgx.Tx, args river.JobArgs) error {
	_, err := q.client.InsertTx(ctx, tx, args, nil)
	return err
}

type extractWorker struct {
	river.WorkerDefaults[ExtractPageArgs]
	db        *db.DB
	store     storage.Store
	extractor ocr.MenuExtractor
}

func (w *extractWorker) Timeout(*river.Job[ExtractPageArgs]) time.Duration { return 5 * time.Minute }

func (w *extractWorker) Work(ctx context.Context, job *river.Job[ExtractPageArgs]) error {
	a := job.Args
	scope := db.Scope{TenantID: a.TenantID}
	var page sqlc.ImportPage
	var file sqlc.MediaFile
	err := w.db.Tx(ctx, scope, func(q *sqlc.Queries) error {
		var err error
		if page, err = q.GetImportPageForUpdate(ctx, sqlc.GetImportPageForUpdateParams{TenantID: a.TenantID, ID: a.PageID}); err != nil {
			return err
		}
		if page.Status == "done" {
			return errAlreadyDone
		}
		if file, err = q.GetMediaFile(ctx, sqlc.GetMediaFileParams{TenantID: a.TenantID, ID: page.MediaFileID}); err != nil {
			return err
		}
		return q.StartImportPage(ctx, sqlc.StartImportPageParams{TenantID: a.TenantID, ID: a.PageID})
	})
	if errors.Is(err, errAlreadyDone) || db.IsNotFound(err) {
		return nil // deleted or already handled
	}
	if err != nil {
		return err
	}

	data, err := w.store.Get(ctx, file.StorageKey)
	if err != nil {
		return w.fail(ctx, a, page.PageIndex, ocr.Usage{}, fmt.Errorf("read upload: %w", err), job)
	}
	if w.extractor == nil {
		return w.fail(ctx, a, page.PageIndex, ocr.Usage{}, fmt.Errorf("%w", ocr.ErrNotConfigured), job)
	}
	extracted, usage, err := w.extractor.Extract(ctx, ocr.Page{MIME: file.Mime, Data: data})
	if err != nil {
		return w.fail(ctx, a, page.PageIndex, usage, err, job)
	}
	draft := ocr.ToDraft(extracted, int(page.PageIndex))
	if ocr.Summarize(draft).Items == 0 {
		cause := ocr.ErrNoItems
		if slices.Contains(extracted.PhotoIssues, "not_a_menu") {
			cause = ocr.ErrNotAMenu
		}
		return w.fail(ctx, a, page.PageIndex, usage, cause, job)
	}
	raw, _ := json.Marshal(extracted)
	parsed, _ := json.Marshal(draft)
	return w.db.Tx(ctx, scope, func(q *sqlc.Queries) error {
		if err := q.FinishImportPage(ctx, sqlc.FinishImportPageParams{
			TenantID: a.TenantID, ID: a.PageID, Status: "done", RawResult: raw, ParsedResult: parsed,
			Provider: usage.Provider, Model: usage.Model,
			InputTokens: usage.InputTokens, OutputTokens: usage.OutputTokens, CostMicros: usage.CostMicros,
		}); err != nil {
			return err
		}
		return Finalize(ctx, q, a.TenantID, a.JobID)
	})
}

var errAlreadyDone = errors.New("page already processed")

// fail records the error. Transient errors are returned to River for a
// retry until the last attempt; permanent ones end the page right away.
func (w *extractWorker) fail(ctx context.Context, a ExtractPageArgs, pageIndex int32, usage ocr.Usage, cause error, job *river.Job[ExtractPageArgs]) error {
	permanent := errors.Is(cause, ocr.ErrPermanent) || errors.Is(cause, ocr.ErrNotConfigured)
	last := job.Attempt >= job.MaxAttempts
	status := "failed"
	if !permanent && !last {
		status = "queued"
	}
	slog.WarnContext(ctx, "ocr page failed", "tenant_id", a.TenantID, "job_id", a.JobID, "page", pageIndex,
		"attempt", job.Attempt, "permanent", permanent, "err", cause)
	err := w.db.Tx(ctx, db.Scope{TenantID: a.TenantID}, func(q *sqlc.Queries) error {
		if err := q.FinishImportPage(ctx, sqlc.FinishImportPageParams{
			TenantID: a.TenantID, ID: a.PageID, Status: status, Error: userMessage(cause), ErrorCode: errorCode(cause, status),
			Provider: usage.Provider, Model: usage.Model,
			InputTokens: usage.InputTokens, OutputTokens: usage.OutputTokens, CostMicros: usage.CostMicros,
		}); err != nil {
			return err
		}
		if status == "failed" {
			return Finalize(ctx, q, a.TenantID, a.JobID)
		}
		return nil
	})
	if err != nil {
		return err
	}
	if status == "queued" {
		return cause // River retries with backoff
	}
	return nil
}

func userMessage(err error) string {
	switch {
	case errors.Is(err, ocr.ErrNotConfigured):
		return "OCR is not configured on this server"
	case errors.Is(err, ocr.ErrPermanent):
		return "could not read this file: " + strings.TrimPrefix(err.Error(), ocr.ErrPermanent.Error()+": ")
	default:
		return "temporary error: " + err.Error()
	}
}

// errorCode is the stable reason the app maps to its own text:
// not_configured, not_a_menu, no_items, unreadable, temporary (will be
// retried) or gave_up (temporary errors on every attempt).
func errorCode(err error, status string) string {
	switch {
	case errors.Is(err, ocr.ErrNotConfigured):
		return "not_configured"
	case errors.Is(err, ocr.ErrNotAMenu):
		return "not_a_menu"
	case errors.Is(err, ocr.ErrNoItems):
		return "no_items"
	case errors.Is(err, ocr.ErrPermanent):
		return "unreadable"
	case status == "queued":
		return "temporary"
	default:
		return "gave_up"
	}
}

// Finalize moves the job on once no page is pending: ready_for_review
// with a merged draft if any page worked, failed otherwise. Must run in the
// tenant scope; the job row lock serialises concurrent page workers.
// When the user already edited the draft (and then retried a failed page),
// only pages not yet in the draft are appended to their edits.
func Finalize(ctx context.Context, q *sqlc.Queries, tenantID, jobID uuid.UUID) error {
	job, err := q.GetImportJobForUpdate(ctx, sqlc.GetImportJobForUpdateParams{TenantID: tenantID, ID: jobID})
	if err != nil {
		return err
	}
	if job.Status == "committed" {
		return nil
	}
	pages, err := q.ListImportPages(ctx, sqlc.ListImportPagesParams{TenantID: tenantID, JobID: jobID})
	if err != nil {
		return err
	}
	var all, fresh []ocr.Draft
	failed := 0
	for _, p := range pages {
		switch p.Status {
		case "queued", "processing":
			return nil // still running
		case "failed":
			failed++
		case "done":
			var d ocr.Draft
			if err := json.Unmarshal(p.ParsedResult, &d); err == nil {
				all = append(all, d)
				if !p.Merged {
					fresh = append(fresh, d)
				}
			}
		}
	}
	var edited ocr.Draft
	keepEdits := job.DraftEdited && job.Draft != nil && json.Unmarshal(job.Draft, &edited) == nil
	if len(all) == 0 && !keepEdits {
		return q.SetImportJobResult(ctx, sqlc.SetImportJobResultParams{
			TenantID: tenantID, ID: jobID, Status: "failed", Draft: job.Draft,
			Error: "no page could be read",
		})
	}
	draft := ocr.Merge(all)
	if keepEdits {
		draft = ocr.Merge(append([]ocr.Draft{edited}, fresh...))
	}
	if err := q.MarkImportPagesMerged(ctx, sqlc.MarkImportPagesMergedParams{TenantID: tenantID, JobID: jobID}); err != nil {
		return err
	}
	b, _ := json.Marshal(draft)
	msg := ""
	if failed > 0 {
		msg = fmt.Sprintf("%d of %d files could not be read", failed, len(pages))
	}
	return q.SetImportJobResult(ctx, sqlc.SetImportJobResultParams{
		TenantID: tenantID, ID: jobID, Status: "ready_for_review", Draft: b, Error: msg,
	})
}
