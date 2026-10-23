# Cellar Tools

V1 is the existing Notion MCP + Cellar Logger skill + helper CLI package. Start with `skills/cellar-logger/SKILL.md`. Sake and wine command entry points live in `.claude/commands/`. Wine needs existing configured data sources; no wine-source IDs are guessed.

Private `config.json`, `.env`, caches and local databases are ignored. Never commit credentials or inventory exports. Existing production inventory must not be modified for tests. Run `node --test test/*.test.mjs` for v1. V2 is separate in `v2/`; do not change v1's direct Notion workflow to use a custom MCP implicitly.
