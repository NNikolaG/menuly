package ocr

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"
)

// ClaudeConfig configures the Claude-based extractor. Model reads every page;
// FallbackModel re-reads pages whose result fails validation (Quality).
type ClaudeConfig struct {
	APIKey        string
	Model         string // e.g. claude-haiku-5-5
	FallbackModel string // e.g. claude-opus-5-5; empty disables escalation
	Effort        string // low | medium | high
}

type Claude struct {
	client anthropic.Client
	cfg    ClaudeConfig
}

func NewClaude(cfg ClaudeConfig) *Claude {
	return &Claude{client: anthropic.NewClient(option.WithAPIKey(cfg.APIKey)), cfg: cfg}
}

// pricePerMTok is USD per million tokens (input, output). Check current
// prices when changing models; unknown models are recorded with cost 0.
var pricePerMTok = map[string][2]float64{
	"claude-haiku-5-5":  {0.10, 0.50},
	"claude-sonnet-5-5": {2.00, 10.00},
	"claude-opus-5-5":   {4.00, 20.00},
}

func costMicros(model string, in, out int64) int64 {
	p := pricePerMTok[model]
	// tokens * USD/MTok = millionths of a USD
	return int64(float64(in)*p[0] + float64(out)*p[1])
}

const systemPrompt = `You read photos and PDFs of restaurant, café and bar menus, mostly from Serbia and the region, and transcribe them into structured data.

Rules:
- Transcribe exactly what is printed. Keep the original language and script (Serbian Latin or Cyrillic, English). Do not translate, correct or invent anything.
- Group items under the category headings printed on the menu, in reading order (follow columns top to bottom, left to right). Items printed before any heading go into a category with an empty name.
- An item with several sizes or portions (for example "0,33 l / 0,5 l", "mala / velika") has one variant per size, each with its own price. An item with a single price has one variant with an empty label.
- price_text is the price exactly as printed for that variant, including any currency mark ("350", "1.200,00 din"). Leave it empty if no price is printed. Never compute or guess prices.
- description is the smaller text that describes an item (ingredients, weight); empty if none.
- name_confidence and price_confidence are your confidence from 0 to 1 that the name and the price(s) were read correctly; lower them for blurry, cut-off or ambiguous text.
- currency_hint is the currency mark printed anywhere on the page ("din", "RSD", "€"), or empty.
- Ignore decorations, addresses, opening hours and prose that are not menu items.`

func extractionSchema() map[string]any {
	str := map[string]any{"type": "string"}
	num := map[string]any{"type": "number"}
	obj := func(props map[string]any) map[string]any {
		req := make([]string, 0, len(props))
		for k := range props {
			req = append(req, k)
		}
		return map[string]any{"type": "object", "properties": props, "required": req, "additionalProperties": false}
	}
	arr := func(items map[string]any) map[string]any { return map[string]any{"type": "array", "items": items} }
	variant := obj(map[string]any{"label": str, "price_text": str})
	item := obj(map[string]any{
		"name": str, "description": str, "variants": arr(variant),
		"name_confidence": num, "price_confidence": num,
	})
	category := obj(map[string]any{"name": str, "description": str, "items": arr(item)})
	return obj(map[string]any{"currency_hint": str, "categories": arr(category)})
}

// Extract reads a page with the primary model and, if the result fails
// validation, once more with the fallback model.
func (c *Claude) Extract(ctx context.Context, page Page) (Extracted, Usage, error) {
	var total Usage
	res, u, err := c.extractWith(ctx, c.cfg.Model, page)
	total.Add(u)
	if err != nil && !errors.Is(err, errBadResult) {
		return Extracted{}, total, err
	}
	if err == nil {
		if ok, _ := Quality(res); ok || c.cfg.FallbackModel == "" {
			return res, total, nil
		}
	}
	if c.cfg.FallbackModel == "" {
		return Extracted{}, total, fmt.Errorf("%w: %v", ErrPermanent, err)
	}
	res2, u2, err2 := c.extractWith(ctx, c.cfg.FallbackModel, page)
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

// errBadResult means the model answered but the answer is unusable
// (truncated or not valid JSON); a stronger model may do better.
var errBadResult = errors.New("unusable model output")

func (c *Claude) extractWith(ctx context.Context, model string, page Page) (Extracted, Usage, error) {
	usage := Usage{Provider: "anthropic", Model: model}
	b64 := base64.StdEncoding.EncodeToString(page.Data)
	var input anthropic.ContentBlockParamUnion
	switch page.MIME {
	case "application/pdf":
		input = anthropic.NewDocumentBlock(anthropic.Base64PDFSourceParam{Data: b64})
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		input = anthropic.NewImageBlockBase64(page.MIME, b64)
	default:
		return Extracted{}, usage, fmt.Errorf("%w: unsupported type %s", ErrPermanent, page.MIME)
	}

	effort := anthropic.OutputConfigEffort(c.cfg.Effort)
	if effort == "" {
		effort = anthropic.OutputConfigEffortMedium
	}
	resp, err := c.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     model,
		MaxTokens: 16000,
		System:    []anthropic.TextBlockParam{{Text: systemPrompt, CacheControl: anthropic.NewCacheControlEphemeralParam()}},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(input, anthropic.NewTextBlock("Transcribe this menu.")),
		},
		OutputConfig: anthropic.OutputConfigParam{
			Effort: effort,
			Format: anthropic.JSONOutputFormatParam{Schema: extractionSchema()},
		},
	})
	if err != nil {
		var apiErr *anthropic.Error
		if errors.As(err, &apiErr) && apiErr.StatusCode >= 400 && apiErr.StatusCode < 500 && apiErr.StatusCode != 408 && apiErr.StatusCode != 409 && apiErr.StatusCode != 429 {
			return Extracted{}, usage, fmt.Errorf("%w: %v", ErrPermanent, err)
		}
		return Extracted{}, usage, err // transient: the job queue retries
	}
	usage.InputTokens = resp.Usage.InputTokens + resp.Usage.CacheCreationInputTokens + resp.Usage.CacheReadInputTokens
	usage.OutputTokens = resp.Usage.OutputTokens
	usage.CostMicros = costMicros(model, usage.InputTokens, usage.OutputTokens)

	switch resp.StopReason {
	case anthropic.StopReasonRefusal:
		return Extracted{}, usage, fmt.Errorf("%w: the model declined to read this file", ErrPermanent)
	case anthropic.StopReasonMaxTokens:
		return Extracted{}, usage, fmt.Errorf("%w: output was cut off", errBadResult)
	}
	var text strings.Builder
	for _, block := range resp.Content {
		if t, ok := block.AsAny().(anthropic.TextBlock); ok {
			text.WriteString(t.Text)
		}
	}
	var out Extracted
	if err := json.Unmarshal([]byte(text.String()), &out); err != nil {
		return Extracted{}, usage, fmt.Errorf("%w: %v", errBadResult, err)
	}
	return out, usage, nil
}
