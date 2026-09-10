.PHONY: all build test clean build-ts build-go test-ts test-go scan-prose clean-ts clean-go bump-go publish publish-rehearse publish-npm publish-go publish-dry publish-npm-dry publish-go-dry tags-npm tags-go reset

# Never run recipes concurrently: publish-npm and publish-go both mutate the
# worktree and index (bump, commit, tag, push), so `make -j publish` must serialize.
.NOTPARALLEL:

all: build test

build: build-ts build-go

test: test-ts test-go scan-prose

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

# The prose gate over the reader-facing pages (STYLE-GUIDE.md). Vale runs
# where it is installed, over the page set tools/check_prose.py prints,
# so both halves read the same files; check_prose always runs, because it
# carries the house rules .vale.ini switches Google rules OFF in favour
# of -- skipping it silently would widen what is allowed.
scan-prose:
	@echo "======== scan: prose (vale + check_prose) ========"
	@if command -v vale >/dev/null 2>&1; then \
	  vale sync >/dev/null && \
	  vale --minAlertLevel=error $$(python3 tools/check_prose.py --files); \
	else \
	  echo "(vale not installed - skipping the Google/banned-list half;"; \
	  echo " see .github/workflows/docs.yml for the pinned version)"; \
	fi
	@python3 tools/check_prose.py

tags-npm:
	git tag -l 'ts/v*' --sort=-version:refname

tags-go:
	git tag -l 'go/v*' --sort=-version:refname

# RELEASING. Both halves go out of ONE run of .github/workflows/publish.yml:
# publishing happens there and nowhere else, because npm allows exactly one
# workflow file to publish and the tags have to be written by that same run.
# A tag must only ever exist for a release that reached the registry, and for
# the Go module the tag IS the release — so neither is written from a laptop.
#
#   make bump-go V=0.1.6     # edit go/util.go only; commit it in a PR
#   make publish             # release both halves at the versions on main
#   make publish GO=false    # npm only
#   make publish NPM=false   # Go module only
#   make publish-rehearse    # run every guard and test, release nothing
#
# The npm version lives in ts/package.json and is bumped with `npm version`
# in ts/; the Go version is the `Version` constant in go/util.go. THE TWO
# SERIES ARE INDEPENDENT: npm is at 0.5.x, the module at 0.1.x. Parity means
# released together, not numbered alike.
#
# Bumps are NOT automated: they land as a reviewed diff, then the release is
# a button. Nothing in this section commits or tags.

NPM ?= true
GO ?= true

# Set the Go module version. Edits the file and stops — commit it in a PR.
bump-go:
	@test -n "$(V)" || (echo "Usage: make bump-go V=x.y.z" && exit 1)
	# Portable in-place edit: GNU sed wants `-i`, BSD/macOS sed `-i ''`.
	# A temp file plus mv sidesteps the difference.
	sed 's/^const Version = ".*"/const Version = "$(V)"/' go/util.go > go/util.go.tmp \
		&& mv go/util.go.tmp go/util.go
	@grep -q '^const Version = "$(V)"' go/util.go || \
	  (echo "bump-go: failed to set Version in go/util.go" && exit 1)
	@echo "go/util.go now declares $(V) — commit it, then: make publish"

# Dispatch the release. Publishes what is missing, then writes both tags.
publish:
	@command -v gh >/dev/null || (echo "publish: needs the gh CLI" && exit 1)
	@test "`git rev-parse --abbrev-ref HEAD`" = "main" || \
	  (echo "publish: releases come from main" && exit 1)
	@git diff --quiet && git diff --cached --quiet || \
	  (echo "publish: working tree is dirty" && exit 1)
	git fetch origin main
	@test "`git rev-parse HEAD`" = "`git rev-parse origin/main`" || \
	  (echo "publish: local main differs from origin/main — push or pull first" && exit 1)
	gh workflow run publish.yml --ref main \
	  -f npm=$(NPM) -f go=$(GO) -f dry_run=false -f expect_sha=`git rev-parse HEAD`
	@echo "dispatched; watch: gh run list --workflow=publish.yml"

