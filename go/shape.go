/* Copyright © 2024-2025 Voxgig Ltd, MIT License. */

package util

import (
	shape "github.com/rjrodger/shape/go"
)

// Shape is a type alias for shape.Schema, the compiled schema type produced by
// the shape package. Aliasing rather than wrapping preserves every method on
// the underlying type, so callers can use `*util.Shape` interchangeably with
// `*shape.Schema`. Mirrors the canonical TS `Shape` re-export.
type Shape = shape.Schema

// ShapeBuild compiles a schema-by-example specification. Mirrors the canonical
// TS `Shape.build(spec)` factory; returns a compiled *Shape or a build error.
func ShapeBuild(spec any) (*Shape, error) {
	return shape.Shape(spec)
}

// MustShapeBuild is ShapeBuild that panics on error, matching shape.MustShape.
// Use only when the spec is a program-authored constant.
func MustShapeBuild(spec any) *Shape {
	return shape.MustShape(spec)
}
