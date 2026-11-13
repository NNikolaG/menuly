package httpapi

import (
	"bytes"
	"encoding/json"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
)

// Opening hours are stored as {"mon": [["08:00", "23:00"]], ...}: up to three
// [open, close] intervals per weekday. A missing or empty day is closed. A
// close at or before open means the interval runs past midnight ("01:00").
// An empty object means the venue has not set its hours.

var weekdays = []string{"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

var hhmmRe = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)

const maxIntervalsPerDay = 3

// normalizeOpeningHours validates raw and returns it with closed days left
// out. (jsonb does not keep key order, so readers must not rely on it.)
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

// Kinds of venue; each maps to a schema.org type on the guest menu page.
const venueTypeOther = "other"

var venueTypes = map[string]bool{
	"restaurant": true, "cafe": true, "bar": true, "fast_food": true,
	"bakery": true, "pastry_shop": true, venueTypeOther: true,
}

var countryRe = regexp.MustCompile(`^[A-Z]{2}$`)

const (
	maxCityLen        = 80
	maxPostalCodeLen  = 16
	maxCuisines       = 5
	maxCuisineLen     = 40
	maxDescriptionLen = 300
)

// normalizeSEO validates the fields search engines read: type, city, postal
// code, country, coordinates, cuisine and description.
func (in *venueInput) normalizeSEO() *APIError {
	if in.VenueType != nil && !venueTypes[*in.VenueType] {
		return errValidation("venue_type must be restaurant, cafe, bar, fast_food, bakery, pastry_shop or other")
	}
	if in.City != nil && utf8.RuneCountInString(*in.City) > maxCityLen {
		return errValidation("city must be at most 80 characters")
	}
	if in.PostalCode != nil && utf8.RuneCountInString(*in.PostalCode) > maxPostalCodeLen {
		return errValidation("postal_code must be at most 16 characters")
	}
	if in.Country != nil {
		*in.Country = strings.ToUpper(*in.Country)
		if !countryRe.MatchString(*in.Country) {
			return errValidation("country must be an ISO 3166-1 alpha-2 code, e.g. RS")
		}
	}
	if in.Description != nil && utf8.RuneCountInString(*in.Description) > maxDescriptionLen {
		return errValidation("description must be at most 300 characters")
	}
	if in.Cuisine != nil {
		out := make([]string, 0, len(*in.Cuisine))
		for _, c := range *in.Cuisine {
			c = trim(c)
			if c == "" || slices.ContainsFunc(out, func(o string) bool { return strings.EqualFold(o, c) }) {
				continue
			}
			if utf8.RuneCountInString(c) > maxCuisineLen {
				return errValidation("each cuisine must be at most 40 characters")
			}
			out = append(out, c)
		}
		if len(out) > maxCuisines {
			return errValidation("cuisine may list at most 5 entries")
		}
		*in.Cuisine = out
	}
	return in.normalizeLocation()
}

func (in *venueInput) normalizeLocation() *APIError {
	if in.Latitude == nil && in.Longitude == nil {
		return nil
	}
	errPair := errValidation("latitude and longitude must be sent together: two numbers, or two nulls to clear")
	if in.Latitude == nil || in.Longitude == nil {
		return errPair
	}
	var lat, lng *float64
	if json.Unmarshal(in.Latitude, &lat) != nil || json.Unmarshal(in.Longitude, &lng) != nil || (lat == nil) != (lng == nil) {
		return errPair
	}
	if lat != nil && (*lat < -90 || *lat > 90 || *lng < -180 || *lng > 180) {
		return errValidation("latitude must be within -90..90 and longitude within -180..180")
	}
	in.setLocation, in.lat, in.lng = true, lat, lng
	return nil
}

func cuisineOr(p *[]string) []string {
	if p == nil {
		return []string{}
	}
	return *p
}
