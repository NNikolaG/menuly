package httpapi

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
	"github.com/nnikolag/menuly/backend/internal/images"
	"github.com/nnikolag/menuly/backend/internal/storage"
)

const maxImageBytes = 10 << 20

// POST /v1/media/images (multipart: file, purpose=item|logo|cover|promotion)
//
// Stores a scaled, re-encoded copy and returns its public URL, to be put in
// an item's image_url or a theme's logo_url/cover_url.
func (s *Server) handleUploadImage(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	if s.store == nil {
		writeError(w, r, errImportsDisabled)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes+1<<20)
	if err := r.ParseMultipartForm(16 << 20); err != nil {
		writeError(w, r, errBadRequest("invalid_upload", "expected multipart/form-data with a file of at most 10 MB"))
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck
	purpose := r.FormValue("purpose")
	if purpose == "" {
		purpose = "item"
	}
	if !images.ValidPurpose(purpose) {
		writeError(w, r, errValidation("purpose must be item, logo, cover or promotion"))
		return
	}
	f, h, err := r.FormFile("file")
	if err != nil {
		writeError(w, r, errValidation(`upload the image in the "file" field`))
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxImageBytes+1))
	if err != nil || len(data) > maxImageBytes {
		writeError(w, r, errValidation("the image must be at most 10 MB"))
		return
	}
	img, err := images.Process(data, purpose)
	if errors.Is(err, images.ErrUnsupported) {
		writeError(w, r, &APIError{Status: http.StatusUnsupportedMediaType, Code: "unsupported_file", Message: "upload a JPEG, PNG or WebP image"})
		return
	} else if err != nil {
		writeError(w, r, err)
		return
	}

	id := uuid.Must(uuid.NewV7())
	name := id.String() + "." + img.Ext
	key := mediaKey(p.TenantID, name)
	if err := s.store.Put(r.Context(), key, img.Data, img.MIME); err != nil {
		writeError(w, r, fmt.Errorf("store image: %w", err))
		return
	}
	filename := h.Filename
	if len(filename) > 255 {
		filename = filename[:255]
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		_, err := q.CreateImageFile(r.Context(), sqlc.CreateImageFileParams{
			ID: id, TenantID: p.TenantID, StorageKey: key, Mime: img.MIME, SizeBytes: int64(len(img.Data)),
			Filename: filename, CreatedBy: &p.UserID, Purpose: purpose,
		})
		return err
	})
	writeResult(w, r, http.StatusCreated, map[string]any{
		"id": id, "url": s.apiURL + "/v1/public/media/" + p.TenantID.String() + "/" + name,
		"mime": img.MIME, "width": img.Width, "height": img.Height, "size_bytes": len(img.Data),
	}, err)
}

func mediaKey(tenantID uuid.UUID, name string) string {
	return "tenants/" + tenantID.String() + "/media/" + name
}

var mediaNameRe = regexp.MustCompile(`^[0-9a-f-]{36}\.(jpg|png)$`)

// GET /v1/public/media/{tenantID}/{name}: no auth; names are random and
// files never change, so they are cached for a year.
func (s *Server) handlePublicMedia(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		writeError(w, r, errNotFound)
		return
	}
	tenantID, err := uuid.Parse(chi.URLParam(r, "tenantID"))
	name := chi.URLParam(r, "name")
	if err != nil || !mediaNameRe.MatchString(name) {
		writeError(w, r, errNotFound)
		return
	}
	if _, err := uuid.Parse(strings.TrimSuffix(strings.TrimSuffix(name, ".jpg"), ".png")); err != nil {
		writeError(w, r, errNotFound)
		return
	}
	data, err := s.store.Get(r.Context(), mediaKey(tenantID, name))
	if errors.Is(err, storage.ErrNotFound) {
		writeError(w, r, errNotFound)
		return
	} else if err != nil {
		writeError(w, r, err)
		return
	}
	ct := "image/jpeg"
	if strings.HasSuffix(name, ".png") {
		ct = "image/png"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

// POST /v1/public/menus/{tenantSlug}/{venueSlug}/views: the guest app calls
// it once per visit (not on every refresh) to count menu opens.
func (s *Server) handlePublicMenuView(w http.ResponseWriter, r *http.Request) {
	tenantSlug := strings.ToLower(chi.URLParam(r, "tenantSlug"))
	venueSlug := strings.ToLower(chi.URLParam(r, "venueSlug"))
	err := s.db.PublicWriteTx(r.Context(), tenantSlug, func(q *sqlc.Queries, t sqlc.GetPublicTenantBySlugRow) error {
		v, err := q.GetVenueBySlug(r.Context(), sqlc.GetVenueBySlugParams{TenantID: t.ID, Slug: venueSlug})
		if err != nil {
			return err
		}
		loc, err := time.LoadLocation(v.Timezone)
		if err != nil {
			loc = time.UTC
		}
		return q.CountMenuView(r.Context(), sqlc.CountMenuViewParams{TenantID: t.ID, VenueID: v.ID, Day: dateOf(time.Now().In(loc))})
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}

// GET /v1/venues/{venueID}/stats?days=30: menu opens per day in the venue's
// time zone, with zero days filled in.
func (s *Server) handleVenueStats(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	venueID, err := urlID(r, "venueID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	days := 30
	if v := r.URL.Query().Get("days"); v != "" {
		if days, err = strconv.Atoi(v); err != nil || days < 1 || days > 365 {
			writeError(w, r, errValidation("days must be between 1 and 365"))
			return
		}
	}
	type dayViews struct {
		Date  string `json:"date"`
		Views int64  `json:"views"`
	}
	var out struct {
		Days  []dayViews `json:"days"`
		Total int64      `json:"total"`
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		v, err := q.GetVenue(r.Context(), sqlc.GetVenueParams{TenantID: p.TenantID, ID: venueID})
		if err != nil {
			return err
		}
		loc, err := time.LoadLocation(v.Timezone)
		if err != nil {
			loc = time.UTC
		}
		today := time.Now().In(loc)
		since := today.AddDate(0, 0, -(days - 1))
		rows, err := q.ListVenueViews(r.Context(), sqlc.ListVenueViewsParams{TenantID: p.TenantID, VenueID: venueID, Since: dateOf(since)})
		if err != nil {
			return err
		}
		byDay := map[string]int64{}
		for _, row := range rows {
			byDay[row.Day.Time.Format(time.DateOnly)] = row.Views
		}
		for d := since; !d.After(today); d = d.AddDate(0, 0, 1) {
			key := d.Format(time.DateOnly)
			out.Days = append(out.Days, dayViews{Date: key, Views: byDay[key]})
			out.Total += byDay[key]
		}
		return nil
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// dateOf is t's calendar date (in t's location) as a Postgres date.
func dateOf(t time.Time) pgtype.Date {
	y, m, d := t.Date()
	return pgtype.Date{Time: time.Date(y, m, d, 0, 0, 0, 0, time.UTC), Valid: true}
}
