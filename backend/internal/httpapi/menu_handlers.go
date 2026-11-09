package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

// Response shapes ------------------------------------------------------------------

type itemDTO struct {
	sqlc.MenuItem
	Variants []sqlc.ItemVariant `json:"variants"`
}

type categoryDTO struct {
	sqlc.Category
	Items []itemDTO `json:"items"`
}

type menuTreeDTO struct {
	sqlc.Menu
	Categories []categoryDTO `json:"categories"`
}

// loadMenuTree returns a menu with categories, items and variants, each level
// ordered by position.
func loadMenuTree(r *http.Request, q *sqlc.Queries, tenantID, menuID uuid.UUID) (menuTreeDTO, error) {
	ctx := r.Context()
	m, err := q.GetMenu(ctx, sqlc.GetMenuParams{TenantID: tenantID, ID: menuID})
	if err != nil {
		return menuTreeDTO{}, err
	}
	cats, err := q.ListMenuCategories(ctx, sqlc.ListMenuCategoriesParams{TenantID: tenantID, MenuID: menuID})
	if err != nil {
		return menuTreeDTO{}, err
	}
	items, err := q.ListMenuItems(ctx, sqlc.ListMenuItemsParams{TenantID: tenantID, MenuID: menuID})
	if err != nil {
		return menuTreeDTO{}, err
	}
	variants, err := q.ListMenuVariants(ctx, sqlc.ListMenuVariantsParams{TenantID: tenantID, MenuID: menuID})
	if err != nil {
		return menuTreeDTO{}, err
	}

	byItem := map[uuid.UUID][]sqlc.ItemVariant{}
	for _, v := range variants {
		byItem[v.ItemID] = append(byItem[v.ItemID], v)
	}
	byCat := map[uuid.UUID][]itemDTO{}
	for _, it := range items {
		vs := byItem[it.ID]
		if vs == nil {
			vs = []sqlc.ItemVariant{}
		}
		byCat[it.CategoryID] = append(byCat[it.CategoryID], itemDTO{MenuItem: it, Variants: vs})
	}
	out := menuTreeDTO{Menu: m, Categories: make([]categoryDTO, 0, len(cats))}
	for _, c := range cats {
		its := byCat[c.ID]
		if its == nil {
			its = []itemDTO{}
		}
		out.Categories = append(out.Categories, categoryDTO{Category: c, Items: its})
	}
	return out, nil
}

// Menus ------------------------------------------------------------------------------

// GET /v1/venues/{venueID}/menus
func (s *Server) handleListMenus(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	venueID, err := urlID(r, "venueID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var menus []sqlc.Menu
	err = s.tx(r, func(q *sqlc.Queries) error {
		if _, err := q.GetVenue(r.Context(), sqlc.GetVenueParams{TenantID: p.TenantID, ID: venueID}); err != nil {
			return err
		}
		menus, err = q.ListVenueMenus(r.Context(), sqlc.ListVenueMenusParams{TenantID: p.TenantID, VenueID: venueID})
		return err
	})
	writeResult(w, r, http.StatusOK, map[string]any{"items": menus}, err)
}

// POST /v1/venues/{venueID}/menus
func (s *Server) handleCreateMenu(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	venueID, err := urlID(r, "venueID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in struct {
		Name *string `json:"name"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if in.Name == nil {
		writeError(w, r, errValidation("name is required"))
		return
	}
	if apiErr := requireName(in.Name, "name"); apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	var m sqlc.Menu
	err = s.tx(r, func(q *sqlc.Queries) error {
		if _, err := q.GetVenue(r.Context(), sqlc.GetVenueParams{TenantID: p.TenantID, ID: venueID}); err != nil {
			return err
		}
		m, err = q.CreateMenu(r.Context(), sqlc.CreateMenuParams{
			ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, VenueID: venueID, Name: *in.Name,
		})
		return err
	})
	writeResult(w, r, http.StatusCreated, m, err)
}

// GET /v1/menus/{menuID} returns the full tree.
func (s *Server) handleGetMenu(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	menuID, err := urlID(r, "menuID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var tree menuTreeDTO
	err = s.tx(r, func(q *sqlc.Queries) (err error) {
		tree, err = loadMenuTree(r, q, p.TenantID, menuID)
		return err
	})
	writeResult(w, r, http.StatusOK, tree, err)
}

// PATCH /v1/menus/{menuID} renames the menu and/or replaces its languages.
func (s *Server) handleUpdateMenu(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	menuID, err := urlID(r, "menuID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in struct {
		Name      *string          `json:"name"`
		Languages *json.RawMessage `json:"languages"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if in.Name == nil && in.Languages == nil {
		writeError(w, r, errValidation("name or languages is required"))
		return
	}
	if in.Name != nil {
		if apiErr := requireName(in.Name, "name"); apiErr != nil {
			writeError(w, r, apiErr)
			return
		}
	}
	langs, apiErr := normalizeLanguages(in.Languages)
	if apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	var m sqlc.Menu
	err = s.tx(r, func(q *sqlc.Queries) (err error) {
		m, err = q.UpdateMenu(r.Context(), sqlc.UpdateMenuParams{TenantID: p.TenantID, ID: menuID, Name: in.Name, Languages: langs})
		return err
	})
	writeResult(w, r, http.StatusOK, m, err)
}

// DELETE /v1/menus/{menuID}
func (s *Server) handleDeleteMenu(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	menuID, err := urlID(r, "menuID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		n, err := q.DeleteMenu(r.Context(), sqlc.DeleteMenuParams{TenantID: p.TenantID, ID: menuID})
		if err == nil && n == 0 {
			return errNotFound
		}
		return err
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}

// POST /v1/menus/{menuID}/publish makes this the venue's only published menu.
func (s *Server) handlePublishMenu(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	menuID, err := urlID(r, "menuID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var m sqlc.Menu
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		cur, err := q.GetMenu(ctx, sqlc.GetMenuParams{TenantID: p.TenantID, ID: menuID})
		if err != nil {
			return err
		}
		if err := q.UnpublishVenueMenus(ctx, sqlc.UnpublishVenueMenusParams{TenantID: p.TenantID, VenueID: cur.VenueID}); err != nil {
			return err
		}
		if m, err = q.PublishMenu(ctx, sqlc.PublishMenuParams{TenantID: p.TenantID, ID: menuID}); err != nil {
			return err
		}
		return q.SetVenueActiveMenu(ctx, sqlc.SetVenueActiveMenuParams{TenantID: p.TenantID, VenueID: cur.VenueID, MenuID: &menuID})
	})
	writeResult(w, r, http.StatusOK, m, err)
}

// POST /v1/menus/{menuID}/unpublish
func (s *Server) handleUnpublishMenu(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	menuID, err := urlID(r, "menuID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var m sqlc.Menu
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		cur, err := q.GetMenu(ctx, sqlc.GetMenuParams{TenantID: p.TenantID, ID: menuID})
		if err != nil {
			return err
		}
		if m, err = q.UnpublishMenu(ctx, sqlc.UnpublishMenuParams{TenantID: p.TenantID, ID: menuID}); err != nil {
			return err
		}
		if cur.Status == "published" {
			return q.SetVenueActiveMenu(ctx, sqlc.SetVenueActiveMenuParams{TenantID: p.TenantID, VenueID: cur.VenueID})
		}
		return nil
	})
	writeResult(w, r, http.StatusOK, m, err)
}
