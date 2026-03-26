/* Copyright © 2024-2025 Voxgig Ltd, MIT License. */

package util

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestHappy(t *testing.T) {
	// Verify functions exist by calling them with minimal args
	_ = Camelify("")
	_ = Dive(nil)
	_ = Get(nil, "")
	_ = Joins(nil)
	_ = Pinify(nil)
	_ = Entity(nil)
}

func TestCamelify(t *testing.T) {
	result := Camelify("foo-bar")
	if result != "FooBar" {
		t.Errorf("Camelify('foo-bar') = %q, want %q", result, "FooBar")
	}
}

func TestCamelifySlice(t *testing.T) {
	result := CamelifySlice([]string{"foo", "bar"})
	if result != "FooBar" {
		t.Errorf("CamelifySlice(['foo','bar']) = %q, want %q", result, "FooBar")
	}
}

func TestDive(t *testing.T) {
	input := map[string]any{
		"color": map[string]any{
			"red":   map[string]any{"x": 1},
			"green": map[string]any{"x": 2},
		},
		"planet": map[string]any{
			"mercury": map[string]any{"y": map[string]any{"z": 3}},
			"venus":   map[string]any{"y": map[string]any{"z": 4}},
		},
	}

	result := Dive(input)

	// Since Go maps are unordered, check by building a lookup
	if len(result) != 4 {
		t.Fatalf("Dive returned %d entries, want 4", len(result))
	}

	lookup := make(map[string]any)
	for _, entry := range result {
		key := entry.Path[0] + "." + entry.Path[1]
		lookup[key] = entry.Value
	}

	assertMapValue(t, lookup, "color.red", map[string]any{"x": 1})
	assertMapValue(t, lookup, "color.green", map[string]any{"x": 2})
	assertMapValue(t, lookup, "planet.mercury", map[string]any{"y": map[string]any{"z": 3}})
	assertMapValue(t, lookup, "planet.venus", map[string]any{"y": map[string]any{"z": 4}})
}

func TestGet(t *testing.T) {
	root := map[string]any{
		"a": map[string]any{
			"b": 1,
		},
	}
	result := Get(root, "a.b")
	if result != 1 {
		t.Errorf("Get(root, 'a.b') = %v, want 1", result)
	}
}

func TestGetNil(t *testing.T) {
	result := Get(nil, "a.b")
	if result != nil {
		t.Errorf("Get(nil, 'a.b') = %v, want nil", result)
	}
}

func TestJoins(t *testing.T) {
	arr := []any{"a", 1, "b", 2, "c", 3, "d", 4, "e", 5, "f", 6}
	result := Joins(arr, ":", ",", "/")
	expected := "a:1,b:2/c:3,d:4/e:5,f:6"
	if result != expected {
		t.Errorf("Joins() = %q, want %q", result, expected)
	}
}

func TestPinify(t *testing.T) {
	result := Pinify([]string{"a", "b", "c", "d"})
	if result != "a:b,c:d" {
		t.Errorf("Pinify(['a','b','c','d']) = %q, want %q", result, "a:b,c:d")
	}
}

func TestEntity(t *testing.T) {
	model := map[string]any{
		"main": map[string]any{
			"ent": map[string]any{
				"qaz": map[string]any{
					"zed": map[string]any{
						"valid": map[string]any{
							"$$": "Open",
						},
						"field": map[string]any{
							"foo": map[string]any{
								"valid": map[string]any{
									"a": "Number",
								},
							},
						},
					},
				},
			},
		},
	}

	result := Entity(model)

	expected := map[string]any{
		"qaz/zed": map[string]any{
			"valid_json": map[string]any{
				"$$":  "Open",
				"foo": map[string]any{"a": "Number"},
			},
		},
	}

	if !reflect.DeepEqual(result, expected) {
		t.Errorf("Entity() = %v, want %v", toJSON(result), toJSON(expected))
	}
}

func TestStringify(t *testing.T) {
	result := Stringify(map[string]any{"a": 1, "b": "hello"})
	// JSON key order may vary in Go, parse and compare
	var parsed map[string]any
	json.Unmarshal([]byte(result), &parsed)

	if parsed["a"] != float64(1) || parsed["b"] != "hello" {
		t.Errorf("Stringify({a:1,b:'hello'}) = %q", result)
	}

	if Stringify(nil) != "null" {
		t.Errorf("Stringify(nil) = %q, want 'null'", Stringify(nil))
	}

	if Stringify(42) != "42" {
		t.Errorf("Stringify(42) = %q, want '42'", Stringify(42))
	}
}

