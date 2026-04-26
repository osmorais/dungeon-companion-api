# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # incremental TypeScript compile to dist/
npm run rebuild        # full clean build
npm start              # build + start server at http://127.0.0.1:3000
npm run build:watch    # watch mode for development
npm test               # rebuild + lint + mocha suite
npm run test:dev       # mocha only (skips rebuild/lint — use during iteration)
npm run lint           # prettier + eslint check
npm run lint:fix       # auto-fix style issues
npm run migrate        # run database schema migrations
```

## Architecture

LoopBack 4 REST API with clean layered architecture and pluggable AI providers.

**Request flow:** Controller → Service → Repository → PostgresDatasource (Neon serverless)

**Key layers:**
- `src/controllers/` — HTTP endpoints; inject services via `@service()`
- `src/services/` — Business logic; `ai-agent.service.ts` orchestrates AI character generation, `character-sheet.service.ts` applies D&D 5e rules
- `src/services/character-sheet/` — Core rules engine: `rules.ts` has hardcoded D&D 5e data (races, classes, backgrounds, spell slots), `calculator.ts` applies them deterministically
- `src/repositories/` — All SQL queries; `character.repository.ts` handles multi-table character persistence
- `src/datasources/postgres.datasource.ts` — Singleton PostgreSQL connection
- `src/providers/` — AI provider abstraction (`IAiProvider` interface → `anthropic.provider.ts` / `openai.provider.ts`)
- `src/models/` — TypeScript types only (no ORM models); `character-sheet-types.ts` and `character-options-types.ts`

## AI Provider Pattern

`createAiProvider()` in `src/providers/index.ts` returns the active provider based on `AI_PROVIDER` env var (`anthropic` or `openai`).

Both providers implement `IAiProvider`:
- `chat(systemPrompt, userMessage)` — single-turn generation
- `chatWithTools(systemPrompt, userMessage, tools, executor)` — agentic loop: model calls tools (`rollDice`, `getClassFeatures`), server executes them, loop continues until `end_turn`

Anthropic defaults: `claude-sonnet-4-6` for chat, `claude-opus-4-7` for agentic. Overridable via `ANTHROPIC_MODEL` / `OPENAI_AGENT_MODEL`.

## D&D Rules Engine

All D&D 5e rules live in `src/services/character-sheet/rules.ts` — races, subraces, classes, backgrounds, weapon properties, spell slots. The calculator resolves them by ID and applies modifiers; it does **not** query the database for rules.

Attribute abbreviations are Portuguese-mapped: `FOR`→STR, `DES`→DEX, `CON`→CON, `INT`→INT, `SAB`→WIS, `CAR`→CHA. This mapping appears throughout the calculator and database columns.

## Database

PostgreSQL via `postgres` driver (not an ORM). The `character.repository.ts` executes raw SQL with manual joins across tables: `character`, `character_attribute`, `character_skill`, `character_spell`, `character_weapon`, `character_items`, and metadata tables (`race`, `class`, `background`, `alignment`, `skill`, `weapon`, `armour`, `spell`).

`@typescript-eslint/naming-convention` is disabled in service files because database column names use snake_case that conflicts with the rule.

## Environment

Required `.env` variables:
- `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `ENDPOINT_ID` — Neon PostgreSQL
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- `AI_PROVIDER` — `anthropic` or `openai`
