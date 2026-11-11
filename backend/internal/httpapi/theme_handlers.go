package httpapi

import (
	"net/http"
	"slices"
	"strings"

	"github.com/google/uuid"

	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

// Theme keys. Templates are layouts of the public menu; accent and font are
// presets of the Receipt design system (web: [data-tenant], font presets).
// Venues pick from these lists only, so every menu stays readable.
var (
	themeTemplates  = []string{"racun", "galerija", "tabla", "etiketa", "plakat"}
	themeAccents    = []string{"tinta", "narandza", "espresso", "bordo", "maslina", "teget", "kobalt", "smaragd", "senf", "roze"}
	themeFonts      = []string{"onest", "manrope", "plex"}
	themeColorModes = []string{"auto", "light", "dark"}
	themePatterns   = []string{"bauhaus", "trake", "mozaik"}
)

// themeDTO is the theme as admin and public clients see it.
type themeDTO struct {
	Template          string `json:"template"`
	Accent            string `json:"accent"`
	Font              string `json:"font"`
	ColorMode         string `json:"color_mode"`
	ShowImages        bool   `json:"show_images"`
	ShowDescriptions  bool   `json:"show_descriptions"`
	ShowPattern       bool   `json:"show_pattern"`
	LogoURL           string `json:"logo_url"`
	CoverURL          string `json:"cover_url"`
	Pattern           string `json:"pattern"`
	ShowIllustrations bool   `json:"show_illustrations"`
}

// defaultTheme matches the column defaults of menu_themes.
func defaultTheme() themeDTO {
	return themeDTO{
		Template: "racun", Accent: "tinta", Font: "onest", ColorMode: "auto",
		ShowImages: true, ShowDescriptions: true, ShowPattern: true, Pattern: "bauhaus",
	}
}

func themeFromRow(t sqlc.MenuTheme) themeDTO {
	return themeDTO{
		Template: t.Template, Accent: t.Accent, Font: t.Font, ColorMode: t.ColorMode,
		ShowImages: t.ShowImages, ShowDescriptions: t.ShowDescriptions, ShowPattern: t.ShowPattern,
		LogoURL: t.LogoUrl, CoverURL: t.CoverUrl, Pattern: t.Pattern,
		ShowIllustrations: t.ShowIllustrations,
	}
}

// loadTheme returns the menu's theme, or the defaults when none is saved.
func loadTheme(r *http.Request, q *sqlc.Queries, tenantID, menuID uuid.UUID) (themeDTO, error) {
	t, err := q.GetMenuTheme(r.Context(), sqlc.GetMenuThemeParams{TenantID: tenantID, MenuID: menuID})
	if notFoundAs(err) == errNotFound {
		return defaultTheme(), nil
	}
	if err != nil {
		return themeDTO{}, err
	}
	return themeFromRow(t), nil
}

// GET /v1/menus/{menuID}/theme
func (s *Server) handleGetMenuTheme(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	menuID, err := urlID(r, "menuID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var out themeDTO
	err = s.tx(r, func(q *sqlc.Queries) error {
		if _, err := q.GetMenu(r.Context(), sqlc.GetMenuParams{TenantID: p.TenantID, ID: menuID}); err != nil {
			return err
		}
		out, err = loadTheme(r, q, p.TenantID, menuID)
		return err
	})
	writeResult(w, r, http.StatusOK, out, err)
}

// PUT /v1/menus/{menuID}/theme saves the theme. Fields left out keep their
// current value (or the default), so a client may send just what changed.
func (s *Server) handlePutMenuTheme(w http.ResponseWriter, r *http.Request) {
	p := mustPrincipal(r)
	menuID, err := urlID(r, "menuID")
	if err != nil {
		writeError(w, r, err)
		return
	}
	var in struct {
		Template          *string `json:"template"`
		Accent            *string `json:"accent"`
		Font              *string `json:"font"`
		ColorMode         *string `json:"color_mode"`
		ShowImages        *bool   `json:"show_images"`
		ShowDescriptions  *bool   `json:"show_descriptions"`
		ShowPattern       *bool   `json:"show_pattern"`
		LogoURL           *string `json:"logo_url"`
		CoverURL          *string `json:"cover_url"`
		Pattern           *string `json:"pattern"`
		ShowIllustrations *bool   `json:"show_illustrations"`
	}
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	for _, c := range []struct {
		v     *string
		field string
		keys  []string
	}{
		{in.Template, "template", themeTemplates},
		{in.Accent, "accent", themeAccents},
		{in.Font, "font", themeFonts},
		{in.ColorMode, "color_mode", themeColorModes},
		{in.Pattern, "pattern", themePatterns},
	} {
		if c.v != nil && !slices.Contains(c.keys, *c.v) {
			writeError(w, r, errValidation(c.field+" must be one of: "+strings.Join(c.keys, ", ")))
			return
		}
	}
	if apiErr := checkURL(in.LogoURL, "logo_url"); apiErr != nil {
		writeError(w, r, apiErr)
		return
	}
	if apiErr := checkURL(in.CoverURL, "cover_url"); apiErr != nil {
		writeError(w, r, apiErr)
		return
	}

	var out themeDTO
	err = s.tx(r, func(q *sqlc.Queries) error {
		ctx := r.Context()
		if _, err := q.GetMenu(ctx, sqlc.GetMenuParams{TenantID: p.TenantID, ID: menuID}); err != nil {
			return err
		}
		cur, err := loadTheme(r, q, p.TenantID, menuID)
		if err != nil {
			return err
		}
		set(&cur.Template, in.Template)
		set(&cur.Accent, in.Accent)
		set(&cur.Font, in.Font)
		set(&cur.ColorMode, in.ColorMode)
		set(&cur.ShowImages, in.ShowImages)
		set(&cur.ShowDescriptions, in.ShowDescriptions)
		set(&cur.ShowPattern, in.ShowPattern)
		set(&cur.LogoURL, in.LogoURL)
		set(&cur.CoverURL, in.CoverURL)
		set(&cur.Pattern, in.Pattern)
		set(&cur.ShowIllustrations, in.ShowIllustrations)
		row, err := q.UpsertMenuTheme(ctx, sqlc.UpsertMenuThemeParams{
			MenuID: menuID, TenantID: p.TenantID,
			Template: cur.Template, Accent: cur.Accent, Font: cur.Font, ColorMode: cur.ColorMode,
			ShowImages: cur.ShowImages, ShowDescriptions: cur.ShowDescriptions, ShowPattern: cur.ShowPattern,
			LogoUrl: cur.LogoURL, CoverUrl: cur.CoverURL, Pattern: cur.Pattern,
			ShowIllustrations: cur.ShowIllustrations,
		})
		if err != nil {
			return err
		}
		out = themeFromRow(row)
		return nil
	})
	writeResult(w, r, http.StatusOK, out, err)
}

func set[T any](dst *T, v *T) {
	if v != nil {
		*dst = *v
	}
}
