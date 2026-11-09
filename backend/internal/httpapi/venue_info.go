package httpapi

import (
	"bytes"
	"encoding/json"
	"regexp"
	"unicode/utf8"
)

// Opening hours are stored as {"mon": [["08:00", "23:00"]], ...}: up to three
// [open, close] intervals per weekday. A missing or empty day is closed. A
// close at or before open means the interval runs past midnight ("01:00").
// An empty object means the venue has not set its hours.

var weekdays = []string{"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

var hhmmRe = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)

const maxIntervalsPerDay = 3

// normalizeOpeningHours validates raw and returns it with weekdays in order
// and closed days left out.
func normalizeOpeningHours(raw json.RawMessage) (json.RawMessage, *APIError) {
	b := bytes.TrimSpace(raw)
	if len(b) == 0 || b[0] != '{' {
		return nil, errValidation("opening_hours must be a JSON object")
	}
	var in map[string][][]string
	if err := json.Unmarshal(b, &in); err != nil {
		return nil, errValidation(`opening_hours must look like {"mon": [["08:00", "23:00"]]}`)
	}
	known := map[string]bool{}
	for _, d := range weekdays {
		known[d] = true
	}
	for day, intervals := range in {
		if !known[day] {
			return nil, errValidation("opening_hours keys must be mon, tue, wed, thu, fri, sat, sun")
		}
		if len(intervals) > maxIntervalsPerDay {
			return nil, errValidation("opening_hours allows at most 3 intervals per day")
		}
		for _, iv := range intervals {
			if len(iv) != 2 || !hhmmRe.MatchString(iv[0]) || !hhmmRe.MatchString(iv[1]) {
				return nil, errValidation(`opening_hours intervals must be ["HH:MM", "HH:MM"]`)
			}
			if iv[0] == iv[1] {
				return nil, errValidation("opening_hours interval must not open and close at the same time")
			}
		}
	}
	// Write days in weekday order so the stored JSON is stable.
	var out bytes.Buffer
	out.WriteByte('{')
	first := true
	for _, d := range weekdays {
		if len(in[d]) == 0 {
			continue
		}
		if !first {
			out.WriteByte(',')
		}
		first = false
		k, _ := json.Marshal(d)
		v, _ := json.Marshal(in[d])
		out.Write(k)
		out.WriteByte(':')
		out.Write(v)
	}
	out.WriteByte('}')
	return out.Bytes(), nil
}

// Wi-Fi access modes: how guests get the password.
const (
	wifiAccessMenu  = "menu"  // the password is shown on the public menu
	wifiAccessStaff = "staff" // only the network name; guests ask the staff
)

const (
	maxSSIDLen         = 32 // 802.11 limit, in bytes
	maxWifiPasswordLen = 63 // WPA2 passphrase limit
)

func validateWifi(ssid, password, access *string) *APIError {
	if ssid != nil && len(*ssid) > maxSSIDLen {
		return errValidation("wifi_ssid must be at most 32 bytes")
	}
	if password != nil && (utf8.RuneCountInString(*password) > maxWifiPasswordLen) {
		return errValidation("wifi_password must be at most 63 characters")
	}
	if access != nil && *access != wifiAccessMenu && *access != wifiAccessStaff {
		return errValidation("wifi_access must be menu or staff")
	}
	return nil
}

var errWifiSSIDRequired = errValidation("wifi_ssid is required when wifi_available is true")

// publicWifi is what guests see. Nil when the venue has no Wi-Fi.
type publicWifi struct {
	SSID string `json:"ssid"`
	// Empty unless access is "menu".
	Password string `json:"password"`
	Access   string `json:"access"`
}

func buildPublicWifi(available bool, ssid, password, access string) *publicWifi {
	if !available {
		return nil
	}
	w := &publicWifi{SSID: ssid, Access: access}
	if access == wifiAccessMenu {
		w.Password = password
	}
	return w
}
