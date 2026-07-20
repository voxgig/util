/* Copyright © 2024-2025 Voxgig Ltd, MIT License. */

package util

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

// jsTruthy reports whether v is truthy under JavaScript rules. The falsy values
// are false, 0 (and -0), "", nil (null/undefined) and NaN; everything else —
// including any map or slice — is truthy. Used where the canonical TS relies on
// `if (value)` rather than a presence check.
func jsTruthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case string:
		return x != ""
	case float64:
		return x != 0 && !math.IsNaN(x)
	case float32:
		return x != 0 && !math.IsNaN(float64(x))
	case int:
		return x != 0
	case int64:
		return x != 0
	default:
		return true
	}
}

// Version is the released version of the Go module. It is rewritten by
// `make publish-go V=x.y.z` to match the git tag (go/vx.y.z).
const Version = "0.1.4"

// Camelify converts a kebab-case string (or slice of strings) to PascalCase.
// Example: "foo-bar" => "FooBar"
func Camelify(input string) string {
	parts := strings.Split(input, "-")
	return camelifyParts(parts)
}

// CamelifySlice converts a slice of strings to PascalCase.
func CamelifySlice(input []string) string {
	return camelifyParts(input)
}

func camelifyParts(parts []string) string {
	var sb strings.Builder
	for _, p := range parts {
		if p == "" {
			continue
		}
		runes := []rune(p)
		runes[0] = unicode.ToUpper(runes[0])
		sb.WriteString(string(runes))
	}
	return sb.String()
}

// DiveEntry represents a single entry returned by Dive: a path and its value.
type DiveEntry struct {
	Path  []string
	Value any
}

// Dive traverses a nested map to the specified depth (default 2),
// returning a slice of DiveEntry with [path, value] pairs.
func Dive(node map[string]any, depth ...int) []DiveEntry {
	d := 2
	if len(depth) > 0 {
		d = depth[0]
	}
	var items []DiveEntry
	diveInternal(node, d, nil, &items)
	return items
}

func hasOwnKeys(m map[string]any) bool {
	for range m {
		return true
	}
	return false
}

// diveRecursable reports whether a child value should be descended into (rather
// than emitted as a leaf): a non-empty object or a non-empty array. Mirrors the
// canonical TS test `'object' === typeof child && hasOwnKeys(child)`.
func diveRecursable(child any) bool {
	switch c := child.(type) {
	case map[string]any:
		return hasOwnKeys(c)
	case []any:
		return len(c) > 0
	default:
		return false
	}
}

