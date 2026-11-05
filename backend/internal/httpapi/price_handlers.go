package httpapi

import (
	"math"
	"net/http"

	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

func recordPriceChange(r *http.Request, q *sqlc.Queries, p Principal, variantID uuid.UUID, oldPrice, newPrice int64) error {
	return q.CreatePriceChange(r.Context(), sqlc.CreatePriceChangeParams{
		ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, VariantID: variantID,
		OldPriceMinor: oldPrice, NewPriceMinor: newPrice, ChangedBy: &p.UserID,
	})
}

// adjustPrice applies a percentage or a fixed amount and rounds to the
// nearest multiple of roundTo (0 = no rounding). Never returns a negative price.
func adjustPrice(old int64, percent *float64, amount *int64, roundTo int64) int64 {
	var v float64
	if percent != nil {
		v = float64(old) * (100 + *percent) / 100
	} else {
		v = float64(old + *amount)
	}
	n := int64(math.Round(v))
	if roundTo > 1 {
		n = int64(math.Round(float64(n)/float64(roundTo))) * roundTo
	}
	return max(n, 0)
}

// POST /v1/menus/{menuID}/price-adjustments changes every price in the menu,
// or in one category, by a percentage or a fixed amount.
func (s *Server) handlePriceAdjustment(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	menuID, err := urlID(r, "menuID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in struct {
		CategoryID   *uuid.UUID `json:"category_id"`
		Percent      *float64   `json:"percent"`
		AmountMinor  *int64     `json:"amount_minor"`
		RoundToMinor int64      `json:"round_to_minor"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	switch {
	case (in.Percent == nil) == (in.AmountMinor == nil):
		writeError(w, r, errValidation("send exactly one of percent or amount_minor"))
		return
	case in.Percent != nil && (*in.Percent < -90 || *in.Percent > 500):
		writeError(w, r, errValidation("percent must be between -90 and 500"))
		return
	case in.RoundToMinor < 0:
		writeError(w, r, errValidation("round_to_minor must not be negative"))
		return
	}
	var updated int
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		if _, err := q.GetMenu(ctx, sqlc.GetMenuParams{TenantID: p.TenantID, ID: menuID}); err != nil {
			return err
		}
		if in.CategoryID != nil {
			c, err := q.GetCategory(ctx, sqlc.GetCategoryParams{TenantID: p.TenantID, ID: *in.CategoryID})
			if err != nil || c.MenuID != menuID {
				return errValidation("category_id must belong to this menu")
			}
		}
		vs, err := q.ListVariantsForAdjustment(ctx, sqlc.ListVariantsForAdjustmentParams{
			TenantID: p.TenantID, MenuID: menuID, CategoryID: in.CategoryID,
		})
		if err != nil {
			return err
		}
		for _, v := range vs {
			np := adjustPrice(v.PriceMinor, in.Percent, in.AmountMinor, in.RoundToMinor)
			if np == v.PriceMinor {
				continue
			}
			if err := q.SetVariantPrice(ctx, sqlc.SetVariantPriceParams{TenantID: p.TenantID, ID: v.ID, PriceMinor: np}); err != nil {
				return err
			}
			if err := recordPriceChange(r, q, p, v.ID, v.PriceMinor, np); err != nil {
				return err
			}
			updated++
		}
		return nil
	})
	writeResult(w, r, http.StatusOK, map[string]int{"updated": updated}, err)
}

// GET /v1/variants/{variantID}/price-history (newest first, last 100)
func (s *Server) handlePriceHistory(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "variantID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var changes []sqlc.PriceChange
	err = s.tx(r, func(q *sqlc.Queries) error {
		if _, err := q.GetVariant(r.Context(), sqlc.GetVariantParams{TenantID: p.TenantID, ID: id}); err != nil {
			return err
		}
		changes, err = q.ListPriceChanges(r.Context(), sqlc.ListPriceChangesParams{TenantID: p.TenantID, VariantID: id})
		return err
	})
	writeResult(w, r, http.StatusOK, map[string]any{"items": changes}, err)
}