# Rehearse the same run: every guard, both builds, both suites, no release.
# It cannot test npm's trusted publisher — see publish.yml's header.
publish-rehearse:
	@command -v gh >/dev/null || (echo "publish-rehearse: needs the gh CLI" && exit 1)
	@test "`git rev-parse --abbrev-ref HEAD`" = "main" || \
	  (echo "publish-rehearse: dispatches run from main" && exit 1)
	gh workflow run publish.yml --ref main \
	  -f npm=$(NPM) -f go=$(GO) -f dry_run=true
	@echo "dispatched (rehearsal); watch: gh run list --workflow=publish.yml"

# RECOVERY ONLY — NOT THE RELEASE PATH. `make publish` above is. This target
# publishes over a local token, which bypasses OIDC and lands the package with
# NO PROVENANCE ATTESTATION (that is how 0.5.4 went out). It also bumps and
# commits, which the workflow deliberately does not. Reach for it only when
# the workflow route is broken and a release cannot wait, and expect the
# resulting version to be the odd one out on npm.
#
# Order: bump -> commit -> tag locally -> npm publish -> push commit+tag -> gh release.
# npm publish runs before the git push so a failed publish leaves nothing public and
# a retry can succeed (the local commit/tag are still there for re-use).
publish-npm: build-ts test-ts
	@if [ -n "$(V)" ]; then \
		cd ts && npm version $(V) --no-git-tag-version --allow-same-version >/dev/null; \
	else \
		cd ts && npm version patch --no-git-tag-version >/dev/null; \
	fi
	@V=$$(node -p "require('./ts/package.json').version"); \
		echo "Publishing ts/v$$V"; \
		git add ts/package.json && \
		git commit -m "ts: v$$V" && \
		git tag ts/v$$V && \
		(cd ts && npm publish --registry https://registry.npmjs.org --access=public) && \
		git push origin main ts/v$$V && \
		if command -v gh >/dev/null 2>&1; then gh release create ts/v$$V --title "ts/v$$V" --notes "npm package release v$$V"; fi

# RECOVERY ONLY — NOT THE RELEASE PATH, for the same reasons as publish-npm,
# and with one of its own: pushing the module tag from here releases the Go
# half on its own, which is exactly the drift `make publish` exists to stop.
# proxy.golang.org caches the version immutably, so a tag pushed in error
# cannot be withdrawn. Use `make bump-go V=x.y.z` plus `make publish`.
#
# Defaults to a patch bump on the Version const in go/util.go; override with V=x.y.z.
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

# Dry-run: build + test + `npm pack --dry-run`, and print the git/tag/gh commands
# that publish would run. Does not commit, tag, push, or publish. Accepts V=x.y.z
# to preview a specific version (defaults to a patch bump).
# Note: the build-ts / test-ts / test-go prerequisites may regenerate tracked
# ts/dist artifacts if sources have changed since the last build — that is the
# same rebuild publish itself would do.
publish-dry: publish-npm-dry publish-go-dry

publish-npm-dry: build-ts test-ts
	@V=$${V:-$$(node -p "const v=require('./ts/package.json').version.split('.'); v[2]=+v[2]+1; v.join('.')")}; \
		echo "[dry-run] Would bump ts/package.json to v$$V"; \
		echo "[dry-run] Would git commit -m 'ts: v$$V'"; \
		echo "[dry-run] Would git tag ts/v$$V"; \
		echo "[dry-run] Would npm publish (see tarball below)"; \
		echo "[dry-run] Would git push origin main ts/v$$V"; \
		echo "[dry-run] Tarball contents (npm pack --dry-run):"; \
		(cd ts && npm pack --dry-run); \
		echo "[dry-run] Would gh release create ts/v$$V"

publish-go-dry: test-go
	@V=$${V:-$$(awk -F\" '/^const Version = "/{split($$2,a,"."); printf "%d.%d.%d", a[1], a[2], a[3]+1}' go/util.go)}; \
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
