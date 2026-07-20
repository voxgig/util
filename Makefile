.PHONY: all build test clean build-ts build-go test-ts test-go clean-ts clean-go publish publish-npm publish-go publish-dry publish-npm-dry publish-go-dry tags-npm tags-go reset

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

tags-npm:
	git tag -l 'v*' --sort=-version:refname

tags-go:
	git tag -l 'go/v*' --sort=-version:refname

# Publish both npm and Go with patch version bumps.
publish: publish-npm publish-go

# Publish npm package. Defaults to a patch bump on ts/package.json; override with V=x.y.z.
# Bumps ts/package.json, commits, tags vX.Y.Z, pushes, publishes to npm, creates gh release.
publish-npm: build-ts test-ts
	@if [ -n "$(V)" ]; then \
		cd ts && npm version $(V) --no-git-tag-version --allow-same-version >/dev/null; \
	else \
		cd ts && npm version patch --no-git-tag-version >/dev/null; \
	fi
	@V=$$(node -p "require('./ts/package.json').version"); \
		echo "Publishing npm v$$V"; \
		git add ts/package.json && \
		git commit -m "ts: v$$V" && \
		git tag v$$V && \
		git push origin main v$$V && \
		(cd ts && npm publish --registry https://registry.npmjs.org --access=public) && \
		if command -v gh >/dev/null 2>&1; then gh release create v$$V --title "v$$V" --notes "npm package release v$$V"; fi

# Publish Go module. Defaults to a patch bump on the Version const in go/util.go; override with V=x.y.z.
# Rewrites go/util.go Version const, commits, tags go/vX.Y.Z, pushes, creates gh release.
publish-go: test-go
	@V=$${V:-$$(awk -F\" '/^const Version = "/{split($$2,a,"."); printf "%d.%d.%d", a[1], a[2], a[3]+1}' go/util.go)}; \
		test -n "$$V" || (echo "Cannot derive next version; use: make publish-go V=x.y.z" && exit 1); \
		echo "Publishing go/v$$V"; \
		sed -i '' 's/^const Version = ".*"/const Version = "'$$V'"/' go/util.go && \
		git add go/util.go && \
		git commit -m "go: v$$V" && \
		git tag go/v$$V && \
		git push origin main go/v$$V && \
		if command -v gh >/dev/null 2>&1; then gh release create go/v$$V --title "go/v$$V" --notes "Go module release v$$V"; fi

# Dry-run: build + test, run `npm pack --dry-run`, and print the git/tag/gh commands that
# publish would run. Does not modify files, commit, tag, push, or publish.
publish-dry: publish-npm-dry publish-go-dry

publish-npm-dry: build-ts test-ts
	@V=$$(node -p "const v=require('./ts/package.json').version.split('.'); v[2]=+v[2]+1; v.join('.')"); \
		echo "[dry-run] Would bump ts/package.json to v$$V"; \
		echo "[dry-run] Would git commit -m 'ts: v$$V'"; \
		echo "[dry-run] Would git tag v$$V"; \
		echo "[dry-run] Would git push origin main v$$V"; \
		echo "[dry-run] Tarball contents (npm pack --dry-run):"; \
		(cd ts && npm pack --dry-run); \
		echo "[dry-run] Would gh release create v$$V"

publish-go-dry: test-go
	@V=$$(awk -F\" '/^const Version = "/{split($$2,a,"."); printf "%d.%d.%d", a[1], a[2], a[3]+1}' go/util.go); \
		test -n "$$V" || (echo "Cannot derive next version from go/util.go Version const" && exit 1); \
		echo "[dry-run] Would rewrite go/util.go Version const to $$V"; \
		echo "[dry-run] Would git commit -m 'go: v$$V'"; \
		echo "[dry-run] Would git tag go/v$$V"; \
		echo "[dry-run] Would git push origin main go/v$$V"; \
		echo "[dry-run] Would gh release create go/v$$V"

reset:
	cd ts && npm run reset
	cd go && go clean -cache
	cd go && go build ./...
	cd go && go test -v ./...
