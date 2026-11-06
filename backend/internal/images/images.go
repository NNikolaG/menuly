// Package images prepares uploaded pictures for the menu: fixes phone
// orientation (EXIF), scales them down and re-encodes them, which also
// strips metadata such as GPS location.
package images

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"net/http"

	"github.com/disintegration/imaging"
	_ "golang.org/x/image/webp" // decode WebP uploads
)

var ErrUnsupported = errors.New("unsupported image type; upload JPEG, PNG or WebP")

// Purposes and the longest edge each is scaled down to.
var maxSide = map[string]int{
	"item":      1600,
	"promotion": 1600,
	"cover":     2400,
	"logo":      512,
}

func ValidPurpose(p string) bool { _, ok := maxSide[p]; return ok }

type Result struct {
	MIME          string
	Ext           string
	Data          []byte
	Width, Height int
}

// Process decodes, orients, scales and encodes. Logos with transparency stay
// PNG; everything else becomes JPEG.
func Process(data []byte, purpose string) (Result, error) {
	switch http.DetectContentType(data) {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
	default:
		return Result{}, ErrUnsupported
	}
	img, err := imaging.Decode(bytes.NewReader(data), imaging.AutoOrientation(true))
	if err != nil {
		return Result{}, ErrUnsupported
	}
	side := maxSide[purpose]
	if side == 0 {
		side = 1600
	}
	if b := img.Bounds(); b.Dx() > side || b.Dy() > side {
		img = imaging.Fit(img, side, side, imaging.Lanczos)
	}
	b := img.Bounds()
	res := Result{Width: b.Dx(), Height: b.Dy()}
	var buf bytes.Buffer
	if purpose == "logo" && hasAlpha(img) {
		if err := png.Encode(&buf, img); err != nil {
			return Result{}, err
		}
		res.MIME, res.Ext = "image/png", "png"
	} else {
		if err := jpeg.Encode(&buf, onWhite(img), &jpeg.Options{Quality: 82}); err != nil {
			return Result{}, err
		}
		res.MIME, res.Ext = "image/jpeg", "jpg"
	}
	res.Data = buf.Bytes()
	return res, nil
}

func hasAlpha(img image.Image) bool {
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if _, _, _, a := img.At(x, y).RGBA(); a < 0xffff {
				return true
			}
		}
	}
	return false
}

func onWhite(img image.Image) image.Image {
	out := image.NewRGBA(img.Bounds())
	draw.Draw(out, out.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.Draw(out, out.Bounds(), img, img.Bounds().Min, draw.Over)
	return out
}
