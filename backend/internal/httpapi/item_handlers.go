package httpapi

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

var (
	itemTranslationFields    = []string{"name", "description"}
	variantTranslationFields = []string{"label"}
)

const maxVariants = 20

type itemInput struct {
	CategoryID   *uuid.UUID       `json:"category_id"`
	Name         *string          `json:"name"`
	Description  *string          `json:"description"`
	Translations *json.RawMessage `json:"translations"`
	ImageURL     *string          `json:"image_url"`
	Tags         []string         `json:"tags"`
	Allergens    []string         `json:"allergens"`
	IsAvailable  *bool            `json:"is_available"`
	IsVisible    *bool            `json:"is_visible"`
}

func (in *itemInput) normalize() (tr []byte, apiErr *APIError) {
	if apiErr = requireName(in.Name, "name"); apiErr != nil {
		return nil, apiErr
	}
	trimPtr(in.Description)
	trimPtr(in.ImageURL)
	if in.ImageURL != nil && *in.ImageURL != "" {
		if u, err := url.Parse(*in.ImageURL); err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			return nil, errValidation("image_url must be an http(s) URL")
		}
	}
	if in.Tags, apiErr = normalizeLabels(in.Tags, "tags"); apiErr != nil {
		return nil, apiErr
	}
	if in.Allergens, apiErr = normalizeLabels(in.Allergens, "allergens"); apiErr != nil {
		return nil, apiErr
	}
	return normalizeTranslations(in.Translations, itemTranslationFields...)
}

type variantInput struct {
	Label        *string          `json:"label"`
	Translations *json.RawMessage `json:"translations"`
	PriceMinor   *int64           `json:"price_minor"`
}

func (in *variantInput) normalize() ([]byte, *APIError) {
	trimPtr(in.Label)
	if in.Label != nil && len(*in.Label) > 100 {
		return nil, errValidation("label must be at most 100 characters")
	}
	if in.PriceMinor != nil && *in.PriceMinor < 0 {
		return nil, errValidation("price_minor must not be negative")
	}
	return normalizeTranslations(in.Translations, variantTranslationFields...)
}

func (s *Server) createVariant(r *http.Request, q *sqlc.Queries, tenantID, itemID uuid.UUID, in variantInput, tr []byte) (sqlc.ItemVariant, error) {
	if tr == nil {
		tr = []byte(`{}`)
	}
	return q.CreateVariant(r.Context(), sqlc.CreateVariantParams{
		ID: uuid.Must(uuid.NewV7()), TenantID: tenantID, ItemID: itemID,
		Label: strOr(in.Label, ""), Translations: tr, PriceMinor: *in.PriceMinor,
	})
}

