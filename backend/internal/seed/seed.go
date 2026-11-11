// Package seed fills a local database with a demo account: one tenant, its
// owner, two venues and a published menu with categories, items, variants
// and English translations. It is for development only.
package seed

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/auth"
	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

// Demo account credentials. Printed by `api seed`.
const (
	Email      = "demo@menuly.app"
	Password   = "demo1234"
	TenantSlug = "demo"
	// StaffEmail is a staff member limited to the "mornar" venue (same
	// password), to try per-venue access.
	StaffEmail = "osoblje@menuly.app"
)

// Result describes what Run did.
type Result struct {
	Created  bool // false when the demo account already existed and reset was off
	TenantID uuid.UUID
	UserID   uuid.UUID
	MenuID   uuid.UUID
}

// Run creates the demo account. If it already exists, Run leaves it alone
// unless reset is true, in which case the demo tenant and user are deleted
// (cascading to all their data) and created again.
func Run(ctx context.Context, d *db.DB, reset bool) (Result, error) {
	existing, err := findExisting(ctx, d)
	if err != nil {
		return Result{}, err
	}
	if existing != nil {
		if !reset {
			return Result{TenantID: existing.tenantID, UserID: existing.userID}, nil
		}
		if err := remove(ctx, d, *existing); err != nil {
			return Result{}, fmt.Errorf("reset demo data: %w", err)
		}
	}

	hash, err := auth.HashPassword(Password)
	if err != nil {
		return Result{}, err
	}
	res := Result{Created: true, TenantID: newID(), UserID: newID()}
	err = d.Tx(ctx, db.Scope{TenantID: res.TenantID, UserID: res.UserID}, func(q *sqlc.Queries) error {
		var err error
		res.MenuID, err = create(ctx, q, res.TenantID, res.UserID, hash)
		return err
	})
	if err != nil {
		return Result{}, err
	}
	return res, nil
}

type account struct{ tenantID, userID uuid.UUID }

// findExisting returns the demo user and their tenant, or nil.
func findExisting(ctx context.Context, d *db.DB) (*account, error) {
	var found *account
	err := d.Tx(ctx, db.Scope{}, func(q *sqlc.Queries) error {
		u, err := q.GetUserByEmail(ctx, Email)
		if db.IsNotFound(err) {
			return nil
		}
		if err != nil {
			return err
		}
		found = &account{userID: u.ID}
		return nil
	})
	if err != nil || found == nil {
		return found, err
	}
	err = d.Tx(ctx, db.Scope{UserID: found.userID}, func(q *sqlc.Queries) error {
		ms, err := q.ListUserMemberships(ctx, found.userID)
		if err != nil {
			return err
		}
		if len(ms) > 0 {
			found.tenantID = ms[0].TenantID
		}
		return nil
	})
	return found, err
}

func remove(ctx context.Context, d *db.DB, a account) error {
	return d.Tx(ctx, db.Scope{TenantID: a.tenantID, UserID: a.userID}, func(q *sqlc.Queries) error {
		if a.tenantID != uuid.Nil {
			if err := q.DeleteTenant(ctx, a.tenantID); err != nil {
				return err
			}
		}
		if staff, err := q.GetUserByEmail(ctx, StaffEmail); err == nil {
			if err := q.DeleteUser(ctx, staff.ID); err != nil {
				return err
			}
		} else if !db.IsNotFound(err) {
			return err
		}
		return q.DeleteUser(ctx, a.userID)
	})
}

