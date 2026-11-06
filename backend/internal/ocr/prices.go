package ocr

// pricePerMTok is USD per million tokens (input, output) at standard
// (non-batch) rates, checked 2026-11-06. Check current prices when changing
// models: an unknown model is recorded with cost 0 (KnownPrice reports it).
var pricePerMTok = map[string][2]float64{
	// Anthropic
	"claude-haiku-5-5":  {0.10, 0.50},
	"claude-sonnet-5-5": {2.00, 10.00},
	"claude-opus-5-5":   {4.00, 20.00},
	// OpenAI
	"gpt-6-luna":    {0.10, 0.50},
	"gpt-6.1-terra": {1.00, 5.00},
	"gpt-6.1-sol":   {2.00, 10.00},
	"gpt-5.6-luna":  {0.20, 1.20},
	// Mistral
	"mistral-small-2603": {0.15, 0.60},
	"mistral-large-2512": {0.50, 1.50},
	"ministral-14b-2512": {0.20, 0.20},
}

// mistralOCRPageMicros is Mistral OCR's price per page ($4 per 1000 pages),
// paid for PDFs, which are read to text before the chat model structures them.
const mistralOCRPageMicros = 4000

// KnownPrice reports whether the cost of a model's pages can be recorded.
func KnownPrice(model string) bool {
	_, ok := pricePerMTok[model]
	return ok
}

func costMicros(model string, in, out int64) int64 {
	p := pricePerMTok[model]
	// tokens * USD/MTok = millionths of a USD
	return int64(float64(in)*p[0] + float64(out)*p[1])
}