// POST /v1/categories/{categoryID}/items
//
// Either "price_minor" (single price) or "variants" (sizes) is required.
func (s *Server) handleCreateItem(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	categoryID, err := urlID(r, "categoryID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in struct {
		itemInput
		PriceMinor *int64         `json:"price_minor"`
		Variants   []variantInput `json:"variants"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if in.Name == nil {
		writeError(w, r, errValidation("name is required"))
		return
	}
	if in.CategoryID != nil {
		writeError(w, r, errValidation("category_id is taken from the URL"))
		return
	}
	tr, apiErr := in.itemInput.normalize()
	if apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	switch {
	case in.PriceMinor != nil && len(in.Variants) > 0:
		writeError(w, r, errValidation("send either price_minor or variants, not both"))
		return
	case in.PriceMinor != nil:
		in.Variants = []variantInput{{PriceMinor: in.PriceMinor}}
	case len(in.Variants) == 0:
		writeError(w, r, errValidation("price_minor or at least one variant is required"))
		return
	case len(in.Variants) > maxVariants:
		writeError(w, r, errValidation("at most 20 variants"))
		return
	}
	variantTr := make([][]byte, len(in.Variants))
	for i := range in.Variants {
		if in.Variants[i].PriceMinor == nil {
			writeError(w, r, errValidation("every variant needs price_minor"))
			return
		}
		if variantTr[i], apiErr = in.Variants[i].normalize(); apiErr != nil {
			writeError(w, r, apiErr)
			return
		}
	}
	if tr == nil {
		tr = []byte(`{}`)
	}
	orEmpty := func(s []string) []string {
		if s == nil {
			return []string{}
		}
		return s
	}

	var out itemDTO
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		if _, err := q.GetCategory(ctx, sqlc.GetCategoryParams{TenantID: p.TenantID, ID: categoryID}); err != nil {
			return err
		}
		it, err := q.CreateItem(ctx, sqlc.CreateItemParams{
			ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, CategoryID: categoryID,
			Name: *in.Name, Description: strOr(in.Description, ""), Translations: tr,
			ImageUrl: strOr(in.ImageURL, ""), Tags: orEmpty(in.Tags), Allergens: orEmpty(in.Allergens),
			IsAvailable: in.IsAvailable == nil || *in.IsAvailable,
			IsVisible:   in.IsVisible == nil || *in.IsVisible,
		})
		if err != nil {
			return err
		}
		out = itemDTO{MenuItem: it, Variants: make([]sqlc.ItemVariant, 0, len(in.Variants))}
		for i, v := range in.Variants {
			created, err := s.createVariant(r, q, p.TenantID, it.ID, v, variantTr[i])
			if err != nil {
				return err
			}
			out.Variants = append(out.Variants, created)
		}
		return nil
	})
	writeResult(w, r, http.StatusCreated, out, err)
}

func loadItem(r *http.Request, q *sqlc.Queries, tenantID, id uuid.UUID) (itemDTO, error) {
	it, err := q.GetItem(r.Context(), sqlc.GetItemParams{TenantID: tenantID, ID: id})
	if err != nil {
		return itemDTO{}, err
	}
	vs, err := q.ListItemVariants(r.Context(), sqlc.ListItemVariantsParams{TenantID: tenantID, ItemID: id})
	return itemDTO{MenuItem: it, Variants: vs}, err
}

// GET /v1/items/{itemID}
func (s *Server) handleGetItem(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "itemID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var out itemDTO
	err = s.tx(r, func(q *sqlc.Queries) (err error) {
		out, err = loadItem(r, q, p.TenantID, id)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// PATCH /v1/items/{itemID}. Setting category_id moves the item to the end of
// another category of the same menu.
func (s *Server) handleUpdateItem(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "itemID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in itemInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	tr, apiErr := in.normalize()
	if apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	var out itemDTO
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		cur, err := q.GetItem(ctx, sqlc.GetItemParams{TenantID: p.TenantID, ID: id})
		if err != nil {
			return err
		}
		params := sqlc.UpdateItemParams{
			TenantID: p.TenantID, ID: id,
			Name: in.Name, Description: in.Description, Translations: tr, ImageUrl: in.ImageURL,
			Tags: in.Tags, Allergens: in.Allergens, IsAvailable: in.IsAvailable, IsVisible: in.IsVisible,
		}
		if in.CategoryID != nil && *in.CategoryID != cur.CategoryID {
			target, err := q.GetCategory(ctx, sqlc.GetCategoryParams{TenantID: p.TenantID, ID: *in.CategoryID})
			if err != nil {
				return notFoundAs(err)
			}
			menuID, err := q.GetItemMenuID(ctx, sqlc.GetItemMenuIDParams{TenantID: p.TenantID, ID: id})
			if err != nil {
				return err
			}
			if target.MenuID != menuID {
				return errValidation("category_id must belong to the same menu")
			}
			pos, err := q.NextItemPosition(ctx, sqlc.NextItemPositionParams{TenantID: p.TenantID, CategoryID: target.ID})
			if err != nil {
				return err
			}
			params.CategoryID, params.Position = &target.ID, &pos
		}
		if _, err := q.UpdateItem(ctx, params); err != nil {
			return err
		}
		out, err = loadItem(r, q, p.TenantID, id)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// PATCH /v1/items/{itemID}/status: quick toggles, allowed for staff too.
func (s *Server) handleUpdateItemStatus(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "itemID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in struct {
		IsAvailable *bool `json:"is_available"`
		IsVisible   *bool `json:"is_visible"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if in.IsAvailable == nil && in.IsVisible == nil {
		writeError(w, r, errValidation("send is_available and/or is_visible"))
		return
	}
	var it sqlc.MenuItem
	err = s.tx(r, func(q *sqlc.Queries) (err error) {
		it, err = q.UpdateItemStatus(r.Context(), sqlc.UpdateItemStatusParams{
			TenantID: p.TenantID, ID: id, IsAvailable: in.IsAvailable, IsVisible: in.IsVisible,
		})
		return err
	})
	writeResult(w, r, http.StatusOK, it, err)
}

// DELETE /v1/items/{itemID}
func (s *Server) handleDeleteItem(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "itemID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		n, err := q.DeleteItem(r.Context(), sqlc.DeleteItemParams{TenantID: p.TenantID, ID: id})
		if err == nil && n == 0 {
			return errNotFound
		}
		return err
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}

// PUT /v1/categories/{categoryID}/items/order
func (s *Server) handleReorderItems(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	categoryID, err := urlID(r, "categoryID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in orderInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		if _, err := q.GetCategory(ctx, sqlc.GetCategoryParams{TenantID: p.TenantID, ID: categoryID}); err != nil {
			return err
		}
		count, err := q.CountCategoryItems(ctx, sqlc.CountCategoryItemsParams{TenantID: p.TenantID, CategoryID: categoryID})
		if err != nil {
			return err
		}
		if apiErr := in.validate(count); apiErr != nil {
			return apiErr
		}
		n, err := q.ReorderItems(ctx, sqlc.ReorderItemsParams{TenantID: p.TenantID, CategoryID: categoryID, Ids: in.IDs})
		if err == nil && n != count {
			return errBadOrder
		}
		return err
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}

// Variants ---------------------------------------------------------------------------

// POST /v1/items/{itemID}/variants
func (s *Server) handleCreateVariant(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	itemID, err := urlID(r, "itemID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in variantInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if in.PriceMinor == nil {
		writeError(w, r, errValidation("price_minor is required"))
		return
	}
	tr, apiErr := in.normalize()
	if apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	var v sqlc.ItemVariant
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		if _, err := q.GetItem(ctx, sqlc.GetItemParams{TenantID: p.TenantID, ID: itemID}); err != nil {
			return err
		}
		n, err := q.CountItemVariants(ctx, sqlc.CountItemVariantsParams{TenantID: p.TenantID, ItemID: itemID})
		if err != nil {
			return err
		}
		if n >= maxVariants {
			return errValidation("at most 20 variants")
		}
		v, err = s.createVariant(r, q, p.TenantID, itemID, in, tr)
		return err
	})
	writeResult(w, r, http.StatusCreated, v, err)
}

