package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"

	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
	"github.com/nnikolag/menuly/backend/internal/jobs"
	"github.com/nnikolag/menuly/backend/internal/ocr"
	"github.com/nnikolag/menuly/backend/internal/storage"
)

// JobQueue enqueues background jobs inside a request transaction.
type JobQueue interface {
	EnqueueTx(ctx context.Context, tx pgx.Tx, args river.JobArgs) error
}

const (
	maxImportPages     = 20
	maxImportFileBytes = 15 << 20
	maxImportBodyBytes = 80 << 20
)

var errImportsDisabled = &APIError{Status: http.StatusServiceUnavailable, Code: "imports_unavailable", Message: "menu import is not available on this server"}

type importPageDTO struct {
	ID        uuid.UUID `json:"id"`
	PageIndex int32     `json:"page_index"`
	PageCount int32     `json:"page_count"`
	Status    string    `json:"status"`
	Attempts  int32     `json:"attempts"`
	Error     string    `json:"error"`
	ErrorCode string    `json:"error_code"`
	Filename  string    `json:"filename"`
	MIME      string    `json:"mime"`
	// PhotoQuality / PhotoIssues come from the model once the page is read,
	// so the app can suggest retaking a blurry or cut-off photo.
	PhotoQuality string   `json:"photo_quality"`
	PhotoIssues  []string `json:"photo_issues"`
}

