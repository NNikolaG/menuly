// Package ocr turns photos/PDFs of existing menus into a structured draft.
//
// A MenuExtractor (a multimodal LLM behind an interface) reads one uploaded
// file and returns what is printed on it. This package then validates it in
// Go (prices, empty names, confidence) and builds the Draft that the user
// reviews and corrects. The model never writes into a menu directly.
package ocr

import (
	"context"
	"errors"
	"strconv"
	"strings"
)

// Page is one uploaded file: an image (already preprocessed) or a PDF.
type Page struct {
	MIME string
	Data []byte
}

// Extracted is what the model read from a page, as printed.
type Extracted struct {
	CurrencyHint string              `json:"currency_hint"`
	Categories   []ExtractedCategory `json:"categories"`
}

type ExtractedCategory struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Items       []ExtractedItem `json:"items"`
}

type ExtractedItem struct {
	Name            string             `json:"name"`
	Description     string             `json:"description"`
	Variants        []ExtractedVariant `json:"variants"`
	NameConfidence  float64            `json:"name_confidence"`
	PriceConfidence float64            `json:"price_confidence"`
}

type ExtractedVariant struct {
	Label     string `json:"label"`
	PriceText string `json:"price_text"`
}

// Usage is what one extraction cost.
type Usage struct {
	Provider     string
	Model        string
	InputTokens  int64
	OutputTokens int64
	CostMicros   int64 // millionths of a USD
}

func (u *Usage) Add(o Usage) {
	u.Provider, u.Model = o.Provider, o.Model
	u.InputTokens += o.InputTokens
	u.OutputTokens += o.OutputTokens
	u.CostMicros += o.CostMicros
}

// MenuExtractor reads one page. Implementations return ErrPermanent (wrapped)
// for failures that a retry will not fix (refusal, unreadable input).
type MenuExtractor interface {
	Extract(ctx context.Context, page Page) (Extracted, Usage, error)
}

// ErrPermanent marks extraction failures that should not be retried.
var ErrPermanent = errors.New("permanent extraction failure")

// ErrNotConfigured is returned when no OCR provider is set up.
var ErrNotConfigured = errors.New("OCR provider is not configured")

// Draft is the editable import result shown on the review screen and
// committed into a menu.
type Draft struct {
	Currency   string          `json:"currency"`
	Categories []DraftCategory `json:"categories"`
}

type DraftCategory struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Items       []DraftItem `json:"items"`
}

type DraftItem struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Variants    []DraftVariant `json:"variants"`
	// Uncertain lists fields the user should check: "name", "price".
	Uncertain []string `json:"uncertain"`
	// PageIndex points at the uploaded file the item came from.
	PageIndex int `json:"page_index"`
}

type DraftVariant struct {
	Label string `json:"label"`
	// PriceMinor is nil when the printed price could not be parsed.
	PriceMinor *int64 `json:"price_minor"`
	// PriceText is the price as printed, for the reviewer.
	PriceText string `json:"price_text"`
}

const lowConfidence = 0.7

// ToDraft validates an extracted page and converts it to draft form.
func ToDraft(e Extracted, pageIndex int) Draft {
	d := Draft{Currency: DetectCurrency(e.CurrencyHint), Categories: []DraftCategory{}}
	for _, c := range e.Categories {
		dc := DraftCategory{Name: strings.TrimSpace(c.Name), Description: strings.TrimSpace(c.Description), Items: []DraftItem{}}
		for _, it := range c.Items {
			di := DraftItem{
				Name: strings.TrimSpace(it.Name), Description: strings.TrimSpace(it.Description),
				Variants: []DraftVariant{}, Uncertain: []string{}, PageIndex: pageIndex,
			}
			if di.Name == "" {
				continue
			}
			if it.NameConfidence < lowConfidence {
				di.Uncertain = append(di.Uncertain, "name")
			}
			priceUncertain := it.PriceConfidence < lowConfidence
			for _, v := range it.Variants {
				dv := DraftVariant{Label: strings.TrimSpace(v.Label), PriceText: strings.TrimSpace(v.PriceText)}
				if p, ok := ParsePriceMinor(v.PriceText); ok {
					dv.PriceMinor = &p
				} else {
					priceUncertain = true
				}
				if d.Currency == "" {
					d.Currency = DetectCurrency(v.PriceText)
				}
				di.Variants = append(di.Variants, dv)
			}
			if len(di.Variants) == 0 {
				di.Variants = append(di.Variants, DraftVariant{})
				priceUncertain = true
			}
			if priceUncertain {
				di.Uncertain = append(di.Uncertain, "price")
			}
			dc.Items = append(dc.Items, di)
		}
		if len(dc.Items) > 0 {
			d.Categories = append(d.Categories, dc)
		}
	}
	return d
}

