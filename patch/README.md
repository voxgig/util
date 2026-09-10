# Apply note: guard the committed build output

One patch, adding a step to `.github/workflows/ci.yml` that fails the build
when a clean build changes anything committed.

```sh
git am < patch/0001-ci-fail-when-a-clean-build-changes-committed-output.patch
```

Then delete this folder, in the same commit if you can. Once applied the file
only duplicates the history it just created, and a patch that has drifted from
`main` is worse than no patch. Check whether it has already landed with:

```sh
git apply --check patch/0001-ci-fail-when-a-clean-build-changes-committed-output.patch
```

## Why it arrives this way

An agent session cannot write `.github/workflows/`. The push is refused:

```
refusing to allow an OAuth App to create or update workflow
`.github/workflows/ci.yml` without `workflow` scope
```

Nothing else in the change is pushable, so there is no half to land early.

## What it does

Adds one step to the end of the `build-and-test` job:

```sh
DIRTY="$(git status --porcelain)"
if [ -n "$DIRTY" ]; then
  echo "::error::a clean build changed committed files; ..."
  echo "$DIRTY"
  git --no-pager diff --stat
  exit 1
fi
```

`ts/dist` and `ts/dist-test` are committed, and until now nothing checked
that they match what the compiler emits. For a long time
`ts/dist/util.js.map` did not: `make clean && make all` left a dirty tree, so
every contributor saw a phantom diff on a file they had not touched. bd1a2a0
refreshed the map alone to quiet that, and the drift returned because the
cause was untouched. 97f992e fixed the artifact; this stops the class of
problem returning unnoticed.

## Design notes

**Nearly free.** The job has already installed, built and tested, so the step
only reads the result.

**No `working-directory` override.** The job defaults to `ts`, but
`git status --porcelain` reports the whole repository from any subdirectory.
Verified rather than assumed.

**Whole-tree scope, not just `ts/dist`.** That covers `ts/dist-test` and any
generated file committed later without needing to be updated. Safe because
`npm install` leaves nothing untracked here, which was checked before
choosing the scope.

**Both matrix entries.** tsc output does not depend on the Node version, so
24 and latest should agree; if they ever diverge that is a finding worth
having rather than noise.

**The other half of the exact pin.** 97f992e pinned typescript to `7.0.2`
rather than `^7.0.2`. With a range, a tsc patch release could change the
emitted output and turn this step red with no source change behind it. The
pin is what makes the guard stable rather than flaky.

## Verified in both directions

A check that cannot fail is worse than none, so the step's script was run
against both states:

| tree state | result |
| --- | --- |
| clean, after a full install, build and test | exits **0**, "committed build output matches a clean build" |
| the old stale mapping shape injected back into `ts/dist/util.js.map` | exits **1**, names the file and prints a diffstat |

The second case is the exact defect the guard exists to catch.