func TestDecircular(t *testing.T) {
	// Simple non-circular object passes through
	input := map[string]any{"a": 1, "b": map[string]any{"c": 2}}
	result := Decircular(input)
	expected := map[string]any{"a": 1, "b": map[string]any{"c": 2}}
	if !reflect.DeepEqual(result, expected) {
		t.Errorf("Decircular simple = %v, want %v", result, expected)
	}

	// Handles nil
	if Decircular(nil) != nil {
		t.Errorf("Decircular(nil) = %v, want nil", Decircular(nil))
	}

	// Handles primitives
	if Decircular(42) != 42 {
		t.Errorf("Decircular(42) = %v, want 42", Decircular(42))
	}
	if Decircular("hello") != "hello" {
		t.Errorf("Decircular('hello') = %v, want 'hello'", Decircular("hello"))
	}

	// Handles arrays
	arrInput := []any{1, 2, map[string]any{"a": 3}}
	arrResult := Decircular(arrInput)
	arrExpected := []any{1, 2, map[string]any{"a": 3}}
	if !reflect.DeepEqual(arrResult, arrExpected) {
		t.Errorf("Decircular array = %v, want %v", arrResult, arrExpected)
	}

	// Deeply nested non-circular object
	deep := map[string]any{
		"a": map[string]any{
			"b": map[string]any{
				"c": map[string]any{
					"d": map[string]any{
						"e": 5,
					},
				},
			},
		},
	}
	deepResult := Decircular(deep)
	if !reflect.DeepEqual(deepResult, deep) {
		t.Errorf("Decircular deep = %v, want %v", deepResult, deep)
	}
}

func TestOrder(t *testing.T) {
	// Empty
	result := Order(map[string]map[string]any{}, nil)
	if len(result) != 0 {
		t.Errorf("Order({}, nil) returned %d items, want 0", len(result))
	}

	items := map[string]map[string]any{
		"code": {"title": "Coding"},
		"tech": {"title": "Technology"},
		"devr": {"title": "Developer Relations"},
	}

	// No spec
	result = Order(items, nil)
	assertOrderKeys(t, result, []string{"code", "devr", "tech"})

	// Exclude
	result = Order(items, &OrderSpec{Exclude: "code,tech"})
	assertOrderKeys(t, result, []string{"devr"})

	// Include
	result = Order(items, &OrderSpec{Include: "code,tech"})
	assertOrderKeys(t, result, []string{"code", "tech"})

	// Exclude wins over include
	result = Order(items, &OrderSpec{Exclude: "code", Include: "code,tech"})
	assertOrderKeys(t, result, []string{"tech"})

	// Alpha sort
	result = Order(items, &OrderSpec{Sort: "alpha$"})
	assertOrderKeys(t, result, []string{"code", "devr", "tech"})
	assertOrderTitles(t, result, []string{"Coding", "Developer Relations", "Technology"})

	// Explicit sort
	result = Order(items, &OrderSpec{Sort: "tech,code"})
	assertOrderKeys(t, result, []string{"tech", "code"})

	// Mixed sort with alpha$
	result = Order(items, &OrderSpec{Sort: "tech,alpha$"})
	assertOrderKeys(t, result, []string{"tech", "code", "devr"})
}

func TestOrderHumanSort(t *testing.T) {
	nums := map[string]map[string]any{
		"1":    {"title": "1"},
		"10":   {"title": "10"},
		"2":    {"title": "2"},
		"tech": {"title": "Technology"},
	}

	// Alpha sort
	result := Order(nums, &OrderSpec{Sort: "alpha$"})
	assertOrderKeys(t, result, []string{"1", "10", "2", "tech"})

	// Human sort
	result = Order(nums, &OrderSpec{Sort: "human$"})
	assertOrderKeys(t, result, []string{"1", "2", "10", "tech"})
}

// Helpers

func assertMapValue(t *testing.T, m map[string]any, key string, expected any) {
	t.Helper()
	val, ok := m[key]
	if !ok {
		t.Errorf("key %q not found in map", key)
		return
	}
	if !reflect.DeepEqual(val, expected) {
		t.Errorf("m[%q] = %v, want %v", key, val, expected)
	}
}

func assertOrderKeys(t *testing.T, items []map[string]any, expectedKeys []string) {
	t.Helper()
	if len(items) != len(expectedKeys) {
		t.Errorf("got %d items, want %d", len(items), len(expectedKeys))
		return
	}
	for i, item := range items {
		key, _ := item["key"].(string)
		if key != expectedKeys[i] {
			t.Errorf("item[%d].key = %q, want %q", i, key, expectedKeys[i])
		}
	}
}

func assertOrderTitles(t *testing.T, items []map[string]any, expectedTitles []string) {
	t.Helper()
	for i, item := range items {
		title, _ := item["title"].(string)
		if title != expectedTitles[i] {
			t.Errorf("item[%d].title = %q, want %q", i, title, expectedTitles[i])
		}
	}
}

func toJSON(v any) string {
	b, _ := json.MarshalIndent(v, "", "  ")
	return string(b)
}