func diveInternal(node any, d int, prefix []string, items *[]DiveEntry) {
	// Build the ordered key list and a value accessor per node kind. Object keys
	// are visited in sorted order (Go map iteration is randomised); array indices
	// in numeric order (0,1,…,10,11) — both matching the canonical TS.
	var keys []string
	var get func(string) any
	switch n := node.(type) {
	case map[string]any:
		if n == nil {
			return
		}
		keys = make([]string, 0, len(n))
		for k := range n {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		get = func(k string) any { return n[k] }
	case []any:
		keys = make([]string, 0, len(n))
		for i := range n {
			keys = append(keys, strconv.Itoa(i))
		}
		get = func(k string) any { i, _ := strconv.Atoi(k); return n[i] }
	default:
		return
	}
	for _, key := range keys {
		child := get(key)
		if key == "$" {
			pathCopy := make([]string, len(prefix))
			copy(pathCopy, prefix)
			*items = append(*items, DiveEntry{Path: pathCopy, Value: child})
		} else if d > 1 && diveRecursable(child) {
			newPrefix := append(append([]string{}, prefix...), key)
			diveInternal(child, d-1, newPrefix, items)
		} else {
			newPath := append(append([]string{}, prefix...), key)
			*items = append(*items, DiveEntry{Path: newPath, Value: child})
		}
	}
}

// DiveMapper transforms a Dive entry (path and leaf value) into a key/value
// pair. Returning ok=false omits the entry from the DiveMap result.
type DiveMapper func(path []string, leaf any) (key string, value any, ok bool)

// DiveMap traverses like Dive, then maps each entry through mapper, collecting
// the results into a map keyed by the mapper's returned key. It mirrors the
// mapper form of the canonical TS dive(node, mapper).
func DiveMap(node map[string]any, mapper DiveMapper, depth ...int) map[string]any {
	entries := Dive(node, depth...)
	result := make(map[string]any, len(entries))
	for _, entry := range entries {
		if key, value, ok := mapper(entry.Path, entry.Value); ok {
			result[key] = value
		}
	}
	return result
}

// Get retrieves a deeply nested value from a map using a dot-separated path.
// Example: Get(map, "a.b") returns map["a"]["b"]
func Get(root any, path string) any {
	return GetPath(root, strings.Split(path, "."))
}

// GetPath retrieves a deeply nested value from a map (or slice) using a path
// slice. Numeric path segments index into []any, mirroring how the canonical
// TS get walks both objects and arrays.
func GetPath(root any, path []string) any {
	node := root
	for _, key := range path {
		if node == nil {
			return nil
		}
		switch m := node.(type) {
		case map[string]any:
			node = m[key]
		case []any:
			// Only canonical non-negative integer segments index a slice,
			// matching JS array indexing (which rejects "01", "+1", "-1", etc.).
			idx, err := strconv.Atoi(key)
			if err != nil || idx < 0 || idx >= len(m) || strconv.Itoa(idx) != key {
				return nil
			}
			node = m[idx]
		default:
			return nil
		}
	}
	return node
}

// Joins joins array elements with hierarchical separators.
// Example: Joins(["a","1","b","2","c","3","d","4"], ":", ",", "/")
//
//	=> "a:1,b:2/c:3,d:4"
func Joins(arr []any, seps ...string) string {
	if len(arr) == 0 {
		return ""
	}
	var sb strings.Builder
	for i, v := range arr {
		sb.WriteString(toString(v))
		if i < len(arr)-1 {
			for j := len(seps) - 1; j >= 0; j-- {
				if (i+1)%(1<<j) == 0 {
					sb.WriteString(seps[j])
					break
				}
			}
		}
	}
	return sb.String()
}

// toString renders a value the way JS Array.join would, so Joins output
// matches the canonical TS implementation.
func toString(v any) string {
	switch val := v.(type) {
	case nil:
		// JS Array.join renders null/undefined as the empty string.
		return ""
	case string:
		return val
	case int:
		return strconv.Itoa(val)
	case int64:
		return strconv.FormatInt(val, 10)
	case float64:
		// Match JS String() for non-finite and signed-zero values first.
		if math.IsInf(val, 1) {
			return "Infinity"
		}
		if math.IsInf(val, -1) {
			return "-Infinity"
		}
		if val == 0 {
			// Normalise -0 to "0" (JS String(-0) === "0"); FormatFloat keeps the sign.
			return "0"
		}
		// 'f' with precision -1 gives the shortest round-trippable fixed-point
		// form, matching JS String(): whole numbers print without ".0" (2 not
		// "2.0") and full digits are kept (1234567 not "1.234567e+06"). Only the
		// extreme magnitudes where JS switches to exponential (>=1e21, <1e-6)
		// diverge, which never occur in pin/path joins.
		return strconv.FormatFloat(val, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(val)
	default:
		b, _ := json.Marshal(val)
		return string(b)
	}
}

// Pinify converts a path slice to pin notation with alternating : and , separators.
// Example: ["a","b","c","d"] => "a:b,c:d"
func Pinify(path []string) string {
	var sb strings.Builder
	for i, p := range path {
		sb.WriteString(p)
		// Matches the canonical TS behaviour: ':' is emitted after every
		// even-indexed element (including the last), while ',' after an
		// odd-indexed element is suppressed only on the final element.
		if i%2 == 0 {
			sb.WriteString(":")
		} else if i < len(path)-1 {
			sb.WriteString(",")
		}
	}
	return sb.String()
}

// OrderItem represents an item in an ordered collection.
type OrderItem struct {
	Key    string
	Title  string
	Fields map[string]any
}

// OrderSpec defines how items should be ordered.
type OrderSpec struct {
	Sort    string
	Exclude string
	Include string
}

// Order orders and filters a map of items according to the spec.
func Order(itemMap map[string]map[string]any, spec *OrderSpec) []map[string]any {
	items := make([]map[string]any, 0, len(itemMap))
	// Go maps have no insertion order, so iterate keys in sorted order for a
	// deterministic result. (Pass an explicit Sort to control ordering.)
	keys := make([]string, 0, len(itemMap))
	for k := range itemMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, k := range keys {
		item := copyMap(itemMap[k])
		// Mirror TS `key: v.key ?? k`: fall back to the map key when the preset
		// key is absent OR nil (a present-but-nil key would otherwise be dropped
		// by the string-typed filter/sort guards below).
		if v, ok := item["key"]; !ok || v == nil {
			item["key"] = k
		}
		items = append(items, item)
	}

	if spec == nil {
		return items
	}

	items = orderSort(items, spec)
	items = orderExclude(items, spec)
	items = orderInclude(items, spec)

	return items
}

func copyMap(m map[string]any) map[string]any {
	result := make(map[string]any, len(m))
	for k, v := range m {
		result[k] = v
	}
	return result
}

func orderSort(items []map[string]any, spec *OrderSpec) []map[string]any {
	if spec.Sort == "" {
		return items
	}

	keyOrder := splitTokens(spec.Sort)

	keyOrderSet := make(map[string]bool)
	for _, k := range keyOrder {
		if k != "human$" && k != "alpha$" {
			keyOrderSet[k] = true
		}
	}

	var finalKeys []string
	for _, k := range keyOrder {
		switch k {
		case "alpha$":
			filtered := filterItems(items, keyOrderSet)
			// Stable so equal titles keep the (key-sorted) input order,
			// matching JS's stable Array.sort.
			sort.SliceStable(filtered, func(i, j int) bool {
				ti := getTitle(filtered[i])
				tj := getTitle(filtered[j])
				return ti < tj
			})
			for _, item := range filtered {
				finalKeys = append(finalKeys, item["key"].(string))
			}
		case "human$":
			filtered := filterItems(items, keyOrderSet)
			maxLen := 0
			for _, item := range filtered {
				t := getTitle(item)
				// UTF-16 code-unit length, matching JS String.length exactly.
				if l := utf16Len(t); l > maxLen {
					maxLen = l
				}
			}
			padLen := maxLen + 1
			for _, item := range filtered {
				t := getTitle(item)
				padded := padStart(t, padLen, '0')
				item["title$"] = padded
			}
			sort.SliceStable(filtered, func(i, j int) bool {
				return filtered[i]["title$"].(string) < filtered[j]["title$"].(string)
			})
			for _, item := range filtered {
				finalKeys = append(finalKeys, item["key"].(string))
			}
		default:
			finalKeys = append(finalKeys, k)
		}
	}

	// Reuse the already-copied items (which carry "key" and any title$ set by
	// human$) via a single key lookup, instead of re-copying and rescanning
	// all items for every final key.
	byKey := make(map[string]map[string]any, len(items))
	for _, it := range items {
		if k, ok := it["key"].(string); ok {
			byKey[k] = it
		}
	}

	result := make([]map[string]any, 0, len(finalKeys))
	for _, k := range finalKeys {
		if item, ok := byKey[k]; ok {
			result = append(result, item)
		}
	}

	return result
}

func filterItems(items []map[string]any, excludeSet map[string]bool) []map[string]any {
	var result []map[string]any
	for _, item := range items {
		if key, ok := item["key"].(string); ok && !excludeSet[key] {
			result = append(result, item)
		}
	}
	return result
}

// getTitle returns the item's title coerced to a string the way the canonical
// TS does (`” + (title ?? ”)`): a missing/nil title is "", and a non-string
// title (number, bool, …) is string-coerced via toString rather than dropped.
func getTitle(item map[string]any) string {
	return toString(item["title"])
}

// utf16Len counts the UTF-16 code units in s, matching JS String.length exactly
// (a code point >= U+10000 counts as 2, the surrogate pair). Equals the rune
// count for Basic-Multilingual-Plane text.
func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		if r > 0xFFFF {
			n += 2
		} else {
			n++
		}
	}
	return n
}

