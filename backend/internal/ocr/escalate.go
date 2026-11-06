package ocr

import (
	"context"
	"errors"
	"fmt"
)

// errBadResult means the model answered but the answer is unusable
// (truncated or not valid JSON); a stronger model may do better.
var errBadResult = errors.New("unusable model output")

// readFunc reads a page with one model.
type readFunc func(ctx context.Context, model string, page Page) (Extracted, Usage, error)

// escalate reads a page with model and, if the result fails validation
// (Quality) or is unusable, once more with fallback. An empty fallback
// disables the second read. Usage covers both reads.
func escalate(ctx context.Context, read readFunc, model, fallback string, page Page) (Extracted, Usage, error) {
	var total Usage
	res, u, err := read(ctx, model, page)
	total.Add(u)
	if err != nil && !errors.Is(err, errBadResult) {
		return Extracted{}, total, err
	}
	if err == nil {
		if ok, _ := Quality(res); ok || fallback == "" {
			return res, total, nil
		}
	}
	if fallback == "" {
		return Extracted{}, total, fmt.Errorf("%w: %v", ErrPermanent, err)
	}
	res2, u2, err2 := read(ctx, fallback, page)
	total.Add(u2)
	if err2 != nil {
		if err == nil { // keep the weaker first result rather than nothing
			return res, total, nil
		}
		if errors.Is(err2, errBadResult) {
			return Extracted{}, total, fmt.Errorf("%w: %v", ErrPermanent, err2)
		}
		return Extracted{}, total, err2
	}
	return res2, total, nil
}
