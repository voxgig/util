/* Copyright © 2024-2025 Voxgig Ltd, MIT License. */

package util

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Shared cross-language parity specs (top-level test/*.tsv).
//
// The same fixtures drive the TypeScript suite. Each row is (name, args,
// expected); the adapter maps the logical argument list to a real Go call, and
// results are compared as canonical JSON (map keys sorted by encoding/json), so
// a behavioural drift between the two implementations fails one of them.
// ---------------------------------------------------------------------------

type specRow struct {
	name     string
	args     []any
	expected any
}

func loadSpec(t *testing.T, name string) []specRow {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "test", name+".tsv"))
	if err != nil {
		t.Fatalf("read spec %s: %v", name, err)
	}
	var rows []specRow
	for i, line := range strings.Split(string(data), "\n") {
		if i == 0 || strings.TrimSpace(line) == "" || strings.HasPrefix(line, "#") {
			continue // line 0 is the header
		}
		cols := strings.SplitN(line, "\t", 3)
		var args []any
		var exp any
		if err := json.Unmarshal([]byte(cols[1]), &args); err != nil {
			t.Fatalf("%s/%s args: %v", name, cols[0], err)
		}
		if err := json.Unmarshal([]byte(cols[2]), &exp); err != nil {
			t.Fatalf("%s/%s expected: %v", name, cols[0], err)
		}
		rows = append(rows, specRow{cols[0], args, exp})
	}
	return rows
}

// canon renders v as JSON; encoding/json sorts object keys, so structurally
// equal values (regardless of key order) produce the same string.
func canon(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func str(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func toStrSlice(v any) []string {
	raw, _ := v.([]any)
	out := make([]string, len(raw))
	for i, e := range raw {
		out[i], _ = e.(string)
	}
	return out
}

var adapters = map[string]func([]any) any{
	"camelify": func(a []any) any {
		switch v := a[0].(type) {
		case string:
			return Camelify(v)
		case []any:
			return CamelifySlice(toStrSlice(v))
		}
		return nil
	},
	"dive": func(a []any) any {
		node, _ := a[0].(map[string]any)
		var entries []DiveEntry
		if len(a) > 1 {
			entries = Dive(node, int(a[1].(float64)))
		} else {
			entries = Dive(node)
		}
		// Match the TS array-of-[path, value] shape for comparison.
		out := make([]any, len(entries))
		for i, e := range entries {
			p := make([]any, len(e.Path))
			for j, s := range e.Path {
				p[j] = s
			}
			out[i] = []any{p, e.Value}
		}
		return out
	},
	"get": func(a []any) any {
		if s, ok := a[1].(string); ok {
			return Get(a[0], s)
		}
		return GetPath(a[0], toStrSlice(a[1]))
	},
	"joins": func(a []any) any {
		arr, _ := a[0].([]any)
		seps := make([]string, 0, len(a)-1)
		for _, s := range a[1:] {
			seps = append(seps, s.(string))
		}
		return Joins(arr, seps...)
	},
	"pinify": func(a []any) any {
		return Pinify(toStrSlice(a[0]))
	},
	"order": func(a []any) any {
		rawMap, _ := a[0].(map[string]any)
		itemMap := make(map[string]map[string]any, len(rawMap))
		for k, v := range rawMap {
			itemMap[k], _ = v.(map[string]any)
		}
		var spec *OrderSpec
		if a[1] != nil {
			s := a[1].(map[string]any)
			spec = &OrderSpec{Sort: str(s["sort"]), Exclude: str(s["exclude"]), Include: str(s["include"])}
		}
		return Order(itemMap, spec)
	},
	"entity": func(a []any) any {
		m, _ := a[0].(map[string]any)
		return Entity(m)
	},
	"stringify":  func(a []any) any { return Stringify(a[0]) },
	"decircular": func(a []any) any { return Decircular(a[0]) },
}

func TestSharedSpecs(t *testing.T) {
	for _, fn := range []string{"camelify", "dive", "get", "joins", "pinify", "order", "entity", "stringify", "decircular"} {
		fn := fn
		t.Run(fn, func(t *testing.T) {
			rows := loadSpec(t, fn)
			if len(rows) == 0 {
				t.Fatalf("no spec rows for %s", fn)
			}
			for _, row := range rows {
				row := row
				t.Run(row.name, func(t *testing.T) {
					got := canon(adapters[fn](row.args))
					want := canon(row.expected)
					if got != want {
						t.Errorf("%s/%s mismatch\n got=%s\nwant=%s", fn, row.name, got, want)
					}
				})
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Go-specific tests: behaviour that cannot be a shared fixture (typed numbers,
// cycles, non-finite floats, nil maps) and the defensive branches that JSON
// input cannot reach.
// ---------------------------------------------------------------------------

func TestDiveMap(t *testing.T) {
	node := map[string]any{"a": map[string]any{"b": 1}, "c": map[string]any{"d": 2}}

	got := DiveMap(node, func(path []string, leaf any) (string, any, bool) {
		return strings.Join(path, "."), leaf, true
	})
	if canon(got) != canon(map[string]any{"a.b": 1, "c.d": 2}) {
		t.Errorf("DiveMap = %v", got)
	}

	// ok=false omits the entry.
	got2 := DiveMap(node, func(path []string, leaf any) (string, any, bool) {
		if path[1] == "b" {
			return "", nil, false
		}
		return strings.Join(path, "."), leaf, true
	})
	if canon(got2) != canon(map[string]any{"c.d": 2}) {
		t.Errorf("DiveMap filtered = %v", got2)
	}
}

func TestDiveNilAndScalarNode(t *testing.T) {
	if r := Dive(nil); len(r) != 0 {
		t.Errorf("Dive(nil) = %v, want empty", r)
	}
	// White-box: a non-map/non-slice node hits diveInternal's default branch.
	var items []DiveEntry
	diveInternal(42, 2, nil, &items)
	if len(items) != 0 {
		t.Errorf("diveInternal(scalar) produced %v", items)
	}
}

func TestJoinsTypedAndNonFinite(t *testing.T) {
	// int / int64 (JSON only ever yields float64).
	if r := Joins([]any{"x", 5, "y", int64(7)}, ":"); r != "x:5:y:7" {
		t.Errorf("Joins typed ints = %q", r)
	}
	// Non-finite floats match JS String().
	for _, c := range []struct {
		v    float64
		want string
	}{{math.Inf(1), "Infinity"}, {math.Inf(-1), "-Infinity"}, {math.NaN(), "NaN"}} {
		if r := Joins([]any{c.v}, ":"); r != c.want {
			t.Errorf("Joins(%v) = %q, want %q", c.v, r, c.want)
		}
	}
}

func TestGetScalarRoot(t *testing.T) {
	// GetPath default branch for a scalar root.
	if v := Get(5, "a"); v != nil {
		t.Errorf("Get(5, 'a') = %v, want nil", v)
	}
}

func TestOrderNoSpecAndEmptySort(t *testing.T) {
	items := map[string]map[string]any{"b": {"title": "B"}, "a": {"title": "A"}}
	// nil spec: Go returns lexicographic key order.
	if r := Order(items, nil); canon(r) != canon([]any{
		map[string]any{"key": "a", "title": "A"},
		map[string]any{"key": "b", "title": "B"},
	}) {
		t.Errorf("Order(nil spec) = %s", canon(r))
	}
	// Empty Sort with an Exclude exercises orderSort's early return.
	if r := Order(items, &OrderSpec{Exclude: "a"}); canon(r) != canon([]any{
		map[string]any{"key": "b", "title": "B"},
	}) {
		t.Errorf("Order(empty sort) = %s", canon(r))
	}
}

func TestOrderNonStringKeyDropped(t *testing.T) {
	// Documented divergence [18]: an item with a non-string preset key is
	// dropped by the string-typed filter/sort guards (covers the ok==false
	// paths in filterItems / byKey / orderExclude / orderInclude).
	items := map[string]map[string]any{
		"a": {"key": 5, "title": "X"},
		"b": {"title": "Y"},
	}
	r := Order(items, &OrderSpec{Sort: "alpha$", Exclude: "z", Include: "b"})
	if canon(r) != canon([]any{map[string]any{"key": "b", "title": "Y"}}) {
		t.Errorf("Order(non-string key) = %s", canon(r))
	}
}

func TestStringifyCyclesAndErrors(t *testing.T) {
	// Map cycle.
	m := map[string]any{"a": 1}
	m["self"] = m
	if got := Stringify(m); got != `{"a":1,"self":"[Circular *]"}` {
		t.Errorf("Stringify(map cycle) = %q", got)
	}
	// Slice cycle.
	s := make([]any, 1)
	s[0] = s
	if got := Stringify(s); !strings.Contains(got, "Circular") {
		t.Errorf("Stringify(slice cycle) = %q", got)
	}
	// A value encoding/json cannot marshal yields "".
	if got := Stringify(make(chan int)); got != "" {
		t.Errorf("Stringify(chan) = %q, want empty", got)
	}
}

func TestStringifyNonFinite(t *testing.T) {
	if got := Stringify(map[string]any{"x": math.NaN()}); got != `{"x":null}` {
		t.Errorf("Stringify(NaN) = %q", got)
	}
	if got := Stringify(math.Inf(1)); got != "null" {
		t.Errorf("Stringify(Inf) = %q", got)
	}
	// float32 non-finite normalises to null; a finite float32 passes through.
	if got := Stringify(map[string]any{"x": float32(math.Inf(-1))}); got != `{"x":null}` {
		t.Errorf("Stringify(float32 -Inf) = %q", got)
	}
	if got := Stringify(float32(1.5)); got != "1.5" {
		t.Errorf("Stringify(float32 1.5) = %q", got)
	}
}

func TestJsTruthy(t *testing.T) {
	cases := []struct {
		v    any
		want bool
	}{
		{nil, false}, {true, true}, {false, false},
		{"", false}, {"x", true},
		{float64(0), false}, {float64(1), true}, {math.NaN(), false},
		{float32(0), false}, {float32(2), true}, {float32(math.NaN()), false},
		{0, false}, {3, true},
		{int64(0), false}, {int64(4), true},
		{[]any{}, true}, {map[string]any{}, true},
	}
	for _, c := range cases {
		if got := jsTruthy(c.v); got != c.want {
			t.Errorf("jsTruthy(%v) = %v, want %v", c.v, got, c.want)
		}
	}
}

func TestPadStartAndUtf16Len(t *testing.T) {
	// n >= length early return (unreachable via human$, where padLen > len).
	if got := padStart("abc", 2, '0'); got != "abc" {
		t.Errorf("padStart no-pad = %q", got)
	}
	if got := padStart("x", 3, '0'); got != "00x" {
		t.Errorf("padStart = %q", got)
	}
	if got := utf16Len("ab\U0001F600"); got != 4 { // 2 BMP + 2 (surrogate pair)
		t.Errorf("utf16Len = %d, want 4", got)
	}
}
