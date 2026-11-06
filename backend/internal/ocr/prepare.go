package ocr

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"net/http"

	"github.com/disintegration/imaging"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	_ "golang.org/x/image/webp" // decode WebP uploads
)

// MaxImageSide is the longest edge an image is scaled down to before it is
// sent to the model. Larger photos cost more and do not read better.
const MaxImageSide = 2000

var ErrUnsupported = errors.New("unsupported file type; upload JPEG, PNG, WebP or PDF")

// Prepared is an upload ready for extraction and storage.
type Prepared struct {
	MIME      string
	Data      []byte
	PageCount int
}

// Prepare sniffs the file type, fixes photo orientation (EXIF), scales big
// images down and re-encodes them as JPEG. PDFs are kept as they are and
// their pages counted.
func Prepare(data []byte) (Prepared, error) {
	switch mime := http.DetectContentType(data); mime {
	case "application/pdf":
		n, err := api.PageCount(context.Background(), bytes.NewReader(data), nil)
		if err != nil {
			return Prepared{}, fmt.Errorf("unreadable PDF: %w", err)
		}
		return Prepared{MIME: mime, Data: data, PageCount: n}, nil
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		img, err := imaging.Decode(bytes.NewReader(data), imaging.AutoOrientation(true))
		if err != nil {
			return Prepared{}, fmt.Errorf("unreadable image: %w", err)
		}
		b := img.Bounds()
		if b.Dx() > MaxImageSide || b.Dy() > MaxImageSide {
			img = imaging.Fit(img, MaxImageSide, MaxImageSide, imaging.Lanczos)
		}
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, flatten(img), &jpeg.Options{Quality: 85}); err != nil {
			return Prepared{}, err
		}
		return Prepared{MIME: "image/jpeg", Data: buf.Bytes(), PageCount: 1}, nil
	default:
		return Prepared{}, ErrUnsupported
	}
}

// flatten puts transparent images on white, so JPEG does not turn them black.
func flatten(img image.Image) image.Image {
	bg := imaging.New(img.Bounds().Dx(), img.Bounds().Dy(), image.White.C)
	return imaging.Overlay(bg, img, image.Point{}, 1)
}
