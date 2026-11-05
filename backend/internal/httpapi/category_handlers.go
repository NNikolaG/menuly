package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

var categoryTranslationFields = []string{"name", "description"}

type categoryInput struct {
	Name         *string          `json:"name"`
	Description  *string          `json:"description"`
	Translations *json.RawMessage `json:"translations"`
	IsVisible    *bool            `json:"is_visible"`
}

func (in *categoryInput) normalize() ([]byte, *APIError) {
	if apiErr := requireName(in.Name, "name"); apiErr != nil {
		return nil, apiErr
	}
	trimPtr(in.Description)
	return normalizeTranslations(in.Translations, categoryTranslationFields...)
}

// POST /v1/menus/{menuID}/categories
func (s *Server) handleCreateCategory(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	menuID, err := urlID(r, "menuID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in categoryInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if in.Name == nil {
		writeError(w, r, errValidation("name is required"))
		return
	}
	tr, apiErr := in.normalize()
	if apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	if tr == nil {
		tr = []byte(`{}`)
	}
	visible := in.IsVisible == nil || *in.IsVisible
	var c sqlc.Category
	err = s.tx(r, func(q *sqlc.Queries) error {
		if _, err := q.GetMenu(r.Context(), sqlc.GetMenuParams{TenantID: p.TenantID, ID: menuID}); err != nil {
			return err
		}
		c, err = q.CreateCategory(r.Context(), sqlc.CreateCategoryParams{
			ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, MenuID: menuID,
			Name: *in.Name, Description: strOr(in.Description, ""), Translations: tr, IsVisible: visible,
		})
		return err
	})
	writeResult(w, r, http.StatusCreated, c, err)
}

// PATCH /v1/categories/{categoryID}
func (s *Server) handleUpdateCategory(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "categoryID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in categoryInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	tr, apiErr := in.normalize()
	if apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	var c sqlc.Category
	err = s.tx(r, func(q *sqlc.Queries) (err error) {
		c, err = q.UpdateCategory(r.Context(), sqlc.UpdateCategoryParams{
			TenantID: p.TenantID, ID: id,
			Name: in.Name, Description: in.Description, Translations: tr, IsVisible: in.IsVisible,
		})
		return err
	})
	writeResult(w, r, http.StatusOK, c, err)
}

// DELETE /v1/categories/{categoryID} also deletes its items.
func (s *Server) handleDeleteCategory(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "categoryID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		n, err := q.DeleteCategory(r.Context(), sqlc.DeleteCategoryParams{TenantID: p.TenantID, ID: id})
		if err == nil && n == 0 {
			return errNotFound
		}
		return err
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}

// PUT /v1/menus/{menuID}/categories/order
func (s *Server) handleReorderCategories(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	menuID, err := urlID(r, "menuID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in orderInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	var cats []sqlc.Category
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		if _, err := q.GetMenu(ctx, sqlc.GetMenuParams{TenantID: p.TenantID, ID: menuID}); err != nil {
			return err
		}
		count, err := q.CountMenuCategories(ctx, sqlc.CountMenuCategoriesParams{TenantID: p.TenantID, MenuID: menuID})
		if err != nil {
			return err
		}
		if apiErr := in.validate(count); apiErr != nil {
			return apiErr
		}
		n, err := q.ReorderCategories(ctx, sqlc.ReorderCategoriesParams{TenantID: p.TenantID, MenuID: menuID, Ids: in.IDs})
		if err != nil {
			return err
		}
		if n != count {
			return errBadOrder
		}
		cats, err = q.ListMenuCategories(ctx, sqlc.ListMenuCategoriesParams{TenantID: p.TenantID, MenuID: menuID})
		return err
	})
	writeResult(w, r, http.StatusOK, map[string]any{"items": cats}, err)
}
