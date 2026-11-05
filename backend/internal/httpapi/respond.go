package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
)

// APIError is the single error shape returned by the API:
//
//	{"error": {"code": "slug_taken", "message": "..."}}
type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *APIError) Error() string { return e.Code + ": " + e.Message }

func errBadRequest(code, msg string) *APIError {
	return &APIError{Status: http.StatusBadRequest, Code: code, Message: msg}
}

func errValidation(msg string) *APIError {
	return &APIError{Status: http.StatusUnprocessableEntity, Code: "validation_failed", Message: msg}
}

var (
	errUnauthorized = &APIError{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "missing or invalid credentials"}
	errForbidden    = &APIError{Status: http.StatusForbidden, Code: "forbidden", Message: "not allowed for your role"}
	errNotFound     = &APIError{Status: http.StatusNotFound, Code: "not_found", Message: "resource not found"}
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// writeError maps err to a response. Unknown errors are logged and returned
// as a generic 500 so internals never leak to clients.
func writeError(w http.ResponseWriter, r *http.Request, err error) {
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		slog.ErrorContext(r.Context(), "unhandled error", "err", err, "path", r.URL.Path)
		apiErr = &APIError{Status: http.StatusInternalServerError, Code: "internal", Message: "internal server error"}
	}
	writeJSON(w, apiErr.Status, map[string]any{"error": apiErr})
}

const maxBodyBytes = 1 << 20

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		if errors.Is(err, io.EOF) {
			return errBadRequest("invalid_json", "request body is empty")
		}
		return errBadRequest("invalid_json", fmt.Sprintf("invalid JSON body: %v", err))
	}
	if dec.More() {
		return errBadRequest("invalid_json", "request body must contain a single JSON object")
	}
	return nil
}

func trim(s string) string { return strings.TrimSpace(s) }