// padStart left-pads s to length measured in UTF-16 code units, matching JS
// String.padStart / String.length.
func padStart(s string, length int, pad rune) string {
	n := utf16Len(s)
	if n >= length {
		return s
	}
	return strings.Repeat(string(pad), length-n) + s
}

func orderExclude(items []map[string]any, spec *OrderSpec) []map[string]any {
	if spec.Exclude == "" {
		return items
	}
	excludes := splitTokens(spec.Exclude)
	excludeSet := make(map[string]bool)
	for _, e := range excludes {
		excludeSet[e] = true
	}
	var result []map[string]any
	for _, item := range items {
		if key, ok := item["key"].(string); ok && !excludeSet[key] {
			result = append(result, item)
		}
	}
	return result
}

func orderInclude(items []map[string]any, spec *OrderSpec) []map[string]any {
	if spec.Include == "" {
		return items
	}
	includes := splitTokens(spec.Include)
	includeSet := make(map[string]bool)
	for _, inc := range includes {
		includeSet[inc] = true
	}
	var result []map[string]any
	for _, item := range items {
		if key, ok := item["key"].(string); ok && includeSet[key] {
			result = append(result, item)
		}
	}
	return result
}

// orderTokenSep matches the JS split pattern /\s*,\s*/ used by order: commas
// with any surrounding whitespace. Splitting with it (and keeping empty tokens)
// reproduces the canonical TS token list exactly.
var orderTokenSep = regexp.MustCompile(`\s*,\s*`)

