package ocr

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ChatConfig configures an extractor that talks to a Chat Completions API:
// OpenAI, Mistral, or any OpenAI-compatible provider (set BaseURL).
type ChatConfig struct {
	APIKey        string
	BaseURL       string // default per provider; no trailing slash
	Model         string
	FallbackModel string // empty disables escalation
	Effort        string // OpenAI reasoning_effort: none | low | medium | high
	HTTPClient    *http.Client
}

// Chat reads menus through a Chat Completions endpoint with a JSON schema
// response format, using the same prompt and schema as the Claude reader.
type Chat struct {
	provider string // "openai" or "mistral"
	cfg      ChatConfig
}

const (
	DefaultOpenAIBaseURL  = "https://api.openai.com/v1"
	DefaultMistralBaseURL = "https://api.mistral.ai/v1"
	mistralOCRModel       = "mistral-ocr-latest"
)

// NewOpenAI reads images and PDFs with an OpenAI model (e.g. gpt-6-luna).
// With BaseURL it works with other OpenAI-compatible APIs that support
// image input and json_schema responses.
func NewOpenAI(cfg ChatConfig) *Chat {
	if cfg.BaseURL == "" {
		cfg.BaseURL = DefaultOpenAIBaseURL
	}
	return newChat("openai", cfg)
}

// NewMistral reads images with a Mistral vision model (e.g.
// mistral-small-2603). PDFs are first turned into text with Mistral OCR.
func NewMistral(cfg ChatConfig) *Chat {
	if cfg.BaseURL == "" {
		cfg.BaseURL = DefaultMistralBaseURL
	}
	return newChat("mistral", cfg)
}

func newChat(provider string, cfg ChatConfig) *Chat {
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 5 * time.Minute}
	}
	return &Chat{provider: provider, cfg: cfg}
}

func (c *Chat) Extract(ctx context.Context, page Page) (Extracted, Usage, error) {
	// A PDF is read to text once with Mistral OCR, not once per model.
	var pdfText string
	var ocrUsage Usage
	if c.provider == "mistral" && page.MIME == "application/pdf" {
		var err error
		if pdfText, ocrUsage, err = c.mistralOCR(ctx, page); err != nil {
			return Extracted{}, ocrUsage, err
		}
	}
	read := func(ctx context.Context, model string, page Page) (Extracted, Usage, error) {
		return c.extractWith(ctx, model, page, pdfText)
	}
	res, u, err := escalate(ctx, read, c.cfg.Model, c.cfg.FallbackModel, page)
	u.InputTokens += ocrUsage.InputTokens
	u.CostMicros += ocrUsage.CostMicros
	return res, u, err
}

type chatMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		FinishReason string `json:"finish_reason"`
		Message      struct {
			Content json.RawMessage `json:"content"`
			Refusal string          `json:"refusal"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int64 `json:"prompt_tokens"`
		CompletionTokens int64 `json:"completion_tokens"`
	} `json:"usage"`
}

func (c *Chat) extractWith(ctx context.Context, model string, page Page, pdfText string) (Extracted, Usage, error) {
	usage := Usage{Provider: c.provider, Model: model}
	dataURL := "data:" + page.MIME + ";base64," + base64.StdEncoding.EncodeToString(page.Data)
	var input map[string]any
	switch {
	case pdfText != "":
		input = map[string]any{"type": "text", "text": "Text of the PDF menu, read by OCR (Markdown, one section per page):\n\n" + pdfText}
	case page.MIME == "application/pdf" && c.provider == "openai":
		input = map[string]any{"type": "file", "file": map[string]any{"filename": "menu.pdf", "file_data": dataURL}}
	case page.MIME == "image/jpeg" || page.MIME == "image/png" || page.MIME == "image/webp" || page.MIME == "image/gif":
		if c.provider == "mistral" {
			input = map[string]any{"type": "image_url", "image_url": dataURL}
		} else {
			input = map[string]any{"type": "image_url", "image_url": map[string]any{"url": dataURL, "detail": "high"}}
		}
	default:
		return Extracted{}, usage, fmt.Errorf("%w: unsupported type %s", ErrPermanent, page.MIME)
	}

	body := map[string]any{
		"model": model,
		"messages": []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: []any{input, map[string]any{"type": "text", "text": "Transcribe this menu."}}},
		},
		"response_format": map[string]any{
			"type":        "json_schema",
			"json_schema": map[string]any{"name": "menu", "strict": true, "schema": extractionSchema()},
		},
	}
	if c.provider == "openai" {
		body["max_completion_tokens"] = 32000 // includes reasoning tokens
		if c.cfg.Effort != "" {
			body["reasoning_effort"] = c.cfg.Effort
		}
	} else {
		body["max_tokens"] = 16000
		body["temperature"] = 0
	}

	var resp chatResponse
	if err := c.post(ctx, "/chat/completions", body, &resp); err != nil {
		return Extracted{}, usage, err
	}
	usage.InputTokens = resp.Usage.PromptTokens
	usage.OutputTokens = resp.Usage.CompletionTokens
	usage.CostMicros = costMicros(model, usage.InputTokens, usage.OutputTokens)
	if len(resp.Choices) == 0 {
		return Extracted{}, usage, fmt.Errorf("%w: no choices in response", errBadResult)
	}
	choice := resp.Choices[0]
	if choice.Message.Refusal != "" || choice.FinishReason == "content_filter" {
		return Extracted{}, usage, fmt.Errorf("%w: the model declined to read this file", ErrPermanent)
	}
	if choice.FinishReason == "length" {
		return Extracted{}, usage, fmt.Errorf("%w: output was cut off", errBadResult)
	}
	text, err := contentText(choice.Message.Content)
	if err != nil {
		return Extracted{}, usage, fmt.Errorf("%w: %v", errBadResult, err)
	}
	var out Extracted
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		return Extracted{}, usage, fmt.Errorf("%w: %v", errBadResult, err)
	}
	return out, usage, nil
}

// contentText accepts a message content that is a string or, as some
// providers return, an array of text parts.
func contentText(raw json.RawMessage) (string, error) {
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s, nil
	}
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err != nil {
		return "", fmt.Errorf("unexpected message content: %s", truncate(string(raw), 200))
	}
	var b strings.Builder
	for _, p := range parts {
		if p.Type == "text" {
			b.WriteString(p.Text)
		}
	}
	return b.String(), nil
}

// mistralOCR turns a PDF into Markdown text, one section per page.
func (c *Chat) mistralOCR(ctx context.Context, page Page) (string, Usage, error) {
	usage := Usage{Provider: c.provider, Model: mistralOCRModel}
	body := map[string]any{
		"model": mistralOCRModel,
		"document": map[string]any{
			"type":         "document_url",
			"document_url": "data:application/pdf;base64," + base64.StdEncoding.EncodeToString(page.Data),
		},
	}
	var resp struct {
		Pages []struct {
			Index    int    `json:"index"`
			Markdown string `json:"markdown"`
		} `json:"pages"`
		UsageInfo struct {
			PagesProcessed int64 `json:"pages_processed"`
		} `json:"usage_info"`
	}
	if err := c.post(ctx, "/ocr", body, &resp); err != nil {
		return "", usage, err
	}
	usage.CostMicros = resp.UsageInfo.PagesProcessed * mistralOCRPageMicros
	var b strings.Builder
	for _, p := range resp.Pages {
		fmt.Fprintf(&b, "--- page %d ---\n%s\n\n", p.Index+1, p.Markdown)
	}
	if strings.TrimSpace(b.String()) == "" {
		return "", usage, fmt.Errorf("%w: OCR found no text in the PDF", ErrPermanent)
	}
	return b.String(), usage, nil
}

// post sends a JSON request and decodes the response. 4xx responses other
// than 408, 409 and 429 are permanent; everything else is retried by the
// job queue.
func (c *Chat) post(ctx context.Context, path string, body, out any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.cfg.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("%s: %w", c.provider, err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 32<<20))
	if err != nil {
		return fmt.Errorf("%s: read response: %w", c.provider, err)
	}
	if res.StatusCode >= 300 {
		err := fmt.Errorf("%s %s: HTTP %d: %s", c.provider, path, res.StatusCode, truncate(string(raw), 500))
		if res.StatusCode >= 400 && res.StatusCode < 500 && res.StatusCode != 408 && res.StatusCode != 409 && res.StatusCode != 429 {
			return fmt.Errorf("%w: %v", ErrPermanent, err)
		}
		return err
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return errors.Join(errBadResult, fmt.Errorf("%s: decode response: %w", c.provider, err))
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
