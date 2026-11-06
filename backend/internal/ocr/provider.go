package ocr

import (
	"fmt"
	"strings"
)

// Providers and their default models: a cheap model that reads every page
// and a stronger one for pages whose result looks wrong.
var providerDefaults = map[string][2]string{
	"anthropic": {"claude-haiku-5-5", "claude-opus-5-5"},
	"openai":    {"gpt-6-luna", "gpt-6.1-terra"},
	"mistral":   {"mistral-small-2603", "mistral-large-2512"},
}

// ProviderConfig is the OCR part of the app config.
type ProviderConfig struct {
	Provider        string // anthropic | openai | mistral; empty picks the first with a key
	Model           string // empty: provider default
	FallbackModel   string // empty: provider default; "none" disables escalation
	Effort          string
	AnthropicAPIKey string
	OpenAIAPIKey    string
	OpenAIBaseURL   string
	MistralAPIKey   string
}

// Resolved says what New picked, for logging.
type Resolved struct {
	Provider, Model, FallbackModel string
}

// New builds the extractor for the configured provider. It returns a nil
// extractor (and no error) when no provider has an API key, so imports
// fail with "OCR is not configured".
func New(cfg ProviderConfig) (MenuExtractor, Resolved, error) {
	keys := map[string]string{"anthropic": cfg.AnthropicAPIKey, "openai": cfg.OpenAIAPIKey, "mistral": cfg.MistralAPIKey}
	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))
	if provider == "" {
		for _, p := range []string{"anthropic", "openai", "mistral"} {
			if keys[p] != "" {
				provider = p
				break
			}
		}
		if provider == "" {
			return nil, Resolved{}, nil
		}
	}
	defaults, ok := providerDefaults[provider]
	if !ok {
		return nil, Resolved{}, fmt.Errorf("OCR_PROVIDER must be anthropic, openai or mistral, not %q", cfg.Provider)
	}
	if keys[provider] == "" {
		return nil, Resolved{}, fmt.Errorf("OCR_PROVIDER=%s needs %s_API_KEY", provider, strings.ToUpper(provider))
	}
	r := Resolved{Provider: provider, Model: cfg.Model, FallbackModel: cfg.FallbackModel}
	if r.Model == "" {
		r.Model = defaults[0]
	}
	switch r.FallbackModel {
	case "":
		r.FallbackModel = defaults[1]
	case "none", "off":
		r.FallbackModel = ""
	}
	chat := ChatConfig{APIKey: keys[provider], Model: r.Model, FallbackModel: r.FallbackModel, Effort: cfg.Effort}
	switch provider {
	case "anthropic":
		return NewClaude(ClaudeConfig{APIKey: keys[provider], Model: r.Model, FallbackModel: r.FallbackModel, Effort: cfg.Effort}), r, nil
	case "openai":
		chat.BaseURL = cfg.OpenAIBaseURL
		return NewOpenAI(chat), r, nil
	default:
		return NewMistral(chat), r, nil
	}
}
