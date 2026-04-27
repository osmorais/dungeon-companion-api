Add a new AI provider integration to the dungeon-companion-api.

## What to do

Ask the user for:
1. **Provider name** — e.g. "Google Gemini", "Mistral", "Cohere" (used to name files and the env var key)
2. **npm package** — the SDK to install, e.g. `@google/generative-ai`, `@mistralai/mistralai`
3. **Default model names** — one for simple chat, one for agentic (tool-calling) use

Then perform all steps below without further interruption.

## Steps

### 1. Install the SDK

Run inside `dungeon-companion-api/`:
```
npm install <package>
```

### 2. Create the provider file

Create `dungeon-companion-api/src/providers/<name>.provider.ts` implementing `IAiProvider` from `./ai-provider.interface`.

The file must follow the exact same structure as the existing providers:
- `anthropic.provider.ts` — reference for Anthropic SDK style
- `openai.provider.ts` — reference for OpenAI SDK style (agentic loop using `finish_reason`)

Key rules for the new provider:
- Constructor reads `process.env.<PROVIDER>_API_KEY` and optional `process.env.<PROVIDER>_MODEL` / `process.env.<PROVIDER>_AGENT_MODEL`
- `chat()` — single-turn, returns plain text string
- `chatWithTools()` — implements the agentic loop: keep calling the model until it stops requesting tools; call `toolExecutor(name, input)` for each tool call and feed results back; return the final plain text string
- Map the `AiTool[]` parameter to the SDK's native tool/function format
- No comments explaining obvious SDK usage

### 3. Register in the factory

Edit `dungeon-companion-api/src/providers/index.ts`:
- Add the import for the new provider class
- Add an `if` branch in `createAiProvider()` for the new provider key (lowercase provider name as the `AI_PROVIDER` env value)

### 4. Build and verify

Run `npm run build` from `dungeon-companion-api/`. Fix any TypeScript errors before finishing.

### 5. Report to the user

Tell the user:
- Which file was created
- Which env vars to set in `.env` (API key + optional model overrides + the `AI_PROVIDER` value to activate it)
- Any known limitations of the SDK (e.g. if tool calling is not supported, note it)
