# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dexter is an autonomous financial research agent built with TypeScript and Bun. It performs deep financial analysis using task planning, self-reflection, and real-time market data. The CLI is built with React/Ink for terminal rendering.

## Commands

```bash
bun start          # Run Dexter in interactive mode
bun dev            # Development mode with watch
bun run typecheck  # TypeScript type checking
bun test           # Run tests
bun test --watch   # Run tests in watch mode
```

## Architecture

### Agent Loop (`src/agent/`)
The core engine in `agent.ts` orchestrates the research cycle:
1. Query → System prompt with tools → LLM call
2. Parse response for tool calls → Execute tools → Add results to scratchpad
3. Context compaction: LLM summaries during loop, full data preserved for final answer
4. Loop until: final answer, max iterations (default 10), or abort signal

Key files:
- `agent.ts` - Main Agent class with run() generator yielding events
- `prompts.ts` - System prompt building, iteration prompts, final answer prompts
- `scratchpad.ts` - Append-only JSONL log in `.dexter/scratchpad/` for all agent work

### Tool System (`src/tools/`)
Tools are registered in `registry.ts` with conditional inclusion based on API keys:
- `financial_search` - Always included (requires FMP_API_KEY for Financial Modeling Prep)
- `web_search` - Exa preferred (EXASEARCH_API_KEY), Tavily fallback (TAVILY_API_KEY)
- `skill` - Included if any skills are discovered

Add new tools by:
1. Creating tool in `tools/` directory using LangChain's `StructuredToolInterface`
2. Adding description in `tools/descriptions/`
3. Registering in `registry.ts` with conditional logic if needed

### Skills System (`src/skills/`)
Extended workflows discovered at runtime from SKILL.md files with YAML frontmatter.

Skill search order (later overrides earlier):
1. `src/skills/` - Builtin skills
2. `~/.dexter/skills/` - User skills
3. `.dexter/skills/` - Project-specific skills

Create a new skill by adding a directory with a SKILL.md file:
```markdown
---
name: my-skill
description: When to trigger this skill
---
# Skill Instructions
Step-by-step workflow...
```

### Multi-Provider LLM Support (`src/model/llm.ts`)
Dynamic model factory supporting OpenAI (default), Anthropic, Google, xAI, Ollama, and LM Studio. Each provider has a "fast model" variant used for lightweight tasks like summarization.

Model prefix conventions:
- `lmstudio:model-name` - LM Studio local models
- `ollama:model-name` - Ollama local models
- `claude-*`, `gemini-*`, `grok-*` - Cloud providers (auto-detected)
- No prefix - defaults to OpenAI

### React/Ink CLI (`src/cli.tsx`, `src/components/`)
Terminal UI built with React 19 + Ink. Agent yields events (`thinking`, `tool_start`, `tool_end`, `answer_start`, `done`) consumed by components for real-time updates.

## Environment Variables

Required:
- `FMP_API_KEY` - Financial Modeling Prep API key (https://financialmodelingprep.com)

LLM Providers (at least one):
- `OPENAI_API_KEY` - OpenAI (default)
- `ANTHROPIC_API_KEY` - Anthropic Claude
- `GOOGLE_API_KEY` - Google Gemini
- `XAI_API_KEY` - xAI Grok
- `OLLAMA_BASE_URL` - Ollama local server (default: http://127.0.0.1:11434)
- `LMSTUDIO_BASE_URL` - LM Studio local server (default: http://localhost:1234/v1)

Web Search (optional, Exa preferred):
- `EXASEARCH_API_KEY`
- `TAVILY_API_KEY`

## Local Model Support (LM Studio / Ollama)

Local models typically don't support native function/tool calling. The following heuristics enable local-only operation:

### Agent-Level Tool Detection (`src/agent/agent.ts`)
- `isLocalModel()` - Detects `lmstudio:` or `ollama:` model prefixes
- `detectFinancialQuery()` - Keyword-based detection for financial queries
- On first iteration, if local model doesn't produce tool calls, agent auto-detects if `financial_search` should be called based on query keywords (price, stock, crypto, ticker symbols, etc.)

### Financial Search Heuristic Routing (`src/tools/finance/financial-search.ts`)
- `shouldUseHeuristicRouting()` - Returns true for local models
- `heuristicRoute()` - Maps query keywords to appropriate finance tools:
  - Crypto names (bitcoin, ethereum, tezos, etc.) → `get_crypto_price_snapshot`
  - Price/quote keywords → `get_price_snapshot` or `get_crypto_price_snapshot`
  - Income/revenue/earnings → `get_income_statements`
  - Balance/assets/debt → `get_balance_sheets`
  - Cash flow → `get_cash_flow_statements`
  - And more...
- Bypasses LLM-based tool routing which would fail without function calling support

### Crypto Ticker Format
FMP uses no-hyphen format: `BTCUSD`, `ETHUSD`, `XTZUSD` (not `BTC-USD`)

### FMP Crypto Endpoints (`src/tools/finance/crypto.ts`)
- Quote: `/quote?symbol=BTCUSD`
- Historical: `/historical-price-eod/light?symbol=BTCUSD&from=...&to=...`
- Available tickers: `/symbol/available-cryptocurrencies`

## Key Patterns

- **Event-driven architecture**: Agent's `run()` is an async generator yielding typed events for UI consumption
- **Context compaction**: Tool results summarized by fast LLM during loop; full data only for final answer generation
- **Path aliases**: `@/*` maps to `./src/*` in imports
- **Scratchpad persistence**: All agent work logged to `.dexter/scratchpad/` as JSONL for debugging
- **Local model fallbacks**: Heuristic-based tool selection when native function calling unavailable

## PR Guidelines

Keep pull requests small and focused.
