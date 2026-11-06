package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

var promotionTranslationFields = []string{"name", "description"}
var slotTranslationFields = []string{"label"}

const (
	maxPromotionSlots = 10
	maxSlotOptions    = 20
)

// optionalTime tells "absent" from an explicit null, so PATCH can clear a
// date.
type optionalTime struct {
	Set   bool
	Value *time.Time
}

func (o *optionalTime) UnmarshalJSON(b []byte) error {
	o.Set = true
	if bytes.Equal(bytes.TrimSpace(b), []byte("null")) {
		o.Value = nil
		return nil
	}
	var t time.Time
	if err := json.Unmarshal(b, &t); err != nil {
		return err
	}
	o.Value = &t
	return nil
}

type slotOptionInput struct {
	ItemID    uuid.UUID  `json:"item_id"`
	VariantID *uuid.UUID `json:"variant_id"`
}

type slotInput struct {
	Label        string            `json:"label"`
	Translations *json.RawMessage  `json:"translations"`
	Quantity     *int32            `json:"quantity"`
	Options      []slotOptionInput `json:"options"`
}

type promotionInput struct {
	Name         *string          `json:"name"`
	Description  *string          `json:"description"`
	Translations *json.RawMessage `json:"translations"`
	ImageURL     *string          `json:"image_url"`
	PriceMinor   *int64           `json:"price_minor"`
	StartsAt     optionalTime     `json:"starts_at"`
	EndsAt       optionalTime     `json:"ends_at"`
	IsActive     *bool            `json:"is_active"`
	IsFeatured   *bool            `json:"is_featured"`
	Slots        *[]slotInput     `json:"slots"`
}

func (in *promotionInput) normalize() ([]byte, *APIError) {
	if apiErr := requireName(in.Name, "name"); apiErr != nil {
		return nil, apiErr
	}
	trimPtr(in.Description)
	if in.Description != nil && len(*in.Description) > 2000 {
		return nil, errValidation("description must be at most 2000 characters")
	}
	if apiErr := checkImageURL(in.ImageURL); apiErr != nil {
		return nil, apiErr
	}
	if in.PriceMinor != nil && *in.PriceMinor < 0 {
		return nil, errValidation("price_minor must not be negative")
	}
	if in.Slots != nil {
		slots := *in.Slots
		if len(slots) == 0 || len(slots) > maxPromotionSlots {
			return nil, errValidation(fmt.Sprintf("a combo needs 1 to %d slots", maxPromotionSlots))
		}
		for i := range slots {
			sl := &slots[i]
			sl.Label = trim(sl.Label)
			if len(sl.Label) > 100 {
				return nil, errValidation(fmt.Sprintf("slots[%d].label must be at most 100 characters", i))
			}
			if sl.Quantity == nil {
				one := int32(1)
				sl.Quantity = &one
			}
			if *sl.Quantity < 1 || *sl.Quantity > 20 {
				return nil, errValidation(fmt.Sprintf("slots[%d].quantity must be between 1 and 20", i))
			}
			if len(sl.Options) == 0 || len(sl.Options) > maxSlotOptions {
				return nil, errValidation(fmt.Sprintf("slots[%d] needs 1 to %d options", i, maxSlotOptions))
			}
			seen := map[string]bool{}
			for _, o := range sl.Options {
				key := o.ItemID.String()
				if o.VariantID != nil {
					key += "/" + o.VariantID.String()
				}
				if o.ItemID == uuid.Nil || seen[key] {
					return nil, errValidation(fmt.Sprintf("slots[%d]: every option needs a distinct item_id", i))
				}
				seen[key] = true
			}
			if _, apiErr := normalizeTranslations(sl.Translations, slotTranslationFields...); apiErr != nil {
				return nil, apiErr
			}
		}
	}
	return normalizeTranslations(in.Translations, promotionTranslationFields...)
}

// Admin view -----------------------------------------------------------------

type promotionOptionDTO struct {
	ID           uuid.UUID  `json:"id"`
	ItemID       uuid.UUID  `json:"item_id"`
	VariantID    *uuid.UUID `json:"variant_id"`
	ItemName     string     `json:"item_name"`
	VariantLabel *string    `json:"variant_label"`
	PriceMinor   int64      `json:"price_minor"`
	IsAvailable  bool       `json:"is_available"`
	// InActiveMenu is false when the item is hidden or not in the venue's
	// active menu; guests do not see such options.
	InActiveMenu bool `json:"in_active_menu"`
}

