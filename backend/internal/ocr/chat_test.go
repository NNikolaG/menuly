package ocr

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

const goodPage = `{"currency_hint":"din","photo_quality":"good","photo_issues":[],"categories":[{"name":"Pića","description":"","items":[
 {"name":"Espresso","description":"","variants":[{"label":"","price_text":"180"}],"name_confidence":0.95,"price_confidence":0.9}]}]}`

const poorPage = `{"currency_hint":"","photo_quality":"poor","photo_issues":["blurry"],"categories":[]}`

// fakeAPI records requests and answers chat completions by model.
type fakeAPI struct {
	mu       sync.Mutex
	requests []map[string]any
	paths    []string
	answer   func(model string) (status int, body string)
}

func (f *fakeAPI) server(t *testing.T) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("authorization header: %q", r.Header.Get("Authorization"))
		}
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		f.mu.Lock()
		f.requests = append(f.requests, body)
		f.paths = append(f.paths, r.URL.Path)
		f.mu.Unlock()
		if r.URL.Path == "/ocr" {
			_, _ = io.WriteString(w, `{"pages":[{"index":0,"markdown":"# Pića\nEspresso 180"},{"index":1,"markdown":"Čaj 150"}],"usage_info":{"pages_processed":2}}`)
			return
		}
		status, content := f.answer(body["model"].(string))
		w.WriteHeader(status)
		if status != 200 {
			_, _ = io.WriteString(w, content)
			return
		}
		resp := map[string]any{
			"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]any{"content": content}}},
			"usage":   map[string]any{"prompt_tokens": 1000, "completion_tokens": 200},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	t.Cleanup(srv.Close)
	return srv
}

var jpegPage = Page{MIME: "image/jpeg", Data: []byte("fake jpeg")}

func TestOpenAIReadsImage(t *testing.T) {
	f := &fakeAPI{answer: func(string) (int, string) { return 200, goodPage }}
	srv := f.server(t)
	c := NewOpenAI(ChatConfig{APIKey: "test-key", BaseURL: srv.URL, Model: "gpt-6-luna", FallbackModel: "gpt-6.1-terra", Effort: "low"})
	res, u, err := c.Extract(context.Background(), jpegPage)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Categories) != 1 || res.Categories[0].Items[0].Name != "Espresso" {
		t.Fatalf("result: %+v", res)
	}
	if len(f.requests) != 1 || f.paths[0] != "/chat/completions" {
		t.Fatalf("expected one chat call, got %v", f.paths)
	}
	req := f.requests[0]
	if req["reasoning_effort"] != "low" || req["max_completion_tokens"] == nil {
		t.Fatalf("openai params: %v", req)
	}
	rf := req["response_format"].(map[string]any)
	if rf["type"] != "json_schema" || rf["json_schema"].(map[string]any)["strict"] != true {
		t.Fatalf("response_format: %v", rf)
	}
	msgs := req["messages"].([]any)
	img := msgs[1].(map[string]any)["content"].([]any)[0].(map[string]any)
	url := img["image_url"].(map[string]any)["url"].(string)
	if img["type"] != "image_url" || !strings.HasPrefix(url, "data:image/jpeg;base64,") {
		t.Fatalf("image part: %v", img)
	}
	// 1000 in * $0.10/M + 200 out * $0.50/M = 100 + 100 micros
	if u.Provider != "openai" || u.Model != "gpt-6-luna" || u.InputTokens != 1000 || u.OutputTokens != 200 || u.CostMicros != 200 {
		t.Fatalf("usage: %+v", u)
	}
}

func TestChatEscalatesPoorPage(t *testing.T) {
	f := &fakeAPI{answer: func(model string) (int, string) {
		if model == "gpt-6-luna" {
			return 200, poorPage
		}
		return 200, goodPage
	}}
	srv := f.server(t)
	c := NewOpenAI(ChatConfig{APIKey: "test-key", BaseURL: srv.URL, Model: "gpt-6-luna", FallbackModel: "gpt-6.1-terra"})
	res, u, err := c.Extract(context.Background(), jpegPage)
	if err != nil {
		t.Fatal(err)
	}
	if res.PhotoQuality != "good" || len(f.requests) != 2 || f.requests[1]["model"] != "gpt-6.1-terra" {
		t.Fatalf("escalation: %+v, %d calls", res, len(f.requests))
	}
	// luna 200 + terra (1000*1.00 + 200*5.00 = 2000)
	if u.Model != "gpt-6.1-terra" || u.InputTokens != 2000 || u.CostMicros != 2200 {
		t.Fatalf("usage: %+v", u)
	}

	// Without a fallback the poor page is returned as is (jobs decide).
	f.requests = nil
	c = NewOpenAI(ChatConfig{APIKey: "test-key", BaseURL: srv.URL, Model: "gpt-6-luna"})
	res, _, err = c.Extract(context.Background(), jpegPage)
	if err != nil || res.PhotoQuality != "poor" || len(f.requests) != 1 {
		t.Fatalf("no fallback: %+v %v %d", res, err, len(f.requests))
	}
}

