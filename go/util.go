/* Copyright © 2024-2025 Voxgig Ltd, MIT License. */

package util

import (
	"encoding/json"
	"math"
	"sort"
	"strings"
	"unicode"
)

// Camelify converts a kebab-case string (or slice of strings) to PascalCase.
// Example: "foo-bar" => "FooBar"
func Camelify(input string) string {
	parts := strings.Split(input, "-")
	return camelifyParts(parts)
}

// CamelifySlice converts a slice of strings to PascalCase.
func CamelifySlice(input []string) string {
	parts := make([]string, len(input))
	for i, s := range input {
		parts[i] = s
	}
	return camelifyParts(parts)
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

func diveInternal(node map[string]any, d int, prefix []string, items *[]DiveEntry) {
	if node == nil {
		return
	}
	for key, child := range node {
		if key == "$" {
			pathCopy := make([]string, len(prefix))
			copy(pathCopy, prefix)
			*items = append(*items, DiveEntry{Path: pathCopy, Value: child})
		} else if childMap, ok := child.(map[string]any); ok && d > 1 && hasOwnKeys(childMap) {
			newPrefix := append(append([]string{}, prefix...), key)
			diveInternal(childMap, d-1, newPrefix, items)
		} else {
			newPath := append(append([]string{}, prefix...), key)
			*items = append(*items, DiveEntry{Path: newPath, Value: child})
		}
	}
}

// Get retrieves a deeply nested value from a map using a dot-separated path.
// Example: Get(map, "a.b") returns map["a"]["b"]
func Get(root any, path string) any {
	return GetPath(root, strings.Split(path, "."))
}

// GetPath retrieves a deeply nested value from a map using a path slice.
func GetPath(root any, path []string) any {
	node := root
	for _, key := range path {
		if node == nil {
			return nil
		}
		switch m := node.(type) {
		case map[string]any:
			node = m[key]
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

func toString(v any) string {
	switch val := v.(type) {
	case string:
		return val
	case int:
		return intToString(val)
	case float64:
		if val == math.Trunc(val) {
			return intToString(int(val))
		}
		return json.Number(json.Number(strings.TrimRight(strings.TrimRight(
			strings.Replace(
				strings.Replace(json.Number("").String(), "", "", 1),
				"", "", 1),
			"0"), "."))).String()
	default:
		b, _ := json.Marshal(val)
		return string(b)
	}
}

func intToString(n int) string {
	if n == 0 {
		return "0"
	}
	if n < 0 {
		return "-" + intToString(-n)
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

// Pinify converts a path slice to pin notation with alternating : and , separators.
// Example: ["a","b","c","d"] => "a:b,c:d"
func Pinify(path []string) string {
	var sb strings.Builder
	for i, p := range path {
		sb.WriteString(p)
		if i < len(path)-1 {
			if i%2 == 0 {
				sb.WriteString(":")
			} else {
				sb.WriteString(",")
			}
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
	// Maintain insertion order by sorting keys (Go maps are unordered)
	keys := make([]string, 0, len(itemMap))
	for k := range itemMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, k := range keys {
		item := copyMap(itemMap[k])
		if _, ok := item["key"]; !ok {
			item["key"] = k
		}
		items = append(items, item)
	}

	if spec == nil {
		return items
	}

	items = orderSort(items, itemMap, spec)
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

func orderSort(items []map[string]any, itemMap map[string]map[string]any, spec *OrderSpec) []map[string]any {
	if spec.Sort == "" {
		return items
	}

	keyOrder := splitTrim(spec.Sort)

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
			sort.Slice(filtered, func(i, j int) bool {
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
				if len(t) > maxLen {
					maxLen = len(t)
				}
			}
			padLen := maxLen + 1
			for _, item := range filtered {
				t := getTitle(item)
				padded := padStart(t, padLen, '0')
				item["title$"] = padded
			}
			sort.Slice(filtered, func(i, j int) bool {
				return filtered[i]["title$"].(string) < filtered[j]["title$"].(string)
			})
			for _, item := range filtered {
				finalKeys = append(finalKeys, item["key"].(string))
			}
		default:
			finalKeys = append(finalKeys, k)
		}
	}

	result := make([]map[string]any, 0, len(finalKeys))
	for _, k := range finalKeys {
		if orig, ok := itemMap[k]; ok {
			item := copyMap(orig)
			if _, ok := item["key"]; !ok {
				item["key"] = k
			}
			// Copy title$ if present in items
			for _, it := range items {
				if it["key"] == k {
					if ts, ok := it["title$"]; ok {
						item["title$"] = ts
					}
					break
				}
			}
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

func getTitle(item map[string]any) string {
	if t, ok := item["title"].(string); ok {
		return t
	}
	return ""
}

func padStart(s string, length int, pad byte) string {
	if len(s) >= length {
		return s
	}
	return strings.Repeat(string(pad), length-len(s)) + s
}

func orderExclude(items []map[string]any, spec *OrderSpec) []map[string]any {
	if spec.Exclude == "" {
		return items
	}
	excludes := splitTrim(spec.Exclude)
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
	includes := splitTrim(spec.Include)
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

func splitTrim(s string) []string {
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

// Entity processes a model to extract entity field validation.
func Entity(model map[string]any) map[string]any {
	main, _ := model["main"].(map[string]any)
	if main == nil {
		return nil
	}
	ent, _ := main["ent"].(map[string]any)
	if ent == nil {
		return nil
	}

	entries := Dive(ent)
	entMap := make(map[string]any)

	for _, entry := range entries {
		path := entry.Path
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

			fv := field["kind"]
			if fieldValid, ok := field["valid"]; ok {
				switch v := fieldValid.(type) {
				case string:
					fv = toString(fv) + "." + v
				default:
					fv = v
				}
			}
			valid[name] = fv
		}

		key := path[0] + "/" + path[1]
		entMap[key] = map[string]any{
			"valid_json": valid,
		}
	}

	return entMap
}

// Stringify converts a value to a JSON string.
func Stringify(val any) string {
	b, err := json.Marshal(val)
	if err != nil {
		return ""
	}
	return string(b)
}

// Decircular returns a deep copy of the value. In Go, true circular references
// in map/slice structures are uncommon, but this provides a deep-copy utility
// consistent with the TypeScript version.
func Decircular(val any) any {
	return decircularInternal(val)
}

func decircularInternal(val any) any {
	if val == nil {
		return nil
	}
	switch v := val.(type) {
	case map[string]any:
		result := make(map[string]any, len(v))
		for key, value := range v {
			result[key] = decircularInternal(value)
		}
		return result
	case []any:
		result := make([]any, len(v))
		for i, value := range v {
			result[i] = decircularInternal(value)
		}
		return result
	default:
		return val
	}
}