type promotionSlotDTO struct {
	ID           uuid.UUID            `json:"id"`
	Label        string               `json:"label"`
	Translations json.RawMessage      `json:"translations"`
	Quantity     int32                `json:"quantity"`
	Options      []promotionOptionDTO `json:"options"`
}

type promotionDTO struct {
	sqlc.Promotion
	// Status: inactive (switched off), scheduled, expired or live.
	Status            string             `json:"status"`
	RegularPriceMinor int64              `json:"regular_price_minor"`
	SavingsMinor      int64              `json:"savings_minor"`
	Slots             []promotionSlotDTO `json:"slots"`
}

func promotionStatus(p sqlc.Promotion, now time.Time) string {
	switch {
	case !p.IsActive:
		return "inactive"
	case p.StartsAt != nil && now.Before(*p.StartsAt):
		return "scheduled"
	case p.EndsAt != nil && !now.Before(*p.EndsAt):
		return "expired"
	}
	return "live"
}

// regularPrice is what the slots cost one by one, counting the cheapest
// option of a choice, so the advertised saving is never overstated.
func regularPrice(slots []promotionSlotDTO) int64 {
	var sum int64
	for _, s := range slots {
		if len(s.Options) == 0 {
			continue
		}
		cheapest := s.Options[0].PriceMinor
		for _, o := range s.Options[1:] {
			cheapest = min(cheapest, o.PriceMinor)
		}
		sum += int64(s.Quantity) * cheapest
	}
	return sum
}

// loadVenuePromotions returns the venue's promotions with slots and options,
// in position order. only, when set, limits it to one promotion.
func loadVenuePromotions(ctx context.Context, q *sqlc.Queries, tenantID uuid.UUID, v sqlc.Venue, only *uuid.UUID) ([]promotionDTO, error) {
	promos, err := q.ListVenuePromotions(ctx, sqlc.ListVenuePromotionsParams{TenantID: tenantID, VenueID: v.ID})
	if err != nil {
		return nil, err
	}
	slots, err := q.ListVenuePromotionSlots(ctx, sqlc.ListVenuePromotionSlotsParams{TenantID: tenantID, VenueID: v.ID})
	if err != nil {
		return nil, err
	}
	opts, err := q.ListVenuePromotionOptions(ctx, sqlc.ListVenuePromotionOptionsParams{TenantID: tenantID, VenueID: v.ID})
	if err != nil {
		return nil, err
	}
	bySlot := map[uuid.UUID][]promotionOptionDTO{}
	for _, o := range opts {
		bySlot[o.SlotID] = append(bySlot[o.SlotID], promotionOptionDTO{
			ID: o.ID, ItemID: o.ItemID, VariantID: o.VariantID, ItemName: o.ItemName, VariantLabel: o.VariantLabel,
			PriceMinor: o.PriceMinor, IsAvailable: o.IsAvailable,
			InActiveMenu: o.IsVisible && o.CategoryVisible && v.ActiveMenuID != nil && *v.ActiveMenuID == o.MenuID,
		})
	}
	byPromo := map[uuid.UUID][]promotionSlotDTO{}
	for _, s := range slots {
		options := bySlot[s.ID]
		if options == nil {
			options = []promotionOptionDTO{}
		}
		byPromo[s.PromotionID] = append(byPromo[s.PromotionID], promotionSlotDTO{
			ID: s.ID, Label: s.Label, Translations: s.Translations, Quantity: s.Quantity, Options: options,
		})
	}
	now := time.Now()
	out := make([]promotionDTO, 0, len(promos))
	for _, p := range promos {
		if only != nil && p.ID != *only {
			continue
		}
		d := promotionDTO{Promotion: p, Status: promotionStatus(p, now), Slots: byPromo[p.ID]}
		if d.Slots == nil {
			d.Slots = []promotionSlotDTO{}
		}
		d.RegularPriceMinor = regularPrice(d.Slots)
		d.SavingsMinor = max(0, d.RegularPriceMinor-p.PriceMinor)
		out = append(out, d)
	}
	return out, nil
}

