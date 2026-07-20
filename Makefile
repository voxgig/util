.PHONY: all build test clean build-ts build-go test-ts test-go clean-ts clean-go publish publish-npm publish-go tags-npm tags-go reset

all: build test

build: build-ts build-go

test: test-ts test-go

clean: clean-ts clean-go

# TypeScript (package lives in ts/)
build-ts:
	cd ts && npm run build

test-ts:
	cd ts && npm test

clean-ts:
	rm -rf ts/dist ts/dist-test

# Go
build-go:
	cd go && go build ./...

test-go:
	cd go && go test -v ./...

clean-go:
	cd go && go clean

tags-go:
	git tag -l 'go/v*' --sort=-version:refname

tags-npm:
	git tag -l 'v*' --sort=-version:refname

# Publish both npm and Go with patch version bumps.
publish: publish-npm publish-go

# Publish npm package with a patch version bump.
# Bumps ts/package.json, commits, tags vX.Y.Z, pushes, publishes to npm.
publish-npm: build-ts test-ts
	cd ts && npm version patch --no-git-tag-version
	@V=$$(node -p "require('./ts/package.json').version"); \
		echo "Publishing npm v$$V"; \
		git add ts/package.json && \
		git commit -m "ts: v$$V" && \
		git tag v$$V && \
		git push origin main v$$V && \
		(cd ts && npm publish --registry https://registry.npmjs.org --access=public) && \
		if command -v gh >/dev/null 2>&1; then gh release create v$$V --title "v$$V" --notes "npm package release v$$V"; fi

# Publish Go module with a patch version bump derived from the latest go/v* tag.
# Override with V=x.y.z (e.g. for a minor/major bump or first release).
publish-go: test-go
	@LATEST=$$(git tag -l 'go/v*' --sort=-version:refname | head -1 | sed 's|^go/v||'); \
		V=$${V:-$$(echo $$LATEST | awk -F. '{printf "%d.%d.%d", $$1, $$2, $$3+1}')}; \
		test -n "$$V" || (echo "No existing go/v* tag; use: make publish-go V=x.y.z" && exit 1); \
		echo "Publishing go/v$$V (previous go/v$$LATEST)"; \
		git tag go/v$$V && \
		git push origin main go/v$$V && \
		if command -v gh >/dev/null 2>&1; then gh release create go/v$$V --title "go/v$$V" --notes "Go module release v$$V"; fi

reset:
	cd ts && npm run reset
	cd go && go clean -cache
	cd go && go build ./...
	cd go && go test -v ./...
