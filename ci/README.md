# CI workflow source

This folder holds the **source of truth** for the project's GitHub Actions
workflows. The files here are plain YAML in an ordinary directory, then copied
into `.github/workflows/` to take effect.

## Why a separate folder

Creating or updating files under `.github/workflows/` requires the `workflow`
permission, which the automated tooling used in this project does not always
hold — a push that touches `.github/workflows/` can be rejected even when the
rest of the change is fine. Keeping the canonical definitions here means CI
changes can be authored, reviewed, and merged through ordinary pull requests.
The copy under `.github/workflows/` is then updated as a separate, manual step by
someone (or something) with the necessary permission.

## Files

| Source            | Deploys to                     | Purpose                                  |
| ----------------- | ------------------------------ | ---------------------------------------- |
| [`ci.yml`](ci.yml) | `.github/workflows/ci.yml`     | Build and test the TypeScript package (Node 24 + latest) and the Go port. |

## Updating CI

1. Edit the file(s) in this folder.
2. Copy the changed file into `.github/workflows/` with the same name:

   ```bash
   cp ci/ci.yml .github/workflows/ci.yml
   ```

3. Commit. The copy into `.github/workflows/` must be pushed by an actor with the
   `workflow` permission; if a push is rejected for lack of that permission, the
   change here is still merged and the workflow file can be synced separately
   (for example through the GitHub web UI or a maintainer's local push).

Keep this folder and `.github/workflows/` in step: this is the version to edit,
and the deployed copy should always match it.
