// Package api embeds the OpenAPI contract so the server can publish it.
package api

import _ "embed"

// OpenAPI is backend/api/openapi.yaml, the contract for the web and iOS apps.
//
//go:embed openapi.yaml
var OpenAPI []byte