// Quality reports whether a page result looks good enough to keep; when it
// does not, the extractor escalates to a stronger model.
func Quality(e Extracted) (ok bool, reason string) {
	items, badPrices, lowConf := 0, 0, 0
	for _, c := range e.Categories {
		for _, it := range c.Items {
			items++
			if it.NameConfidence < 0.5 || it.PriceConfidence < 0.5 {
				lowConf++
			}
			if len(it.Variants) == 0 {
				badPrices++
				continue
			}
			for _, v := range it.Variants {
				if _, ok := ParsePriceMinor(v.PriceText); !ok {
					badPrices++
					break
				}
			}
		}
	}
	switch {
	case items == 0:
		return false, "no items found"
	case badPrices*5 > items:
		return false, "too many unreadable prices"
	case lowConf*4 > items:
		return false, "too many low-confidence items"
	}
	return true, ""
}

// Merge appends page drafts in page order. A category that continues on the
// next page (same name) is merged; items without a heading go to the
// previous category.
func Merge(pages []Draft) Draft {
	out := Draft{Categories: []DraftCategory{}}
	for _, p := range pages {
		if out.Currency == "" {
			out.Currency = p.Currency
		}
		for _, c := range p.Categories {
			if c.Name == "" && len(out.Categories) > 0 {
				last := &out.Categories[len(out.Categories)-1]
				last.Items = append(last.Items, c.Items...)
				continue
			}
			merged := false
			for i := range out.Categories {
				if strings.EqualFold(out.Categories[i].Name, c.Name) {
					out.Categories[i].Items = append(out.Categories[i].Items, c.Items...)
					merged = true
					break
				}
			}
			if !merged {
				out.Categories = append(out.Categories, c)
			}
		}
	}
	return out
}

// MaxNameLen matches the API limit for category and item names (bytes).
const MaxNameLen = 200

// Validate checks a (user-edited) draft before it becomes a menu and returns
// human-readable problems, empty when it can be committed.
func Validate(d Draft) []string {
	var problems []string
	if len(d.Categories) == 0 {
		problems = append(problems, "the draft has no categories")
	}
	for ci, c := range d.Categories {
		if strings.TrimSpace(c.Name) == "" {
			problems = append(problems, fmtPath(ci, -1, -1)+": category name is empty")
		} else if len(c.Name) > MaxNameLen {
			problems = append(problems, fmtPath(ci, -1, -1)+": category name is too long")
		}
		for ii, it := range c.Items {
			if strings.TrimSpace(it.Name) == "" {
				problems = append(problems, fmtPath(ci, ii, -1)+": item name is empty")
			} else if len(it.Name) > MaxNameLen {
				problems = append(problems, fmtPath(ci, ii, -1)+": item name is too long")
			}
			if len(it.Variants) == 0 {
				problems = append(problems, fmtPath(ci, ii, -1)+": item has no price")
			}
			for vi, v := range it.Variants {
				if v.PriceMinor == nil || *v.PriceMinor < 0 {
					problems = append(problems, fmtPath(ci, ii, vi)+": price is missing")
				}
			}
		}
	}
	return problems
}

func fmtPath(c, i, v int) string {
	s := "categories[" + itoa(c) + "]"
	if i >= 0 {
		s += ".items[" + itoa(i) + "]"
	}
	if v >= 0 {
		s += ".variants[" + itoa(v) + "]"
	}
	return s
}

func itoa(n int) string { return strconv.Itoa(n) }