func splitTokens(s string) []string {
	return orderTokenSep.Split(s, -1)
}

// Entity processes a model to extract entity field validation.
func Entity(model map[string]any) map[string]any {
	// A missing/non-map main or ent yields an empty map (matching TS, whose
	// dive of undefined produces no entries), not nil.
	main, _ := model["main"].(map[string]any)
	if main == nil {
		return map[string]any{}
	}
	ent, _ := main["ent"].(map[string]any)
	if ent == nil {
		return map[string]any{}
	}

	entries := Dive(ent)
	entMap := make(map[string]any)

	for _, entry := range entries {
		path := entry.Path
		// Skip malformed entries that don't resolve to a base/name pair
		// (guards the path[0]/path[1] access below).
		if len(path) < 2 {
			continue
		}
		entVal, ok := entry.Value.(map[string]any)
		if !ok {
			continue
		}

		valid := make(map[string]any)
		if v, ok := entVal["valid"].(map[string]any); ok {
			for k, val := range v {
				valid[k] = val
			}
		}

		fieldMap, ok := entVal["field"].(map[string]any)
		if !ok {
			continue
		}

		for name, fieldVal := range fieldMap {
			field, ok := fieldVal.(map[string]any)
			if !ok {
				continue
			}

			// Mirror the canonical TS exactly, including its null/undefined
			// distinction: fv is "defined" if a kind key is present (even nil) or
			// a truthy valid supplies a value; an undefined fv omits the key.
			kindVal, hasKind := field["kind"]
			var fv any
			hasFv := false
			if hasKind {
				fv = kindVal
				hasFv = true
			}
			if jsTruthy(field["valid"]) {
				if s, ok := field["valid"].(string); ok {
					// A null/undefined kind coerces to "" (not "undefined").
					base := ""
					if kindVal != nil {
						base = toString(kindVal)
					}
					fv = base + "." + s
				} else {
					fv = field["valid"]
				}
				hasFv = true
			}
			if hasFv {
				valid[name] = fv
			}
		}

		key := path[0] + "/" + path[1]
		entMap[key] = map[string]any{
			"valid_json": valid,
		}
	}

	return entMap
}

