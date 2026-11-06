package ocr

import (
	"bytes"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestPrepare(t *testing.T) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewNRGBA(image.Rect(0, 0, 3000, 1000))); err != nil {
		t.Fatal(err)
	}
	p, err := Prepare(buf.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(p.Data))
	if err != nil || p.MIME != "image/jpeg" || p.PageCount != 1 || cfg.Width != MaxImageSide {
		t.Fatalf("prepared %s %d pages, %dx%d, err %v", p.MIME, p.PageCount, cfg.Width, cfg.Height, err)
	}
	if _, err := Prepare([]byte("hello")); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("text: %v", err)
	}
}

func TestMergeAndValidate(t *testing.T) {
	price := int64(100)
	page := func(cat, item string) Draft {
		return Draft{Currency: "RSD", Categories: []DraftCategory{{Name: cat, Items: []DraftItem{
			{Name: item, Variants: []DraftVariant{{PriceMinor: &price}}},
		}}}}
	}
	d := Merge([]Draft{page("Pića", "Pivo"), page("PIĆA", "Vino"), page("", "Sok"), page("Hrana", "Burger")})
	if len(d.Categories) != 2 || len(d.Categories[0].Items) != 3 || d.Currency != "RSD" {
		t.Fatalf("merge: %+v", d)
	}
	if p := Validate(d); len(p) != 0 {
		t.Fatalf("valid draft has problems: %v", p)
	}
	d.Categories[1].Items[0].Variants[0].PriceMinor = nil
	d.Categories[0].Name = " "
	if p := Validate(d); len(p) != 2 {
		t.Fatalf("problems: %v", p)
	}
}
