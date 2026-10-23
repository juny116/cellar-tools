# V1 maintenance baseline — 2026-10-23

Origins: existing private `cellar-logger` (Claude workflow and Sakenowa CLI), then public `cellar-tools` helper extraction (`ed83a1c`). This is completion and maintenance of that workflow, not a newly invented cellar product.

Fixed: stale photo instructions; legacy upload replacing attachments; missing upload size/timeout/preflight checks; fragile non-finite flavor axes; missing source-level attribution; unsafe heat-treatment inference; missing variant/retry rules; absent portable skill/config example; wine command and evidence workflow.

V1 boundary: host reads labels/reasons; host's standard Notion MCP manages records; helpers fetch Sakenowa and attach images. No internal LLM, custom MCP, separate UI, or independent memory store. Wine uses source-backed host research, not a new wine scraping service. External browsing/model costs depend on the chosen host.

Validation: mock-network and CLI tests; live read-only Sakenowa lookup and existing Notion schema inspection. No production bottle/photo write or new wine-label end-to-end run is claimed. Concurrent Notion write uniqueness and photo compare-and-swap are not guaranteed by v1. Fully unattended photo-folder ingestion and plugin-marketplace packaging are outside this baseline, not hidden working features.
