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
	Filename  string    `json:"filename"`
	MIME      string    `json:"mime"`
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
	Draft           json.RawMessage `json:"draft,omitempty"`
	Pages           []importPageDTO `json:"pages,omitempty"`
}

func toImportJobDTO(j sqlc.ImportJob) importJobDTO {
	return importJobDTO{
		ID: j.ID, VenueID: j.VenueID, Status: j.Status, Error: j.Error, DraftEdited: j.DraftEdited,
		CommittedMenuID: j.CommittedMenuID, CreatedAt: j.CreatedAt, UpdatedAt: j.UpdatedAt, CommittedAt: j.CommittedAt,
	}
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
		dto.Pages = append(dto.Pages, importPageDTO{
			ID: p.ID, PageIndex: p.PageIndex, PageCount: p.PageCount, Status: p.Status,
			Attempts: p.Attempts, Error: p.Error, Filename: f.Filename, MIME: f.Mime,
		})
	}
	return dto, nil
}

func errImportLimit(limit int32) *APIError {
	return &APIError{Status: http.StatusConflict, Code: "import_limit_reached",
		Message: fmt.Sprintf("this venue has used all %d menu imports; edit the existing menu by hand", limit)}
}

type preparedUpload struct {
	filename string
	ocr.Prepared
}

// POST /v1/venues/{venueID}/imports (multipart, field "files", 1..n files)
func (s *Server) handleCreateImport(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	if s.store == nil || s.jobs == nil {
		writeError(w, r, errImportsDisabled)
		return
	}
	venueID, err := urlID(r, "venueID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	// Cheap checks first, before reading and decoding the upload.
	var limit int32
	err = s.tx(r, func(q *sqlc.Queries) error {
		v, err := q.GetVenue(r.Context(), sqlc.GetVenueParams{TenantID: p.TenantID, ID: venueID})
		if err != nil {
			return err
		}
		used, err := q.CountVenueImports(r.Context(), sqlc.CountVenueImportsParams{TenantID: p.TenantID, VenueID: venueID})
		if err != nil {
			return err
		}
		if used >= int64(v.OcrImportLimit) {
			return errImportLimit(v.OcrImportLimit)
		}
		limit = v.OcrImportLimit
		return nil
	})
	if err != nil {
		writeError(w, r, notFoundAs(err))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxImportBodyBytes)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, r, errBadRequest("invalid_upload", "expected multipart/form-data with files (at most 80 MB in total)"))
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck
	headers := r.MultipartForm.File["files"]
	if len(headers) == 0 {
		writeError(w, r, errValidation("upload at least one file in the \"files\" field"))
		return
	}
	if len(headers) > maxImportPages {
		writeError(w, r, errValidation(fmt.Sprintf("at most %d pages per import", maxImportPages)))
		return
	}
	uploads := make([]preparedUpload, 0, len(headers))
	pages := 0
	for _, h := range headers {
		up, apiErr := prepareUpload(h)
		if apiErr != nil {
			writeError(w, r, apiErr)
			return
		}
		pages += up.PageCount
		uploads = append(uploads, up)
	}
	if pages > maxImportPages {
		writeError(w, r, errValidation(fmt.Sprintf("the upload has %d pages; at most %d pages per import", pages, maxImportPages)))
		return
	}

	// Files go to storage before the transaction; if it fails they are
	// orphaned, which is harmless (keys are unique per job).
	jobID := uuid.Must(uuid.NewV7())
	keys := make([]string, len(uploads))
	for i, up := range uploads {
		keys[i] = fmt.Sprintf("tenants/%s/imports/%s/%d", p.TenantID, jobID, i)
		if err := s.store.Put(r.Context(), keys[i], up.Data, up.MIME); err != nil {
			writeError(w, r, fmt.Errorf("store upload: %w", err))
			return
		}
	}

	var out importJobDTO
	err = s.db.TxRaw(r.Context(), p.Scope(), func(tx pgx.Tx, q *sqlc.Queries) error {
		ctx := r.Context()
		// Re-check under the venue lock so parallel uploads cannot both pass.
		if limit, err = q.LockVenueImportLimit(ctx, sqlc.LockVenueImportLimitParams{TenantID: p.TenantID, ID: venueID}); err != nil {
			return err
		}
		used, err := q.CountVenueImports(ctx, sqlc.CountVenueImportsParams{TenantID: p.TenantID, VenueID: venueID})
		if err != nil {
			return err
		}
		if used >= int64(limit) {
			return errImportLimit(limit)
		}
		if _, err := q.CreateImportJob(ctx, sqlc.CreateImportJobParams{ID: jobID, TenantID: p.TenantID, VenueID: venueID, CreatedBy: &p.UserID}); err != nil {
			return err
		}
		for i, up := range uploads {
			f, err := q.CreateMediaFile(ctx, sqlc.CreateMediaFileParams{
				ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, StorageKey: keys[i], Mime: up.MIME,
				SizeBytes: int64(len(up.Data)), Filename: up.filename, CreatedBy: &p.UserID,
			})
			if err != nil {
				return err
			}
			page, err := q.CreateImportPage(ctx, sqlc.CreateImportPageParams{
				ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, JobID: jobID, MediaFileID: f.ID,
				PageIndex: int32(i), PageCount: int32(up.PageCount),
			})
			if err != nil {
				return err
			}
			if err := s.jobs.EnqueueTx(ctx, tx, jobs.ExtractPageArgs{TenantID: p.TenantID, JobID: jobID, PageID: page.ID}); err != nil {
				return err
			}
		}
		out, err = loadImport(ctx, q, p.TenantID, jobID)
		return err
	})
	writeResult(w, r, http.StatusAccepted, out, err)
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
				Message: name + ": upload JPEG, PNG, WebP or PDF"}
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