// PATCH /v1/variants/{variantID}. A price change is written to the history.
func (s *Server) handleUpdateVariant(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "variantID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in variantInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	tr, apiErr := in.normalize()
	if apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	var v sqlc.ItemVariant
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		cur, err := q.GetVariantForUpdate(ctx, sqlc.GetVariantForUpdateParams{TenantID: p.TenantID, ID: id})
		if err != nil {
			return err
		}
		if v, err = q.UpdateVariant(ctx, sqlc.UpdateVariantParams{
			TenantID: p.TenantID, ID: id, Label: in.Label, Translations: tr, PriceMinor: in.PriceMinor,
		}); err != nil {
			return err
		}
		if v.PriceMinor != cur.PriceMinor {
			return recordPriceChange(r, q, p, id, cur.PriceMinor, v.PriceMinor)
		}
		return nil
	})
	writeResult(w, r, http.StatusOK, v, err)
}

// DELETE /v1/variants/{variantID}. The last variant of an item cannot be
// deleted; delete the item instead.
func (s *Server) handleDeleteVariant(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "variantID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		cur, err := q.GetVariantForUpdate(ctx, sqlc.GetVariantForUpdateParams{TenantID: p.TenantID, ID: id})
		if err != nil {
			return err
		}
		n, err := q.CountItemVariants(ctx, sqlc.CountItemVariantsParams{TenantID: p.TenantID, ItemID: cur.ItemID})
		if err != nil {
			return err
		}
		if n <= 1 {
			return &APIError{Status: http.StatusConflict, Code: "last_variant", Message: "an item needs at least one price; delete the item instead"}
		}
		_, err = q.DeleteVariant(ctx, sqlc.DeleteVariantParams{TenantID: p.TenantID, ID: id})
		return err
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}