// Stringify converts a value to a JSON string, first removing any circular
// references (mirrors the canonical TS stringify, which wraps decircular).
func Stringify(val any) string {
	b, err := json.Marshal(Decircular(val))
	if err != nil {
		return ""
	}
	return string(b)
}

// Decircular deep-copies a value, replacing circular references with
// "[Circular *path]" strings, where path is the dotted path to the first
// occurrence. It mirrors the canonical TS decircular, detecting cycles by
// object identity on the current traversal path. Only map[string]any and []any
// are recursed into; non-finite floats (NaN, ±Inf) normalise to nil so that
// Stringify emits null (as JSON.stringify does); all other values are returned
// unchanged.
func Decircular(val any) any {
	seen := make(map[uintptr][]string)
	var path []string
	return decircularWalk(val, seen, &path)
}

func decircularWalk(val any, seen map[uintptr][]string, path *[]string) any {
	if val == nil {
		return nil
	}

	switch v := val.(type) {
	case map[string]any:
		// Empty containers can't take part in a cycle; skip identity tracking
		// (a nil map's pointer is 0 and would otherwise alias other zero ptrs).
		if len(v) == 0 {
			return map[string]any{}
		}
		ptr := mapPtr(v)
		if existing, ok := seen[ptr]; ok {
			return fmt.Sprintf("[Circular *%s]", strings.Join(existing, "."))
		}
		pathCopy := make([]string, len(*path))
		copy(pathCopy, *path)
		seen[ptr] = pathCopy

		result := make(map[string]any, len(v))
		for key, value := range v {
			*path = append(*path, key)
			result[key] = decircularWalk(value, seen, path)
			*path = (*path)[:len(*path)-1]
		}
		delete(seen, ptr)
		return result

	case []any:
		// Empty slices can't take part in a cycle; skip identity tracking
		// (an empty slice's backing pointer is 0).
		if len(v) == 0 {
			return []any{}
		}
		ptr := slicePtr(v)
		if existing, ok := seen[ptr]; ok {
			return fmt.Sprintf("[Circular *%s]", strings.Join(existing, "."))
		}
		pathCopy := make([]string, len(*path))
		copy(pathCopy, *path)
		seen[ptr] = pathCopy

		result := make([]any, len(v))
		for i, value := range v {
			key := fmt.Sprintf("%d", i)
			*path = append(*path, key)
			result[i] = decircularWalk(value, seen, path)
			*path = (*path)[:len(*path)-1]
		}
		delete(seen, ptr)
		return result

	case float64:
		// JSON has no NaN/Infinity; JS JSON.stringify serialises them as null, so
		// normalise non-finite floats to nil here (Go's json.Marshal would error
		// and Stringify would otherwise discard the whole payload).
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil
		}
		return v

	case float32:
		f := float64(v)
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return nil
		}
		return v

	default:
		return val
	}
}

// mapPtr extracts a stable pointer from a map for identity comparison.
func mapPtr(m map[string]any) uintptr {
	return reflect.ValueOf(m).Pointer()
}

// slicePtr extracts a slice's backing-array pointer for identity comparison.
// Callers must exclude empty slices (handled in decircularWalk). Note: this is
// identity by backing array, so distinct slices that share a backing array
// (e.g. via re-slicing) could be conflated — this does not arise from the
// independently allocated maps/slices that decoded JSON produces.
func slicePtr(s []any) uintptr {
	return reflect.ValueOf(s).Pointer()
}
