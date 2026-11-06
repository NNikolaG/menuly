package ocr

import (
	"strconv"
	"strings"
	"unicode"
)

// ParsePriceMinor turns a price as printed on a Serbian menu into minor
// units (para). It understands "350", "350,00", "350 din", "1.200",
// "1.200,00", "1,200.00", "1 200 RSD". It rejects ranges ("350/450"),
// empty strings and anything ambiguous.
func ParsePriceMinor(text string) (int64, bool) {
	s := strings.ToLower(strings.TrimSpace(text))
	if s == "" || strings.ContainsAny(s, "/–—") || strings.Count(s, "-") > 0 && !strings.HasSuffix(s, ",-") && !strings.HasSuffix(s, ".-") {
		return 0, false
	}
	s = strings.TrimSuffix(strings.TrimSuffix(s, ",-"), ".-")

	var b strings.Builder
	for _, r := range s {
		switch {
		case unicode.IsDigit(r), r == '.', r == ',':
			b.WriteRune(r)
		case unicode.IsSpace(r), unicode.IsLetter(r), r == '€', r == '$', r == ' ':
			// currency words, symbols and thousand-separating spaces
		default:
			return 0, false
		}
	}
	s = strings.Trim(b.String(), ".,")
	if s == "" {
		return 0, false
	}

	intPart, frac := s, ""
	lastDot, lastComma := strings.LastIndex(s, "."), strings.LastIndex(s, ",")
	switch {
	case lastDot >= 0 && lastComma >= 0:
		// Both present: the last one is the decimal separator.
		dec := max(lastDot, lastComma)
		intPart, frac = s[:dec], s[dec+1:]
	case lastDot >= 0 || lastComma >= 0:
		sep := "."
		if lastComma >= 0 {
			sep = ","
		}
		parts := strings.Split(s, sep)
		last := parts[len(parts)-1]
		if len(parts) == 2 && len(last) <= 2 {
			intPart, frac = parts[0], last
		} else {
			// "1.200" or "1.200.000": thousands separators
			for _, p := range parts[1:] {
				if len(p) != 3 {
					return 0, false
				}
			}
			intPart = strings.Join(parts, "")
		}
	}
	intPart = strings.NewReplacer(".", "", ",", "").Replace(intPart)
	if intPart == "" || len(frac) > 2 || strings.ContainsAny(frac, ".,") {
		return 0, false
	}
	whole, err := strconv.ParseInt(intPart, 10, 64)
	if err != nil || whole > 100_000_000 {
		return 0, false
	}
	cents := int64(0)
	if frac != "" {
		if len(frac) == 1 {
			frac += "0"
		}
		c, err := strconv.ParseInt(frac, 10, 64)
		if err != nil {
			return 0, false
		}
		cents = c
	}
	return whole*100 + cents, true
}

// DetectCurrency guesses an ISO code from a price text or hint.
func DetectCurrency(text string) string {
	s := strings.ToLower(text)
	switch {
	case strings.Contains(s, "€") || strings.Contains(s, "eur"):
		return "EUR"
	case strings.Contains(s, "din") || strings.Contains(s, "rsd") || strings.Contains(s, "дин"):
		return "RSD"
	case strings.Contains(s, "km") || strings.Contains(s, "bam"):
		return "BAM"
	}
	return ""
}
