package ocr

import "testing"

func TestParsePriceMinor(t *testing.T) {
	ok := map[string]int64{
		"350":       35000,
		"350,00":    35000,
		"350.00":    35000,
		"350 din":   35000,
		"350 дин.":  35000,
		"350,-":     35000,
		"1.200":     120000,
		"1.200,00":  120000,
		"1,200.00":  120000,
		"1 200 RSD": 120000,
		"12,5 €":    1250,
		"€4.50":     450,
		"2.350.000": 235000000,
		" 90 ":      9000,
	}
	for in, want := range ok {
		got, valid := ParsePriceMinor(in)
		if !valid || got != want {
			t.Errorf("ParsePriceMinor(%q) = %d, %v; want %d", in, got, valid, want)
		}
	}
	for _, in := range []string{"", "350/450", "250-300", "cena po dogovoru", "1.20.0", "12,345,6", "abc!"} {
		if got, valid := ParsePriceMinor(in); valid {
			t.Errorf("ParsePriceMinor(%q) = %d, want invalid", in, got)
		}
	}
}