func loadPromotion(ctx context.Context, q *sqlc.Queries, tenantID, id uuid.UUID) (promotionDTO, error) {
	p, err := q.GetPromotion(ctx, sqlc.GetPromotionParams{TenantID: tenantID, ID: id})
	if err != nil {
		return promotionDTO{}, err
	}
	v, err := q.GetVenue(ctx, sqlc.GetVenueParams{TenantID: tenantID, ID: p.VenueID})
	if err != nil {
		return promotionDTO{}, err
	}
	list, err := loadVenuePromotions(ctx, q, tenantID, v, &id)
	if err != nil {
		return promotionDTO{}, err
	}
	return list[0], nil
}

// replaceSlots swaps all slots of a promotion. Every item must belong to a
// menu of the promotion's venue, and a pinned variant to its item.
func replaceSlots(ctx context.Context, q *sqlc.Queries, tenantID uuid.UUID, p sqlc.Promotion, slots []slotInput) error {
	if err := q.DeletePromotionSlots(ctx, sqlc.DeletePromotionSlotsParams{TenantID: tenantID, PromotionID: p.ID}); err != nil {
		return err
	}
	for si, sl := range slots {
		tr, _ := normalizeTranslations(sl.Translations, slotTranslationFields...)
		if tr == nil {
			tr = []byte(`{}`)
		}
		slot, err := q.CreatePromotionSlot(ctx, sqlc.CreatePromotionSlotParams{
			ID: uuid.Must(uuid.NewV7()), TenantID: tenantID, PromotionID: p.ID,
			Label: sl.Label, Translations: tr, Quantity: *sl.Quantity, Position: int32(si),
		})
		if err != nil {
			return err
		}
		for oi, o := range sl.Options {
			venueID, err := q.GetItemVenueID(ctx, sqlc.GetItemVenueIDParams{TenantID: tenantID, ID: o.ItemID})
			if db.IsNotFound(err) || (err == nil && venueID != p.VenueID) {
				return errValidation(fmt.Sprintf("slots[%d].options[%d]: item_id is not an item of this venue", si, oi))
			}
			if err != nil {
				return err
			}
			if o.VariantID != nil {
				v, err := q.GetVariant(ctx, sqlc.GetVariantParams{TenantID: tenantID, ID: *o.VariantID})
				if db.IsNotFound(err) || (err == nil && v.ItemID != o.ItemID) {
					return errValidation(fmt.Sprintf("slots[%d].options[%d]: variant_id is not a variant of the item", si, oi))
				}
				if err != nil {
					return err
				}
			}
			if err := q.CreatePromotionSlotOption(ctx, sqlc.CreatePromotionSlotOptionParams{
				ID: uuid.Must(uuid.NewV7()), TenantID: tenantID, SlotID: slot.ID,
				ItemID: o.ItemID, VariantID: o.VariantID, Position: int32(oi),
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

func checkWindow(starts, ends *time.Time) *APIError {
	if starts != nil && ends != nil && !ends.After(*starts) {
		return errValidation("ends_at must be after starts_at")
	}
	return nil
}

// GET /v1/venues/{venueID}/promotions
func (s *Server) handleListPromotions(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	venueID, err := urlID(r, "venueID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var list []promotionDTO
	err = s.tx(r, func(q *sqlc.Queries) error {
		v, err := q.GetVenue(r.Context(), sqlc.GetVenueParams{TenantID: p.TenantID, ID: venueID})
		if err != nil {
			return err
		}
		list, err = loadVenuePromotions(r.Context(), q, p.TenantID, v, nil)
		return err
	})
	writeResult(w, r, http.StatusOK, map[string]any{"items": list}, err)
}

// POST /v1/venues/{venueID}/promotions
func (s *Server) handleCreatePromotion(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	venueID, err := urlID(r, "venueID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in promotionInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	switch {
	case in.Name == nil:
		writeError(w, r, errValidation("name is required"))
		return
	case in.PriceMinor == nil:
		writeError(w, r, errValidation("price_minor is required"))
		return
	case in.Slots == nil:
		writeError(w, r, errValidation("slots are required"))
		return
	}
	tr, apiErr := in.normalize()
	if apiErr == nil {
		apiErr = checkWindow(in.StartsAt.Value, in.EndsAt.Value)
	}
	if apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	if tr == nil {
		tr = []byte(`{}`)
	}
	var out promotionDTO
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		if _, err := q.GetVenue(ctx, sqlc.GetVenueParams{TenantID: p.TenantID, ID: venueID}); err != nil {
			return err
		}
		active := in.IsActive == nil || *in.IsActive
		promo, err := q.CreatePromotion(ctx, sqlc.CreatePromotionParams{
			ID: uuid.Must(uuid.NewV7()), TenantID: p.TenantID, VenueID: venueID,
			Name: *in.Name, Description: strOr(in.Description, ""), Translations: tr, ImageUrl: strOr(in.ImageURL, ""),
			PriceMinor: *in.PriceMinor, StartsAt: in.StartsAt.Value, EndsAt: in.EndsAt.Value,
			IsActive: active, IsFeatured: in.IsFeatured != nil && *in.IsFeatured,
		})
		if err != nil {
			return err
		}
		if err := replaceSlots(ctx, q, p.TenantID, promo, *in.Slots); err != nil {
			return err
		}
		out, err = loadPromotion(ctx, q, p.TenantID, promo.ID)
		return err
	})
	writeResult(w, r, http.StatusCreated, out, err)
}

// GET /v1/promotions/{promotionID}
func (s *Server) handleGetPromotion(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "promotionID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var out promotionDTO
	err = s.tx(r, func(q *sqlc.Queries) (err error) {
		out, err = loadPromotion(r.Context(), q, p.TenantID, id)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// PATCH /v1/promotions/{promotionID}: any subset of fields; "slots", when
// given, replaces all slots.
func (s *Server) handleUpdatePromotion(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "promotionID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in promotionInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	tr, apiErr := in.normalize()
	if apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	var out promotionDTO
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		cur, err := q.GetPromotionForUpdate(ctx, sqlc.GetPromotionForUpdateParams{TenantID: p.TenantID, ID: id})
		if err != nil {
			return err
		}
		starts, ends := cur.StartsAt, cur.EndsAt
		if in.StartsAt.Set {
			starts = in.StartsAt.Value
		}
		if in.EndsAt.Set {
			ends = in.EndsAt.Value
		}
		if apiErr := checkWindow(starts, ends); apiErr != nil {
			return apiErr
		}
		promo, err := q.UpdatePromotion(ctx, sqlc.UpdatePromotionParams{
			TenantID: p.TenantID, ID: id, Name: in.Name, Description: in.Description, Translations: tr,
			ImageUrl: in.ImageURL, PriceMinor: in.PriceMinor,
			SetStartsAt: in.StartsAt.Set, StartsAt: in.StartsAt.Value, SetEndsAt: in.EndsAt.Set, EndsAt: in.EndsAt.Value,
			IsActive: in.IsActive, IsFeatured: in.IsFeatured,
		})
		if err != nil {
			return err
		}
		if in.Slots != nil {
			if err := replaceSlots(ctx, q, p.TenantID, promo, *in.Slots); err != nil {
				return err
			}
		}
		out, err = loadPromotion(ctx, q, p.TenantID, id)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// DELETE /v1/promotions/{promotionID}
func (s *Server) handleDeletePromotion(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	id, err := urlID(r, "promotionID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	err = s.tx(r, func(q *sqlc.Queries) error {
		n, err := q.DeletePromotion(r.Context(), sqlc.DeletePromotionParams{TenantID: p.TenantID, ID: id})
		if err == nil && n == 0 {
			return errNotFound
		}
		return err
	})
	writeResult(w, r, http.StatusNoContent, nil, err)
}

// PUT /v1/venues/{venueID}/promotions/order
func (s *Server) handleReorderPromotions(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	venueID, err := urlID(r, "venueID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in orderInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	var list []promotionDTO
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		v, err := q.GetVenue(ctx, sqlc.GetVenueParams{TenantID: p.TenantID, ID: venueID})
		if err != nil {
			return err
		}
		count, err := q.CountVenuePromotions(ctx, sqlc.CountVenuePromotionsParams{TenantID: p.TenantID, VenueID: venueID})
		if err != nil {
			return err
		}
		if apiErr := in.validate(count); apiErr != nil {
			return apiErr
		}
		n, err := q.ReorderPromotions(ctx, sqlc.ReorderPromotionsParams{Ids: in.IDs, TenantID: p.TenantID, VenueID: venueID})
		if err != nil {
			return err
		}
		if n != count {
			return errBadOrder
		}
		list, err = loadVenuePromotions(ctx, q, p.TenantID, v, nil)
		return err
	})
	writeResult(w, r, http.StatusOK, map[string]any{"items": list}, err)
}

// Public view ----------------------------------------------------------------

type publicPromotionOption struct {
	ItemID       uuid.UUID  `json:"item_id"`
	VariantID    *uuid.UUID `json:"variant_id"`
	Name         string     `json:"name"`
	VariantLabel string     `json:"variant_label"`
	PriceMinor   int64      `json:"price_minor"`
	IsAvailable  bool       `json:"is_available"`
}

type publicPromotionSlot struct {
	Label    string                  `json:"label"`
	Quantity int32                   `json:"quantity"`
	Options  []publicPromotionOption `json:"options"`
}

type publicPromotion struct {
	ID                uuid.UUID             `json:"id"`
	Name              string                `json:"name"`
	Description       string                `json:"description"`
	Translations      json.RawMessage       `json:"translations"`
	ImageURL          string                `json:"image_url"`
	PriceMinor        int64                 `json:"price_minor"`
	RegularPriceMinor int64                 `json:"regular_price_minor"`
	SavingsMinor      int64                 `json:"savings_minor"`
	EndsAt            *time.Time            `json:"ends_at"`
	IsFeatured        bool                  `json:"is_featured"`
	IsAvailable       bool                  `json:"is_available"`
	Slots             []publicPromotionSlot `json:"slots"`
}

// buildPublicPromotions keeps live promotions whose every slot still has an
// option in the active menu. A promotion is unavailable when some slot has
// no available option; like items, unavailable ones go last.
func buildPublicPromotions(ctx context.Context, q *sqlc.Queries, tenantID uuid.UUID, v sqlc.Venue, tree menuTreeDTO, lang string) ([]publicPromotion, error) {
	all, err := loadVenuePromotions(ctx, q, tenantID, v, nil)
	if err != nil {
		return nil, err
	}
	translations := map[uuid.UUID]json.RawMessage{}
	variantTr := map[uuid.UUID]json.RawMessage{}
	for _, c := range tree.Categories {
		for _, it := range c.Items {
			translations[it.ID] = it.Translations
			for _, vr := range it.Variants {
				variantTr[vr.ID] = vr.Translations
			}
		}
	}
	now := time.Now()
	out := []publicPromotion{}
	for _, p := range all {
		if promotionStatus(p.Promotion, now) != "live" || len(p.Slots) == 0 {
			continue
		}
		pp := publicPromotion{
			ID: p.ID, Name: localize(p.Translations, lang, "name", p.Name),
			Description:  localize(p.Translations, lang, "description", p.Description),
			Translations: p.Translations, ImageURL: p.ImageUrl, PriceMinor: p.PriceMinor,
			EndsAt: p.EndsAt, IsFeatured: p.IsFeatured, IsAvailable: true,
			Slots: make([]publicPromotionSlot, 0, len(p.Slots)),
		}
		shown := make([]promotionSlotDTO, 0, len(p.Slots))
		ok := true
		for _, sl := range p.Slots {
			ps := publicPromotionSlot{Label: localize(sl.Translations, lang, "label", sl.Label), Quantity: sl.Quantity, Options: []publicPromotionOption{}}
			kept := promotionSlotDTO{Quantity: sl.Quantity}
			anyAvailable := false
			for _, o := range sl.Options {
				if !o.InActiveMenu {
					continue
				}
				label := ""
				if o.VariantLabel != nil {
					label = localize(variantTr[*o.VariantID], lang, "label", *o.VariantLabel)
				}
				ps.Options = append(ps.Options, publicPromotionOption{
					ItemID: o.ItemID, VariantID: o.VariantID, Name: localize(translations[o.ItemID], lang, "name", o.ItemName),
					VariantLabel: label, PriceMinor: o.PriceMinor, IsAvailable: o.IsAvailable,
				})
				kept.Options = append(kept.Options, o)
				anyAvailable = anyAvailable || o.IsAvailable
			}
			if len(ps.Options) == 0 {
				ok = false
				break
			}
			pp.IsAvailable = pp.IsAvailable && anyAvailable
			pp.Slots = append(pp.Slots, ps)
			shown = append(shown, kept)
		}
		if !ok {
			continue
		}
		pp.RegularPriceMinor = regularPrice(shown)
		pp.SavingsMinor = max(0, pp.RegularPriceMinor-pp.PriceMinor)
		out = append(out, pp)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].IsAvailable && !out[j].IsAvailable })
	return out, nil
}