type importJobDTO struct {
	ID              uuid.UUID       `json:"id"`
	VenueID         uuid.UUID       `json:"venue_id"`
	Status          string          `json:"status"`
	Error           string          `json:"error"`
	DraftEdited     bool            `json:"draft_edited"`
	CommittedMenuID *uuid.UUID      `json:"committed_menu_id"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
	CommittedAt     *time.Time      `json:"committed_at"`
	Summary         *ocr.Summary    `json:"summary,omitempty"`
	Draft           json.RawMessage `json:"draft,omitempty"`
	Pages           []importPageDTO `json:"pages,omitempty"`
}

func toImportJobDTO(j sqlc.ImportJob) importJobDTO {
	dto := importJobDTO{
		ID: j.ID, VenueID: j.VenueID, Status: j.Status, Error: j.Error, DraftEdited: j.DraftEdited,
		CommittedMenuID: j.CommittedMenuID, CreatedAt: j.CreatedAt, UpdatedAt: j.UpdatedAt, CommittedAt: j.CommittedAt,
	}
	var d ocr.Draft
	if j.Draft != nil && json.Unmarshal(j.Draft, &d) == nil {
		sum := ocr.Summarize(d)
		dto.Summary = &sum
	}
	return dto
}

// loadImport returns the job with its pages and draft.
func loadImport(ctx context.Context, q *sqlc.Queries, tenantID, id uuid.UUID) (importJobDTO, error) {
	j, err := q.GetImportJob(ctx, sqlc.GetImportJobParams{TenantID: tenantID, ID: id})
	if err != nil {
		return importJobDTO{}, err
	}
	pages, err := q.ListImportPages(ctx, sqlc.ListImportPagesParams{TenantID: tenantID, JobID: id})
	if err != nil {
		return importJobDTO{}, err
	}
	dto := toImportJobDTO(j)
	dto.Draft = json.RawMessage("null")
	if j.Draft != nil {
		dto.Draft = j.Draft
	}
	dto.Pages = make([]importPageDTO, 0, len(pages))
	for _, p := range pages {
		f, err := q.GetMediaFile(ctx, sqlc.GetMediaFileParams{TenantID: tenantID, ID: p.MediaFileID})
		if err != nil {
			return importJobDTO{}, err
		}
		pd := importPageDTO{
			ID: p.ID, PageIndex: p.PageIndex, PageCount: p.PageCount, Status: p.Status,
			Attempts: p.Attempts, Error: p.Error, ErrorCode: p.ErrorCode, Filename: f.Filename, MIME: f.Mime,
			PhotoIssues: []string{},
		}
		var raw ocr.Extracted
		if p.RawResult != nil && json.Unmarshal(p.RawResult, &raw) == nil {
			pd.PhotoQuality = raw.PhotoQuality
			if raw.PhotoIssues != nil {
				pd.PhotoIssues = raw.PhotoIssues
			}
		}
		dto.Pages = append(dto.Pages, pd)
	}
	return dto, nil
}

func errImportLimit(limit int32) *APIError {
	return &APIError{Status: http.StatusConflict, Code: "import_limit_reached",
		Message: fmt.Sprintf("this venue has used all %d menu imports; edit the existing menu by hand", limit)}
}

func errTooManyPages(n int) *APIError {
	return errValidation(fmt.Sprintf("the import would have %d pages; at most %d pages per import", n, maxImportPages))
}

// checkImportQuota fails with import_limit_reached when the venue cannot
// start (or bring back) another import. lock takes the venue row lock so
// that concurrent requests cannot both pass.
func checkImportQuota(ctx context.Context, q *sqlc.Queries, tenantID, venueID uuid.UUID, lock bool) error {
	var limit int32
	if lock {
		l, err := q.LockVenueImportLimit(ctx, sqlc.LockVenueImportLimitParams{TenantID: tenantID, ID: venueID})
		if err != nil {
			return err
		}
		limit = l
	} else {
		v, err := q.GetVenue(ctx, sqlc.GetVenueParams{TenantID: tenantID, ID: venueID})
		if err != nil {
			return err
		}
		limit = v.OcrImportLimit
	}
	used, err := q.CountVenueImports(ctx, sqlc.CountVenueImportsParams{TenantID: tenantID, VenueID: venueID})
	if err != nil {
		return err
	}
	if used >= int64(limit) {
		return errImportLimit(limit)
	}
	return nil
}

type preparedUpload struct {
	filename string
	key      string
	ocr.Prepared
}

func (s *Server) importsEnabled(w http.ResponseWriter, r *http.Request) bool {
	if s.store == nil || s.jobs == nil {
		writeError(w, r, errImportsDisabled)
		return false
	}
	return true
}

// readUploads parses the multipart body, prepares every file in field and
// stores it. maxPages is how many pages may still be added.
func (s *Server) readUploads(w http.ResponseWriter, r *http.Request, tenantID, jobID uuid.UUID, field string, maxFiles, maxPages int) ([]preparedUpload, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxImportBodyBytes)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		return nil, errBadRequest("invalid_upload", "expected multipart/form-data with files (at most 80 MB in total)")
	}
	headers := r.MultipartForm.File[field]
	if len(headers) == 0 {
		return nil, errValidation(fmt.Sprintf("upload at least one file in the %q field", field))
	}
	if len(headers) > maxFiles {
		return nil, errValidation(fmt.Sprintf("at most %d file(s) here", maxFiles))
	}
	uploads := make([]preparedUpload, 0, len(headers))
	pages := 0
	for _, h := range headers {
		up, apiErr := prepareUpload(h)
		if apiErr != nil {
			return nil, apiErr
		}
		pages += up.PageCount
		uploads = append(uploads, up)
	}
	if pages > maxPages {
		return nil, errValidation(fmt.Sprintf("the upload has %d pages; only %d more fit in this import (at most %d)", pages, maxPages, maxImportPages))
	}
	// Files go to storage before the transaction; if it fails they are
	// orphaned, which is harmless (keys are unique).
	for i := range uploads {
		uploads[i].key = fmt.Sprintf("tenants/%s/imports/%s/%s", tenantID, jobID, uuid.Must(uuid.NewV7()))
		if err := s.store.Put(r.Context(), uploads[i].key, uploads[i].Data, uploads[i].MIME); err != nil {
			return nil, fmt.Errorf("store upload: %w", err)
		}
	}
	return uploads, nil
}

func createMediaFile(ctx context.Context, q *sqlc.Queries, p Principal, up preparedUpload) (sqlc.MediaFile, error) {
	return q.CreateMediaFile(ctx, sqlc.CreateMediaFileParams{
		ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, StorageKey: up.key, Mime: up.MIME,
		SizeBytes: int64(len(up.Data)), Filename: up.filename, CreatedBy: &p.UserID,
	})
}

// addPages records uploads as pages of the job and enqueues their reads.
func (s *Server) addPages(ctx context.Context, tx pgx.Tx, q *sqlc.Queries, p Principal, jobID uuid.UUID, start int32, uploads []preparedUpload) error {
	for i, up := range uploads {
		f, err := createMediaFile(ctx, q, p, up)
		if err != nil {
			return err
		}
		page, err := q.CreateImportPage(ctx, sqlc.CreateImportPageParams{
			ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, JobID: jobID, MediaFileID: f.ID,
			PageIndex: start + int32(i), PageCount: int32(up.PageCount),
		})
		if err != nil {
			return err
		}
		if err := s.jobs.EnqueueTx(ctx, tx, jobs.ExtractPageArgs{TenantID: p.TenantID, JobID: jobID, PageID: page.ID}); err != nil {
			return err
		}
	}
	return nil
}

// POST /v1/venues/{venueID}/imports (multipart, field "files", 1..n files)
func (s *Server) handleCreateImport(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	if !s.importsEnabled(w, r) {
		return
	}
	venueID, err := urlID(r, "venueID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	// Cheap check first, before reading and decoding the upload.
	if err := s.tx(r, func(q *sqlc.Queries) error { return checkImportQuota(r.Context(), q, p.TenantID, venueID, false) }); err != nil {
		writeError(w, r, notFoundAs(err))
		return
	}
	jobID := uuid.Must(uuid.NewV7())
	uploads, err := s.readUploads(w, r, p.TenantID, jobID, "files", maxImportPages, maxImportPages)
	if err != nil {
		writeError(w, r, err)
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck

	var out importJobDTO
	err = s.db.TxRaw(r.Context(), p.Scope(), func(tx pgx.Tx, q *sqlc.Queries) error {
		ctx := r.Context()
		if err := checkImportQuota(ctx, q, p.TenantID, venueID, true); err != nil {
			return err
		}
		if _, err := q.CreateImportJob(ctx, sqlc.CreateImportJobParams{ID: jobID, TenantID: p.TenantID, VenueID: venueID, CreatedBy: &p.UserID}); err != nil {
			return err
		}
		if err := s.addPages(ctx, tx, q, p, jobID, 0, uploads); err != nil {
			return err
		}
		out, err = loadImport(ctx, q, p.TenantID, jobID)
		return err
	})
	writeResult(w, r, http.StatusAccepted, out, err)
}

// lockOpenImport locks a job that may still change. A failed job is brought
// back, so it has to fit the venue's limit again.
func lockOpenImport(ctx context.Context, q *sqlc.Queries, tenantID, id uuid.UUID) (sqlc.ImportJob, error) {
	j, err := q.GetImportJobForUpdate(ctx, sqlc.GetImportJobForUpdateParams{TenantID: tenantID, ID: id})
	if err != nil {
		return j, err
	}
	if j.Status == "committed" {
		return j, errImportState(j.Status, "a committed import cannot change")
	}
	if j.Status == "failed" {
		if err := checkImportQuota(ctx, q, tenantID, j.VenueID, true); err != nil {
			return j, err
		}
	}
	return j, nil
}

// POST /v1/imports/{importID}/pages adds forgotten photos to an import
// (multipart "files"); it does not use up another import.
func (s *Server) handleAddImportPages(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	if !s.importsEnabled(w, r) {
		return
	}
	jobID, err := urlID(r, "importID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var stats sqlc.ImportPageStatsRow
	err = s.tx(r, func(q *sqlc.Queries) error {
		j, err := q.GetImportJob(r.Context(), sqlc.GetImportJobParams{TenantID: p.TenantID, ID: jobID})
		if err != nil {
			return err
		}
		if j.Status == "committed" {
			return errImportState(j.Status, "a committed import cannot change")
		}
		stats, err = q.ImportPageStats(r.Context(), sqlc.ImportPageStatsParams{TenantID: p.TenantID, JobID: jobID})
		return err
	})
	if err != nil {
		writeError(w, r, notFoundAs(err))
		return
	}
	room := maxImportPages - int(stats.TotalPages)
	if room <= 0 {
		writeError(w, r, errTooManyPages(int(stats.TotalPages)+1))
		return
	}
	uploads, err := s.readUploads(w, r, p.TenantID, jobID, "files", room, room)
	if err != nil {
		writeError(w, r, err)
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck

	var out importJobDTO
	err = s.db.TxRaw(r.Context(), p.Scope(), func(tx pgx.Tx, q *sqlc.Queries) error {
		ctx := r.Context()
		if _, err := lockOpenImport(ctx, q, p.TenantID, jobID); err != nil {
			return err
		}
		stats, err := q.ImportPageStats(ctx, sqlc.ImportPageStatsParams{TenantID: p.TenantID, JobID: jobID})
		if err != nil {
			return err
		}
		total := int(stats.TotalPages)
		for _, up := range uploads {
			total += up.PageCount
		}
		if total > maxImportPages {
			return errTooManyPages(total)
		}
		if err := s.addPages(ctx, tx, q, p, jobID, stats.NextIndex, uploads); err != nil {
			return err
		}
		if err := q.ReopenImportJob(ctx, sqlc.ReopenImportJobParams{TenantID: p.TenantID, ID: jobID}); err != nil {
			return err
		}
		out, err = loadImport(ctx, q, p.TenantID, jobID)
		return err
	})
	writeResult(w, r, http.StatusAccepted, out, err)
}

// lockSettledPage locks a page of the job that is not being read right now.
func lockSettledPage(ctx context.Context, q *sqlc.Queries, tenantID, jobID, pageID uuid.UUID) (sqlc.ImportPage, error) {
	page, err := q.GetImportPageForUpdate(ctx, sqlc.GetImportPageForUpdateParams{TenantID: tenantID, ID: pageID})
	if err != nil {
		return page, err
	}
	if page.JobID != jobID {
		return page, errNotFound
	}
	if page.Status == "queued" || page.Status == "processing" {
		return page, errImportState(page.Status, "wait until this page has been read")
	}
	return page, nil
}

// dropPageFromEditedDraft removes a page's items from a draft the user has
// already edited (an unedited draft is rebuilt from the pages anyway).
func dropPageFromEditedDraft(ctx context.Context, q *sqlc.Queries, j sqlc.ImportJob, page sqlc.ImportPage) error {
	if !j.DraftEdited || j.Draft == nil || page.Status != "done" {
		return nil
	}
	var d ocr.Draft
	if err := json.Unmarshal(j.Draft, &d); err != nil {
		return err
	}
	b, _ := json.Marshal(ocr.RemovePage(d, int(page.PageIndex)))
	return q.SetImportJobDraft(ctx, sqlc.SetImportJobDraftParams{TenantID: j.TenantID, ID: j.ID, Draft: b})
}

// PUT /v1/imports/{importID}/pages/{pageID}/file replaces a page with a
// retaken photo (multipart "file") and reads it again. Its old items leave
// the draft; the user's other edits stay.
func (s *Server) handleReplaceImportPage(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	if !s.importsEnabled(w, r) {
		return
	}
	jobID, err := urlID(r, "importID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	pageID, err := urlID(r, "pageID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var room int
	err = s.tx(r, func(q *sqlc.Queries) error {
		page, err := q.GetImportPage(r.Context(), sqlc.GetImportPageParams{TenantID: p.TenantID, ID: pageID})
		if err != nil {
			return err
		}
		if page.JobID != jobID {
			return errNotFound
		}
		stats, err := q.ImportPageStats(r.Context(), sqlc.ImportPageStatsParams{TenantID: p.TenantID, JobID: jobID})
		room = maxImportPages - int(stats.TotalPages) + int(page.PageCount)
		return err
	})
	if err != nil {
		writeError(w, r, notFoundAs(err))
		return
	}
	uploads, err := s.readUploads(w, r, p.TenantID, jobID, "file", 1, room)
	if err != nil {
		writeError(w, r, err)
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck

	var out importJobDTO
	err = s.db.TxRaw(r.Context(), p.Scope(), func(tx pgx.Tx, q *sqlc.Queries) error {
		ctx := r.Context()
		j, err := lockOpenImport(ctx, q, p.TenantID, jobID)
		if err != nil {
			return err
		}
		page, err := lockSettledPage(ctx, q, p.TenantID, jobID, pageID)
		if err != nil {
			return err
		}
		if err := dropPageFromEditedDraft(ctx, q, j, page); err != nil {
			return err
		}
		f, err := createMediaFile(ctx, q, p, uploads[0])
		if err != nil {
			return err
		}
		if err := q.ReplaceImportPageFile(ctx, sqlc.ReplaceImportPageFileParams{
			TenantID: p.TenantID, ID: pageID, MediaFileID: f.ID, PageCount: int32(uploads[0].PageCount),
		}); err != nil {
			return err
		}
		if err := q.ReopenImportJob(ctx, sqlc.ReopenImportJobParams{TenantID: p.TenantID, ID: jobID}); err != nil {
			return err
		}
		if err := s.jobs.EnqueueTx(ctx, tx, jobs.ExtractPageArgs{TenantID: p.TenantID, JobID: jobID, PageID: pageID}); err != nil {
			return err
		}
		out, err = loadImport(ctx, q, p.TenantID, jobID)
		return err
	})
	writeResult(w, r, http.StatusAccepted, out, err)
}

// DELETE /v1/imports/{importID}/pages/{pageID} removes a wrong photo and its
// items. The last page cannot be removed.
func (s *Server) handleDeleteImportPage(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	jobID, err := urlID(r, "importID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	pageID, err := urlID(r, "pageID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var out importJobDTO
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		j, err := q.GetImportJobForUpdate(ctx, sqlc.GetImportJobForUpdateParams{TenantID: p.TenantID, ID: jobID})
		if err != nil {
			return err
		}
		if j.Status == "committed" {
			return errImportState(j.Status, "a committed import cannot change")
		}
		page, err := lockSettledPage(ctx, q, p.TenantID, jobID, pageID)
		if err != nil {
			return err
		}
		stats, err := q.ImportPageStats(ctx, sqlc.ImportPageStatsParams{TenantID: p.TenantID, JobID: jobID})
		if err != nil {
			return err
		}
		if stats.Files <= 1 {
			return errImportState(j.Status, "an import needs at least one page")
		}
		if err := dropPageFromEditedDraft(ctx, q, j, page); err != nil {
			return err
		}
		if err := q.DeleteImportPage(ctx, sqlc.DeleteImportPageParams{TenantID: p.TenantID, ID: pageID}); err != nil {
			return err
		}
		if err := jobs.Finalize(ctx, q, p.TenantID, jobID); err != nil {
			return err
		}
		out, err = loadImport(ctx, q, p.TenantID, jobID)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

func prepareUpload(h *multipart.FileHeader) (preparedUpload, *APIError) {
	name := h.Filename
	if h.Size > maxImportFileBytes {
		return preparedUpload{}, errValidation(fmt.Sprintf("%s is larger than 15 MB", name))
	}
	f, err := h.Open()
	if err != nil {
		return preparedUpload{}, errBadRequest("invalid_upload", "could not read "+name)
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxImportFileBytes+1))
	if err != nil || len(data) > maxImportFileBytes {
		return preparedUpload{}, errBadRequest("invalid_upload", "could not read "+name)
	}
	prep, err := ocr.Prepare(data)
	if err != nil {
		if errors.Is(err, ocr.ErrUnsupported) {
			return preparedUpload{}, &APIError{Status: http.StatusUnsupportedMediaType, Code: "unsupported_file",
				Message: name + ": upload JPEG, PNG, WebP or PDF (HEIC photos: let the phone convert them, or export as JPEG)"}
		}
		return preparedUpload{}, errValidation(name + ": " + err.Error())
	}
	if len(name) > 255 {
		name = name[:255]
	}
	return preparedUpload{filename: name, Prepared: prep}, nil
}

// GET /v1/venues/{venueID}/imports
func (s *Server) handleListImports(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	venueID, err := urlID(r, "venueID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	resp := struct {
		Items       []importJobDTO `json:"items"`
		ImportLimit int32          `json:"import_limit"`
		ImportsUsed int64          `json:"imports_used"`
	}{Items: []importJobDTO{}}
	err = s.tx(r, func(q *sqlc.Queries) error {
		v, err := q.GetVenue(r.Context(), sqlc.GetVenueParams{TenantID: p.TenantID, ID: venueID})
		if err != nil {
			return err
		}
		resp.ImportLimit = v.OcrImportLimit
		if resp.ImportsUsed, err = q.CountVenueImports(r.Context(), sqlc.CountVenueImportsParams{TenantID: p.TenantID, VenueID: venueID}); err != nil {
			return err
		}
		list, err := q.ListVenueImportJobs(r.Context(), sqlc.ListVenueImportJobsParams{TenantID: p.TenantID, VenueID: venueID})
		for _, j := range list {
			resp.Items = append(resp.Items, toImportJobDTO(j))
		}
		return err
	})
	writeResult(w, r, http.StatusOK, resp, err)
}

// GET /v1/imports/{importID}
func (s *Server) handleGetImport(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "importID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var out importJobDTO
	err = s.tx(r, func(q *sqlc.Queries) (err error) {
		out, err = loadImport(r.Context(), q, p.TenantID, id)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// GET /v1/imports/{importID}/pages/{pageID}/file serves the stored upload
// for the review screen (original on the left).
func (s *Server) handleGetImportFile(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	if s.store == nil {
		writeError(w, r, errImportsDisabled)
		return
	}
	jobID, err := urlID(r, "importID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	pageID, err := urlID(r, "pageID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var f sqlc.MediaFile
	err = s.tx(r, func(q *sqlc.Queries) error {
		page, err := q.GetImportPage(r.Context(), sqlc.GetImportPageParams{TenantID: p.TenantID, ID: pageID})
		if err != nil {
			return err
		}
		if page.JobID != jobID {
			return errNotFound
		}
		f, err = q.GetMediaFile(r.Context(), sqlc.GetMediaFileParams{TenantID: p.TenantID, ID: page.MediaFileID})
		return err
	})
	if err != nil {
		writeError(w, r, notFoundAs(err))
		return
	}
	data, err := s.store.Get(r.Context(), f.StorageKey)
	if errors.Is(err, storage.ErrNotFound) {
		err = errNotFound
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", f.Mime)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(data)
}

// PUT /v1/imports/{importID}/draft replaces the draft with the user's
// corrections. Allowed only while the import waits for review.
func (s *Server) handleUpdateImportDraft(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "importID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var d ocr.Draft
	if err := decodeJSON(w, r, &d); err != nil {
		writeError(w, r, err)
		return
	}
	normalizeDraft(&d)
	b, _ := json.Marshal(d)
	var out importJobDTO
	err = s.tx(r, func(q *sqlc.Queries) error {
		j, err := q.GetImportJobForUpdate(r.Context(), sqlc.GetImportJobForUpdateParams{TenantID: p.TenantID, ID: id})
		if err != nil {
			return err
		}
		if j.Status != "ready_for_review" {
			return errImportState(j.Status, "the draft can be edited only when the import is ready_for_review")
		}
		if err := q.UpdateImportDraft(r.Context(), sqlc.UpdateImportDraftParams{TenantID: p.TenantID, ID: id, Draft: b}); err != nil {
			return err
		}
		out, err = loadImport(r.Context(), q, p.TenantID, id)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

func errImportState(status, msg string) *APIError {
	return &APIError{Status: http.StatusConflict, Code: "invalid_import_state", Message: msg + " (status is " + status + ")"}
}

// normalizeDraft trims names and replaces nil slices so the stored draft
// always has the same shape.
func normalizeDraft(d *ocr.Draft) {
	d.Currency = strings.ToUpper(strings.TrimSpace(d.Currency))
	if d.Categories == nil {
		d.Categories = []ocr.DraftCategory{}
	}
	for ci := range d.Categories {
		c := &d.Categories[ci]
		c.Name, c.Description = strings.TrimSpace(c.Name), strings.TrimSpace(c.Description)
		if c.Items == nil {
			c.Items = []ocr.DraftItem{}
		}
		for ii := range c.Items {
			it := &c.Items[ii]
			it.Name, it.Description = strings.TrimSpace(it.Name), strings.TrimSpace(it.Description)
			if it.Variants == nil {
				it.Variants = []ocr.DraftVariant{}
			}
			if it.Uncertain == nil {
				it.Uncertain = []string{}
			}
			for vi := range it.Variants {
				it.Variants[vi].Label = strings.TrimSpace(it.Variants[vi].Label)
			}
		}
	}
}

// POST /v1/imports/{importID}/pages/{pageID}/retry re-reads a failed page.
func (s *Server) handleRetryImportPage(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	if s.jobs == nil {
		writeError(w, r, errImportsDisabled)
		return
	}
	jobID, err := urlID(r, "importID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	pageID, err := urlID(r, "pageID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var out importJobDTO
	err = s.db.TxRaw(r.Context(), p.Scope(), func(tx pgx.Tx, q *sqlc.Queries) error {
		ctx := r.Context()
		j, err := q.GetImportJobForUpdate(ctx, sqlc.GetImportJobForUpdateParams{TenantID: p.TenantID, ID: jobID})
		if err != nil {
			return err
		}
		page, err := q.GetImportPageForUpdate(ctx, sqlc.GetImportPageForUpdateParams{TenantID: p.TenantID, ID: pageID})
		if err != nil {
			return err
		}
		if page.JobID != jobID {
			return errNotFound
		}
		if j.Status == "committed" {
			return errImportState(j.Status, "a committed import cannot be retried")
		}
		if page.Status != "failed" {
			return errImportState(page.Status, "only failed pages can be retried")
		}
		if j.Status == "failed" {
			// A failed import does not count against the limit; retrying
			// brings it back, so it has to fit again.
			limit, err := q.LockVenueImportLimit(ctx, sqlc.LockVenueImportLimitParams{TenantID: p.TenantID, ID: j.VenueID})
			if err != nil {
				return err
			}
			used, err := q.CountVenueImports(ctx, sqlc.CountVenueImportsParams{TenantID: p.TenantID, VenueID: j.VenueID})
			if err != nil {
				return err
			}
			if used >= int64(limit) {
				return errImportLimit(limit)
			}
		}
		if err := q.RequeueImportPage(ctx, sqlc.RequeueImportPageParams{TenantID: p.TenantID, ID: pageID}); err != nil {
			return err
		}
		if err := q.ReopenImportJob(ctx, sqlc.ReopenImportJobParams{TenantID: p.TenantID, ID: jobID}); err != nil {
			return err
		}
		if err := s.jobs.EnqueueTx(ctx, tx, jobs.ExtractPageArgs{TenantID: p.TenantID, JobID: jobID, PageID: pageID}); err != nil {
			return err
		}
		out, err = loadImport(ctx, q, p.TenantID, jobID)
		return err
	})
	writeResult(w, r, http.StatusAccepted, out, err)
}

// POST /v1/imports/{importID}/commit turns the draft into menu content:
// into an existing menu of the venue ({"menu_id"}), whose categories with
// the same name are extended, or a new menu ({"menu_name"}).
func (s *Server) handleCommitImport(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "importID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in struct {
		MenuID   *uuid.UUID `json:"menu_id"`
		MenuName *string    `json:"menu_name"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if (in.MenuID == nil) == (in.MenuName == nil) {
		writeError(w, r, errValidation("give exactly one of menu_id or menu_name"))
		return
	}
	if in.MenuName != nil {
		if apiErr := requireName(in.MenuName, "menu_name"); apiErr != nil {
			writeError(w, r, apiErr)
			return
		}
	}

	var out struct {
		Import importJobDTO `json:"import"`
		MenuID uuid.UUID    `json:"menu_id"`
		Items  int          `json:"items_created"`
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		j, err := q.GetImportJobForUpdate(ctx, sqlc.GetImportJobForUpdateParams{TenantID: p.TenantID, ID: id})
		if err != nil {
			return err
		}
		if j.Status != "ready_for_review" {
			return errImportState(j.Status, "only an import that is ready_for_review can be committed")
		}
		var d ocr.Draft
		if err := json.Unmarshal(j.Draft, &d); err != nil {
			return fmt.Errorf("decode draft: %w", err)
		}
		if problems := ocr.Validate(d); len(problems) > 0 {
			return &APIError{Status: http.StatusUnprocessableEntity, Code: "draft_invalid",
				Message: "fix the draft first: " + strings.Join(problems, "; ")}
		}

		var menu sqlc.Menu
		if in.MenuID != nil {
			menu, err = q.GetMenu(ctx, sqlc.GetMenuParams{TenantID: p.TenantID, ID: *in.MenuID})
			if db.IsNotFound(err) || (err == nil && menu.VenueID != j.VenueID) {
				return errValidation("menu_id is not a menu of this venue")
			}
		} else {
			menu, err = q.CreateMenu(ctx, sqlc.CreateMenuParams{
				ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, VenueID: j.VenueID, Name: *in.MenuName,
			})
		}
		if err != nil {
			return err
		}
		if out.Items, err = commitDraft(ctx, q, p.TenantID, menu.ID, d); err != nil {
			return err
		}
		if err := q.CommitImportJob(ctx, sqlc.CommitImportJobParams{TenantID: p.TenantID, ID: id, CommittedMenuID: &menu.ID}); err != nil {
			return err
		}
		out.MenuID = menu.ID
		out.Import, err = loadImport(ctx, q, p.TenantID, id)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

func commitDraft(ctx context.Context, q *sqlc.Queries, tenantID, menuID uuid.UUID, d ocr.Draft) (int, error) {
	items := 0
	for _, c := range d.Categories {
		cat, err := q.GetMenuCategoryByName(ctx, sqlc.GetMenuCategoryByNameParams{TenantID: tenantID, MenuID: menuID, Lower: c.Name})
		if db.IsNotFound(err) {
			cat, err = q.CreateCategory(ctx, sqlc.CreateCategoryParams{
				ID: uuid.Must(uuid.NewV7()), TenantID: tenantID, MenuID: menuID,
				Name: c.Name, Description: c.Description, Translations: json.RawMessage(`{}`), IsVisible: true,
			})
		}
		if err != nil {
			return 0, err
		}
		for _, it := range c.Items {
			item, err := q.CreateItem(ctx, sqlc.CreateItemParams{
				ID: uuid.Must(uuid.NewV7()), TenantID: tenantID, CategoryID: cat.ID,
				Name: it.Name, Description: it.Description, Translations: json.RawMessage(`{}`),
				Tags: []string{}, Allergens: []string{}, IsAvailable: true, IsVisible: true,
			})
			if err != nil {
				return 0, err
			}
			for _, v := range it.Variants {
				if _, err := q.CreateVariant(ctx, sqlc.CreateVariantParams{
					ID: uuid.Must(uuid.NewV7()), TenantID: tenantID, ItemID: item.ID,
					Label: v.Label, Translations: json.RawMessage(`{}`), PriceMinor: *v.PriceMinor,
				}); err != nil {
					return 0, err
				}
			}
			items++
		}
	}
	return items, nil
}
