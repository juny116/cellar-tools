# Existing Notion workflow

## Configuration and schema

Copy `config.example.json` to ignored `config.json`. Use data-source IDs, not a database container ID. Resolve catalog/cellar/tasting sources through the standard Notion MCP. Wine source IDs are optional; when absent, request the user's existing wine database location before any wine write. The wine procedure is implemented as an instruction workflow, not a tested automatic wine API integration.

The existing sake schema was inspected read-only on 2026-10-23. Re-read it at runtime:

| Entity | Observed fields |
|---|---|
| Catalog | Sake name (title), Brewery (text), BY(양조연도), 특정명칭, 화입(火入れ), 쌀(酒米), 스펙, Sakenowa, 도수(%), 정미율(%), 산도, 일본주도(SMV) |
| Physical bottle | # (title), Sakes (relation), Consumed (checkbox), Purchase date, Consume date, 용량, Price, Retailer, 보관, 저장위치, Note, Bottle (files) |
| Tasting | Inspect actual source; do not assume property names or rating scale |

Property names/types differ between MCP and REST API representations. Use the connector's returned schema and supported write syntax. Preserve existing select options and multi-select values; do not replace option lists to add a single value. If a required property is missing, report the mismatch instead of guessing or silently dropping information.

## Provenance and duplicate handling

For each operation choose a stable `cellar-op:<UUID>` marker. Reuse it across retries. Put it in the physical bottle Note and product page body when creating a product. Record source URL/access date or label filename next to added facts. Keep unknown fields absent and never erase an existing value merely because a new label omits it.

Before creating a row, search for this marker and inspect any returned page. After a timeout, read back/search before retrying. For N bottles use `<operation>:1` through `<operation>:N` and check each separately. A new purchase of the same wine is a new physical bottle; a repeated request after an interrupted tool call is not. Notion does not enforce unique operation IDs: this v1 workflow reduces duplicate risk but cannot guarantee exactly-once writes across concurrent agents. Avoid concurrent writes for the same operation.

Catalog matching must compare variant fields, not just a fuzzy name. If the schema cannot represent a meaningful variant difference, preserve it in the original product title/page body and explain the choice. No automatic merging of historical duplicates.

## Photos

Helper reads existing attachments, uploads, re-reads to detect edits, and appends. Notion array updates replace the full list, so omission would delete attachments. There is still a final read/write race without a Notion compare-and-swap endpoint: serialize edits to the same files property. Max direct upload 20 MB; workspace limits may be lower. Failed/uncertain writes require readback, not blind retries.

## Acceptance checklist

- Dry run: label facts vs inferred fields; missing/multiple search hits; wine vintage conflict.
- Registration: authorized real label → product link → physical bottle link → readback.
- Retry: same marker does not intentionally create another bottle.
- Photo: existing attachments retained; missing token yields pending photo only.
- Consumption: exact physical bottle, preserved catalog, date readback.

Do not perform real inventory writes just to test the package. Automated tests use temporary files and mocked HTTP. A new real-label end-to-end run remains a user workflow, not a claimed automated-test result.
