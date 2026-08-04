# Architecture

Living overview of the system. Prose here (outside the markers) is hand-written and safe from
regeneration; the block inside the `AUTO-DOC` markers is maintained by `/update-docs` on merge.

<!-- AUTO-DOC:START architecture-stack -->
_The stack / framework inventory is generated here on the first `/update-docs` run._
<!-- AUTO-DOC:END architecture-stack -->

## How the docs stay current

On merge to a configured branch, `scripts/collect-doc-changes.mjs` classifies the diff into
**backend / schema / frontend** buckets and `scripts/extract-symbols.mjs` enumerates exported
symbols; `/update-docs` then regenerates the affected sections and opens a draft PR. See
[docs-sync/README.md](../docs-sync/README.md).
