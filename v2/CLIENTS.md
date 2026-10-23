# Personal Cellar MCP

## Claude Desktop on Mac → Styx → existing Notion

Styx requires Node >=22.13, `npm --prefix v2 ci`, the private Notion config and token env file. The launcher defaults to `$HOME/Workspace/cellar-tools/.data/notion.json`, the **same journal as the UI**, and the legacy sibling `cellar-logger/.env`. Override `CELLAR_NOTION_CONFIG`, `CELLAR_JOURNAL` and `CELLAR_ENV_FILE` on the server when appropriate. Never put a token in Git or SSH arguments.

Add this entry to `~/Library/Application Support/Claude/claude_desktop_config.json`, preserving other settings:

```json
{
  "mcpServers": {
    "cellar": {
      "command": "/bin/sh",
      "args": ["/ABSOLUTE/PATH/cellar-tools/v2/scripts/ssh-mcp.sh"]
    }
  }
}
```

`Styx` must be a trusted existing SSH config host and allow non-interactive key authentication. No local Node or Notion token is required for this SSH launcher. The Mac needs network access to Styx while using the tools; the web UI need not be open. Quit and reopen Claude when its active tasks have finished. Enable cellar in a new chat and request inventory. This Desktop configuration does not automatically configure Claude Code or mobile Claude.

Read-only protocol verification using the exact same launcher:

```sh
node v2/scripts/check-mcp.mjs -- /bin/sh /ABSOLUTE/PATH/cellar-tools/v2/scripts/ssh-mcp.sh
```

## ChatGPT via private Secure MCP Tunnel

Use the **personal** OpenAI Platform organization and personal ChatGPT workspace, not a shared lab organization. A tunnel can forward a local stdio MCP server without a public HTTP endpoint. The account must have tunnel creation/use permissions. Runtime credentials require Tunnel Read + Use; do not copy an unrestricted key into this repository or send it in a chat.

1. Create a tunnel in the personal Platform organization, associated only with the intended ChatGPT workspace.
2. Install the official `openai/tunnel-client` on Styx. Consult `tunnel-client --help` for the installed release.
3. Initialize `sample_mcp_stdio_local` with the assigned tunnel ID and MCP command `sh /home/USER/Workspace/cellar-tools/v2/scripts/run-notion-mcp.sh`.
4. Supply `CONTROL_PLANE_API_KEY` privately on Styx, run `doctor --explain`, then run the profile. Keep the tunnel process running. Do not expose the admin UI publicly.
5. In ChatGPT's custom MCP/plugin settings select Tunnel, the assigned tunnel, and the account-supported authentication settings. Review access before connecting. Test `cellar_status` and `list_inventory` first.

Tunnel creation alone is not a working connection: the tunnel client must be online and an actual ChatGPT tool call must succeed. This repository does not bundle tunnel credentials or install a public service.

Official instructions: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

## Conversation examples

- “내 셀러에 지금 남은 술을 보여줘. 같은 제품이라도 개별 병과 용량을 구분해줘.”
- “오늘 생선구이 먹는데 보유한 병 중 추천해줘. 근거가 없는 맛 정보는 추측이라고 표시해줘.”
- “10만 원 안에서 추가 구매할 술 추천해줘. 내 재고와 겹치는지 보고, 가격과 판매처는 웹에서 확인해줘.”
- “이 제품 720ml 한 병을 53,000원에 샀어. 기존 카탈로그를 먼저 찾아보고 등록 초안 보여줘.”
- “방금 이 병을 마셨어. 오늘 날짜로 소비 처리할 초안 보여줘.”
- “나는 단맛이 강한 술은 별로고 산미 있는 술을 좋아해. 취향 저장 초안 보여줘.”

Review the returned draft and explicitly confirm to apply it. A purchase recommendation never places an order. Consumption records do not imply a positive tasting rating. Preferences persist in the configured store; chat history stays with the chosen AI client.

## Errors and boundaries

- Unknown bottle: refresh inventory and select a returned physical bottle ID.
- Unknown product/variant: use `search_catalog`, inspect sources; do not invent a product ID or merge on a similar name.
- Unsupported volume: add the appropriate select option in Notion, then prepare again.
- Lost write response: use `get_operation` then `reconcile_change` with the **same** draft ID. Confirmed remote markers can recover successful writes; absence of a marker is not proof of failure.
- A still-running operation is never reclaimed automatically. After process death an operator must verify no writer remains before repairing its journal state. Do not make a new request to bypass this protection.
- Notion does not provide transactions or compare-and-swap across this workflow. Avoid concurrent edits to the same physical bottle; interrupted multi-bottle registration may be partial.
- Each Notion server config currently represents one collection/drink type. The existing connection is the sake cellar. Other types require their own source mapping; SQLite supports all types.
