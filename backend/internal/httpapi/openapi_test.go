package httpapi

import (
	"net/http"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"gopkg.in/yaml.v3"

	"github.com/nnikolag/menuly/backend/api"
)

var paramRe = regexp.MustCompile(`\{[^}]+\}`)

func normalizeRoute(method, path string) string {
	if len(path) > 1 {
		path = strings.TrimSuffix(path, "/")
	}
	return strings.ToUpper(method) + " " + paramRe.ReplaceAllString(path, "{}")
}

// TestOpenAPICoversRoutes keeps api/openapi.yaml in sync with the router:
// every route must be documented and every documented operation must exist.
func TestOpenAPICoversRoutes(t *testing.T) {
	var spec struct {
		Paths map[string]map[string]any `yaml:"paths"`
	}
	if err := yaml.Unmarshal(api.OpenAPI, &spec); err != nil {
		t.Fatalf("openapi.yaml does not parse: %v", err)
	}
	documented := map[string]bool{}
	for path, ops := range spec.Paths {
		for method := range ops {
			switch method {
			case "get", "post", "put", "patch", "delete":
				documented[normalizeRoute(method, path)] = true
			}
		}
	}

	routes := map[string]bool{}
	h := New(nil, nil).Handler(Options{DocsEnabled: true})
	err := chi.Walk(h.(chi.Routes), func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if method == http.MethodOptions || method == http.MethodHead {
			return nil
		}
		routes[normalizeRoute(method, route)] = true
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	var missing, stale []string
	for r := range routes {
		if !documented[r] {
			missing = append(missing, r)
		}
	}
	for d := range documented {
		if !routes[d] {
			stale = append(stale, d)
		}
	}
	sort.Strings(missing)
	sort.Strings(stale)
	if len(missing) > 0 {
		t.Errorf("routes missing from api/openapi.yaml:\n  %s", strings.Join(missing, "\n  "))
	}
	if len(stale) > 0 {
		t.Errorf("api/openapi.yaml documents routes that do not exist:\n  %s", strings.Join(stale, "\n  "))
	}
}