func create(ctx context.Context, q *sqlc.Queries, tenantID, userID uuid.UUID, hash string) (uuid.UUID, error) {
	if _, err := q.CreateTenant(ctx, sqlc.CreateTenantParams{ID: tenantID, Name: "Kafana Mornar d.o.o.", Slug: TenantSlug}); err != nil {
		return uuid.Nil, fmt.Errorf("tenant: %w", err)
	}
	if _, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		ID: userID, Email: Email, PasswordHash: hash, Name: "Demo Vlasnik", Locale: "sr-Latn",
	}); err != nil {
		return uuid.Nil, fmt.Errorf("user: %w", err)
	}
	if _, err := q.CreateMembership(ctx, sqlc.CreateMembershipParams{TenantID: tenantID, UserID: userID, Role: auth.RoleOwner}); err != nil {
		return uuid.Nil, fmt.Errorf("membership: %w", err)
	}

	hours := json.RawMessage(`{"mon":[["08:00","23:00"]],"tue":[["08:00","23:00"]],"wed":[["08:00","23:00"]],"thu":[["08:00","23:00"]],"fri":[["08:00","01:00"]],"sat":[["09:00","01:00"]],"sun":[["10:00","22:00"]]}`)
	venueID := newID()
	if _, err := q.CreateVenue(ctx, sqlc.CreateVenueParams{
		ID: venueID, TenantID: tenantID, Name: "Kafana Mornar", Slug: "mornar",
		Address: "Karađorđeva 12, Beograd", Phone: "+381 11 123 4567",
		Currency: "RSD", Timezone: "Europe/Belgrade", OpeningHours: hours,
		WifiAvailable: true, WifiSsid: "Mornar-Gost", WifiPassword: "mornar2026", WifiAccess: "menu",
	}); err != nil {
		return uuid.Nil, fmt.Errorf("venue: %w", err)
	}
	// A staff member who works in Mornar only.
	staffID := newID()
	if _, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		ID: staffID, Email: StaffEmail, PasswordHash: hash, Name: "Demo Konobar", Locale: "sr-Latn",
	}); err != nil {
		return uuid.Nil, fmt.Errorf("staff user: %w", err)
	}
	if _, err := q.CreateMembership(ctx, sqlc.CreateMembershipParams{
		TenantID: tenantID, UserID: staffID, Role: auth.RoleStaff, VenueIds: []uuid.UUID{venueID},
	}); err != nil {
		return uuid.Nil, fmt.Errorf("staff membership: %w", err)
	}
	// A second venue without a menu, so the lists and empty states have data.
	if _, err := q.CreateVenue(ctx, sqlc.CreateVenueParams{
		ID: newID(), TenantID: tenantID, Name: "Mornar Bašta", Slug: "basta",
		Address: "Strahinjića Bana 5, Beograd", Currency: "RSD", Timezone: "Europe/Belgrade",
		OpeningHours: json.RawMessage(`{}`), WifiAccess: "staff",
	}); err != nil {
		return uuid.Nil, fmt.Errorf("venue: %w", err)
	}

	menuID := newID()
	if _, err := q.CreateMenu(ctx, sqlc.CreateMenuParams{ID: menuID, TenantID: tenantID, VenueID: venueID, Name: "Glavni meni"}); err != nil {
		return uuid.Nil, fmt.Errorf("menu: %w", err)
	}
	// The seed's translations are English, so the guest gets a sr/en picker.
	if _, err := q.UpdateMenu(ctx, sqlc.UpdateMenuParams{
		TenantID: tenantID, ID: menuID, Languages: []byte(`[{"code":"en","name":"English"}]`),
	}); err != nil {
		return uuid.Nil, fmt.Errorf("menu languages: %w", err)
	}
	// A draft next to the published one, as when a venue prepares a new season.
	if _, err := q.CreateMenu(ctx, sqlc.CreateMenuParams{ID: newID(), TenantID: tenantID, VenueID: venueID, Name: "Letnji meni (nacrt)"}); err != nil {
		return uuid.Nil, fmt.Errorf("menu: %w", err)
	}

	for _, c := range demoMenu {
		catID := newID()
		if _, err := q.CreateCategory(ctx, sqlc.CreateCategoryParams{
			ID: catID, TenantID: tenantID, MenuID: menuID, Name: c.name,
			Translations: tr("name", c.en, ""), IsVisible: true,
		}); err != nil {
			return uuid.Nil, fmt.Errorf("category %q: %w", c.name, err)
		}
		for _, it := range c.items {
			itemID := newID()
			if _, err := q.CreateItem(ctx, sqlc.CreateItemParams{
				ID: itemID, TenantID: tenantID, CategoryID: catID, Name: it.name, Description: it.desc,
				Translations: tr("name", it.en, it.enDesc), Tags: orEmpty(it.tags), Allergens: orEmpty(it.allergens),
				IsAvailable: !it.unavailable, IsVisible: true,
			}); err != nil {
				return uuid.Nil, fmt.Errorf("item %q: %w", it.name, err)
			}
			for _, v := range it.variants {
				if _, err := q.CreateVariant(ctx, sqlc.CreateVariantParams{
					ID: newID(), TenantID: tenantID, ItemID: itemID, Label: v.label,
					Translations: tr("label", v.en, ""), PriceMinor: v.rsd * 100,
				}); err != nil {
					return uuid.Nil, fmt.Errorf("variant of %q: %w", it.name, err)
				}
			}
		}
	}

	if _, err := q.UpsertMenuTheme(ctx, sqlc.UpsertMenuThemeParams{
		MenuID: menuID, TenantID: tenantID, Template: "racun", Accent: "espresso", Font: "onest", ColorMode: "auto",
		ShowImages: true, ShowDescriptions: true, ShowPattern: true, Pattern: "bauhaus", ShowIllustrations: true,
	}); err != nil {
		return uuid.Nil, fmt.Errorf("theme: %w", err)
	}
	if _, err := q.PublishMenu(ctx, sqlc.PublishMenuParams{TenantID: tenantID, ID: menuID}); err != nil {
		return uuid.Nil, fmt.Errorf("publish: %w", err)
	}
	if err := q.SetVenueActiveMenu(ctx, sqlc.SetVenueActiveMenuParams{TenantID: tenantID, VenueID: venueID, MenuID: &menuID}); err != nil {
		return uuid.Nil, fmt.Errorf("activate menu: %w", err)
	}
	return menuID, nil
}

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }

// tr builds a translations object with an English entry; empty strings are left out.
func tr(key, value, desc string) json.RawMessage {
	en := map[string]string{}
	if value != "" {
		en[key] = value
	}
	if desc != "" {
		en["description"] = desc
	}
	if len(en) == 0 {
		return json.RawMessage(`{}`)
	}
	b, _ := json.Marshal(map[string]any{"en": en})
	return b
}

func orEmpty(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