func TestMistralImageAndPDF(t *testing.T) {
	f := &fakeAPI{answer: func(string) (int, string) { return 200, goodPage }}
	srv := f.server(t)
	c := NewMistral(ChatConfig{APIKey: "test-key", BaseURL: srv.URL, Model: "mistral-small-2603", FallbackModel: "mistral-large-2512"})

	_, u, err := c.Extract(context.Background(), jpegPage)
	if err != nil {
		t.Fatal(err)
	}
	req := f.requests[0]
	img := req["messages"].([]any)[1].(map[string]any)["content"].([]any)[0].(map[string]any)
	if s, ok := img["image_url"].(string); !ok || !strings.HasPrefix(s, "data:image/jpeg;base64,") {
		t.Fatalf("mistral image part: %v", img)
	}
	if req["max_tokens"] == nil || req["reasoning_effort"] != nil {
		t.Fatalf("mistral params: %v", req)
	}
	// 1000 * 0.15 + 200 * 0.60 = 270 micros
	if u.Provider != "mistral" || u.CostMicros != 270 {
		t.Fatalf("usage: %+v", u)
	}

	// A PDF goes through Mistral OCR once, then the chat model reads the text.
	f.requests, f.paths = nil, nil
	_, u, err = c.Extract(context.Background(), Page{MIME: "application/pdf", Data: []byte("%PDF-1.7")})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(f.paths, ",") != "/ocr,/chat/completions" {
		t.Fatalf("pdf calls: %v", f.paths)
	}
	doc := f.requests[0]["document"].(map[string]any)
	if doc["type"] != "document_url" || !strings.HasPrefix(doc["document_url"].(string), "data:application/pdf;base64,") {
		t.Fatalf("ocr document: %v", doc)
	}
	text := f.requests[1]["messages"].([]any)[1].(map[string]any)["content"].([]any)[0].(map[string]any)
	if text["type"] != "text" || !strings.Contains(text["text"].(string), "Espresso 180") || !strings.Contains(text["text"].(string), "--- page 2 ---") {
		t.Fatalf("pdf text part: %v", text)
	}
	// 2 OCR pages * 4000 + chat 270
	if u.CostMicros != 8270 {
		t.Fatalf("pdf usage: %+v", u)
	}
}

func TestChatErrors(t *testing.T) {
	status, body := 400, `{"error":{"message":"bad image"}}`
	f := &fakeAPI{answer: func(string) (int, string) { return status, body }}
	srv := f.server(t)
	c := NewOpenAI(ChatConfig{APIKey: "test-key", BaseURL: srv.URL, Model: "gpt-6-luna", FallbackModel: "gpt-6.1-terra"})

	if _, _, err := c.Extract(context.Background(), jpegPage); !errors.Is(err, ErrPermanent) || !strings.Contains(err.Error(), "bad image") {
		t.Fatalf("400 should be permanent: %v", err)
	}
	status = 429
	if _, _, err := c.Extract(context.Background(), jpegPage); err == nil || errors.Is(err, ErrPermanent) {
		t.Fatalf("429 should be retried: %v", err)
	}
	status = 503
	if _, _, err := c.Extract(context.Background(), jpegPage); err == nil || errors.Is(err, ErrPermanent) {
		t.Fatalf("503 should be retried: %v", err)
	}
	// Invalid JSON from both models is permanent.
	status, body = 200, "not json"
	f.requests = nil
	if _, _, err := c.Extract(context.Background(), jpegPage); !errors.Is(err, ErrPermanent) || len(f.requests) != 2 {
		t.Fatalf("bad output: %v after %d calls", err, len(f.requests))
	}
	if _, _, err := c.Extract(context.Background(), Page{MIME: "text/plain"}); !errors.Is(err, ErrPermanent) {
		t.Fatalf("unsupported type: %v", err)
	}
}

func TestNewPicksProvider(t *testing.T) {
	_, r, err := New(ProviderConfig{MistralAPIKey: "k"})
	if err != nil || r.Provider != "mistral" || r.Model != "mistral-small-2603" || r.FallbackModel != "mistral-large-2512" {
		t.Fatalf("auto mistral: %+v %v", r, err)
	}
	_, r, err = New(ProviderConfig{Provider: "openai", OpenAIAPIKey: "k", MistralAPIKey: "k", FallbackModel: "none"})
	if err != nil || r.Provider != "openai" || r.Model != "gpt-6-luna" || r.FallbackModel != "" {
		t.Fatalf("openai without fallback: %+v %v", r, err)
	}
	if ex, _, err := New(ProviderConfig{}); ex != nil || err != nil {
		t.Fatalf("no key: %v %v", ex, err)
	}
	if _, _, err := New(ProviderConfig{Provider: "openai", MistralAPIKey: "k"}); err == nil {
		t.Fatal("missing key should fail")
	}
	if _, _, err := New(ProviderConfig{Provider: "gemini", OpenAIAPIKey: "k"}); err == nil {
		t.Fatal("unknown provider should fail")
	}
	for _, m := range []string{"gpt-6-luna", "gpt-6.1-terra", "mistral-small-2603", "mistral-large-2512", "claude-haiku-5-5"} {
		if !KnownPrice(m) {
			t.Errorf("no price for default model %s", m)
		}
	}
}
