import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';

// Import all finance tools directly (avoid circular deps with index.ts)
import { getIncomeStatements, getBalanceSheets, getCashFlowStatements, getAllFinancialStatements } from './fundamentals.js';
import { getFilings, get10KFilingItems, get10QFilingItems, get8KFilingItems } from './filings.js';
import { getPriceSnapshot, getPrices } from './prices.js';
import { getFinancialMetricsSnapshot, getFinancialMetrics } from './metrics.js';
import { getNews } from './news.js';
import { getAnalystEstimates } from './estimates.js';
import { getSegmentedRevenues } from './segments.js';
import { getCryptoPriceSnapshot, getCryptoPrices, getCryptoTickers } from './crypto.js';
import { getInsiderTrades } from './insider_trades.js';
import { getCompanyFacts } from './company_facts.js';

/**
 * Check if we should use heuristic routing instead of LLM-based routing.
 * Local models (LM Studio, Ollama) typically don't support tool/function calling,
 * so we always use heuristic routing for them.
 */
function shouldUseHeuristicRouting(model: string): boolean {
  return model.startsWith('lmstudio:') || model.startsWith('ollama:');
}

/**
 * Heuristic-based query routing for local models without tool calling support.
 * Maps query keywords to appropriate finance tools.
 */
function heuristicRoute(query: string): { tool: string; args: Record<string, unknown> }[] {
  const q = query.toLowerCase();
  const results: { tool: string; args: Record<string, unknown> }[] = [];

  // Extract ticker (uppercase 1-5 letters, common stock ticker pattern)
  const tickerMatch = query.match(/\b([A-Z]{1,5})\b/);
  const ticker = tickerMatch?.[1];

  // Crypto detection - map common names to their ticker symbols (FMP uses no hyphen format)
  const cryptoNameToTicker: Record<string, string> = {
    bitcoin: 'BTCUSD',
    btc: 'BTCUSD',
    ethereum: 'ETHUSD',
    eth: 'ETHUSD',
    tezos: 'XTZUSD',
    xtz: 'XTZUSD',
    solana: 'SOLUSD',
    sol: 'SOLUSD',
    cardano: 'ADAUSD',
    ada: 'ADAUSD',
    polkadot: 'DOTUSD',
    dot: 'DOTUSD',
    ripple: 'XRPUSD',
    xrp: 'XRPUSD',
    dogecoin: 'DOGEUSD',
    doge: 'DOGEUSD',
    litecoin: 'LTCUSD',
    ltc: 'LTCUSD',
    chainlink: 'LINKUSD',
    link: 'LINKUSD',
    avalanche: 'AVAXUSD',
    avax: 'AVAXUSD',
    polygon: 'MATICUSD',
    matic: 'MATICUSD',
    uniswap: 'UNIUSD',
    uni: 'UNIUSD',
  };

  // Check for crypto keywords - collect ALL matching cryptos
  const cryptoTickers: string[] = [];
  for (const [name, ticker_] of Object.entries(cryptoNameToTicker)) {
    if (q.includes(name)) {
      // Avoid duplicates (e.g., "btc" and "bitcoin" both map to BTCUSD)
      if (!cryptoTickers.includes(ticker_)) {
        cryptoTickers.push(ticker_);
      }
    }
  }
  // Also check for generic crypto keyword
  const isGenericCrypto = /\b(crypto|cryptocurrency)\b/i.test(q);

  if (!ticker && cryptoTickers.length === 0 && !isGenericCrypto) {
    return []; // Can't determine what to query
  }

  // Route based on keywords
  if (q.includes('price') || q.includes('quote') || q.includes('trading') || q.includes('stock price') || cryptoTickers.length > 0) {
    if (cryptoTickers.length > 0) {
      // Add price snapshot for each crypto found
      for (const cryptoTicker of cryptoTickers) {
        results.push({ tool: 'get_crypto_price_snapshot', args: { ticker: cryptoTicker } });
      }
    } else if (isGenericCrypto) {
      // Default to BTC for generic crypto queries
      results.push({ tool: 'get_crypto_price_snapshot', args: { ticker: 'BTC-USD' } });
    } else if (ticker) {
      results.push({ tool: 'get_price_snapshot', args: { ticker } });
    }
  }

  if (q.includes('income') || q.includes('revenue') || q.includes('earnings') || q.includes('profit')) {
    if (ticker) {
      results.push({ tool: 'get_income_statements', args: { ticker, period: 'annual', limit: 4 } });
    }
  }

  if (q.includes('balance') || q.includes('assets') || q.includes('debt') || q.includes('liabilities')) {
    if (ticker) {
      results.push({ tool: 'get_balance_sheets', args: { ticker, period: 'annual', limit: 4 } });
    }
  }

  if (q.includes('cash flow') || q.includes('cashflow') || q.includes('free cash flow')) {
    if (ticker) {
      results.push({ tool: 'get_cash_flow_statements', args: { ticker, period: 'annual', limit: 4 } });
    }
  }

  if (q.includes('profile') || q.includes('company') || q.includes('about') || q.includes('overview')) {
    if (ticker) {
      results.push({ tool: 'get_company_facts', args: { ticker } });
    }
  }

  if (q.includes('metric') || q.includes('p/e') || q.includes('pe ratio') || q.includes('market cap') || q.includes('valuation')) {
    if (ticker) {
      results.push({ tool: 'get_financial_metrics_snapshot', args: { ticker } });
    }
  }

  if (q.includes('news') || q.includes('headlines') || q.includes('latest')) {
    if (ticker) {
      results.push({ tool: 'get_news', args: { ticker, limit: 10 } });
    }
  }

  if (q.includes('insider') || q.includes('insider trading') || q.includes('insider trades')) {
    if (ticker) {
      results.push({ tool: 'get_insider_trades', args: { ticker, limit: 20 } });
    }
  }

  if (q.includes('estimate') || q.includes('analyst') || q.includes('forecast') || q.includes('target')) {
    if (ticker) {
      results.push({ tool: 'get_analyst_estimates', args: { ticker, period: 'annual', limit: 4 } });
    }
  }

  if (q.includes('filing') || q.includes('10-k') || q.includes('10-q') || q.includes('8-k') || q.includes('sec')) {
    if (ticker) {
      results.push({ tool: 'get_filings', args: { ticker, limit: 10 } });
    }
  }

  if (q.includes('segment') || q.includes('breakdown') || q.includes('by region') || q.includes('by product')) {
    if (ticker) {
      results.push({ tool: 'get_segmented_revenues', args: { ticker, period: 'annual', limit: 4 } });
    }
  }

  // Default: price snapshot if we have a ticker but no specific keywords matched
  if (results.length === 0 && ticker) {
    results.push({ tool: 'get_price_snapshot', args: { ticker } });
  }

  return results;
}

// All finance tools available for routing
const FINANCE_TOOLS: StructuredToolInterface[] = [
  // Price Data
  getPriceSnapshot,
  getPrices,
  getCryptoPriceSnapshot,
  getCryptoPrices,
  getCryptoTickers,
  // Fundamentals
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  // Metrics & Estimates
  getFinancialMetricsSnapshot,
  getFinancialMetrics,
  getAnalystEstimates,
  // SEC Filings
  getFilings,
  get10KFilingItems,
  get10QFilingItems,
  get8KFilingItems,
  // Other Data
  getNews,
  getInsiderTrades,
  getSegmentedRevenues,
  getCompanyFacts,
];

// Create a map for quick tool lookup by name
const FINANCE_TOOL_MAP = new Map(FINANCE_TOOLS.map(t => [t.name, t]));

// Build the router system prompt - simplified since LLM sees tool schemas
function buildRouterPrompt(): string {
  return `You are a financial data routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about financial data, call the appropriate financial tool(s).

## Guidelines

1. **Ticker Resolution**: Convert company names to ticker symbols:
   - Apple → AAPL, Tesla → TSLA, Microsoft → MSFT, Amazon → AMZN
   - Google/Alphabet → GOOGL, Meta/Facebook → META, Nvidia → NVDA

2. **Date Inference**: Convert relative dates to YYYY-MM-DD format:
   - "last year" → start_date 1 year ago, end_date today
   - "last quarter" → start_date 3 months ago, end_date today
   - "past 5 years" → start_date 5 years ago, end_date today
   - "YTD" → start_date Jan 1 of current year, end_date today

3. **Tool Selection**:
   - For "current" or "latest" data, use snapshot tools (get_price_snapshot, get_financial_metrics_snapshot)
   - For "historical" or "over time" data, use date-range tools
   - For P/E ratio, market cap, valuation metrics → get_financial_metrics_snapshot
   - For revenue, earnings, profitability → get_income_statements
   - For debt, assets, equity → get_balance_sheets
   - For cash flow, free cash flow → get_cash_flow_statements
   - For comprehensive analysis → get_all_financial_statements

4. **Efficiency**:
   - Prefer specific tools over general ones when possible
   - Use get_all_financial_statements only when multiple statement types needed
   - For comparisons between companies, call the same tool for each ticker

Call the appropriate tool(s) now.`;
}

// Input schema for the financial_search tool
const FinancialSearchInputSchema = z.object({
  query: z.string().describe('Natural language query about financial data'),
});

/**
 * Create a financial_search tool configured with the specified model.
 * Uses native LLM tool calling for routing queries to finance tools.
 */
export function createFinancialSearch(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'financial_search',
    description: `Intelligent agentic search for financial data. Takes a natural language query and automatically routes to appropriate financial data tools. Use for:
- Stock prices (current or historical)
- Company financials (income statements, balance sheets, cash flow)
- Financial metrics (P/E ratio, market cap, EPS, dividend yield)
- SEC filings (10-K, 10-Q, 8-K)
- Analyst estimates and price targets
- Company news
- Insider trading activity
- Cryptocurrency prices`,
    schema: FinancialSearchInputSchema,
    func: async (input) => {
      // Use heuristic routing for local models (they typically don't support tool calling)
      if (shouldUseHeuristicRouting(model)) {
        const routes = heuristicRoute(input.query);
        if (routes.length === 0) {
          return formatToolResult(
            {
              error:
                'Could not determine which financial data to fetch. Try including a ticker symbol (e.g., AAPL) and keywords like "price", "income", "balance sheet".',
            },
            []
          );
        }

        // Execute heuristic-selected tools in parallel
        const results = await Promise.all(
          routes.map(async ({ tool, args }) => {
            const toolInstance = FINANCE_TOOL_MAP.get(tool);
            if (!toolInstance) {
              return { tool, args, data: null, sourceUrls: [] as string[], error: `Tool ${tool} not found` };
            }
            try {
              const rawResult = await toolInstance.invoke(args);
              const parsed = JSON.parse(typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult));
              return { tool, args, data: parsed.data, sourceUrls: (parsed.sourceUrls || []) as string[], error: null };
            } catch (e) {
              return {
                tool,
                args,
                data: null,
                sourceUrls: [] as string[],
                error: e instanceof Error ? e.message : String(e),
              };
            }
          })
        );

        // Format results
        const combinedData: Record<string, unknown> = {};
        const allUrls: string[] = [];
        const successfulResults = results.filter((r) => r.error === null);
        const failedResults = results.filter((r) => r.error !== null);

        for (const r of successfulResults) {
          const ticker = (r.args as Record<string, unknown>).ticker as string | undefined;
          const key = ticker ? `${r.tool}_${ticker}` : r.tool;
          combinedData[key] = r.data;
          allUrls.push(...r.sourceUrls);
        }

        // If ALL tools failed, return a clear error message
        if (successfulResults.length === 0 && failedResults.length > 0) {
          const errorDetails = failedResults.map((r) => {
            const ticker = (r.args as Record<string, unknown>).ticker;
            return `${r.tool}(${ticker || 'no ticker'}): ${r.error}`;
          });
          return formatToolResult(
            {
              _error: {
                message: 'All financial data sources failed',
                details: errorDetails,
                hint: 'The requested data may not be available from Financial Modeling Prep. Try a different ticker or check if FMP_API_KEY is set.',
              },
            },
            []
          );
        }

        // Add errors if some (but not all) tools failed
        if (failedResults.length > 0) {
          combinedData._errors = failedResults.map((r) => ({
            tool: r.tool,
            args: r.args,
            error: r.error,
          }));
        }

        return formatToolResult(combinedData, allUrls);
      }

      // 1. Call LLM with finance tools bound (native tool calling)
      const response = await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools: FINANCE_TOOLS,
      }) as AIMessage;

      // 2. Check for tool calls
      const toolCalls = response.tool_calls as ToolCall[];
      if (!toolCalls || toolCalls.length === 0) {
        return formatToolResult({ error: 'No tools selected for query' }, []);
      }

      // 3. Execute tool calls in parallel
      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          try {
            const tool = FINANCE_TOOL_MAP.get(tc.name);
            if (!tool) {
              throw new Error(`Tool '${tc.name}' not found`);
            }
            const rawResult = await tool.invoke(tc.args);
            const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
            const parsed = JSON.parse(result);
            return {
              tool: tc.name,
              args: tc.args,
              data: parsed.data,
              sourceUrls: parsed.sourceUrls || [],
              error: null,
            };
          } catch (error) {
            return {
              tool: tc.name,
              args: tc.args,
              data: null,
              sourceUrls: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      // 4. Combine results
      const successfulResults = results.filter((r) => r.error === null);
      const failedResults = results.filter((r) => r.error !== null);

      // Collect all source URLs
      const allUrls = results.flatMap((r) => r.sourceUrls);

      // Build combined data structure
      const combinedData: Record<string, unknown> = {};

      for (const result of successfulResults) {
        // Use tool name as key, or tool_ticker for multiple calls to same tool
        const ticker = (result.args as Record<string, unknown>).ticker as string | undefined;
        const key = ticker ? `${result.tool}_${ticker}` : result.tool;
        combinedData[key] = result.data;
      }

      // Add errors if any
      if (failedResults.length > 0) {
        combinedData._errors = failedResults.map((r) => ({
          tool: r.tool,
          args: r.args,
          error: r.error,
        }));
      }

      return formatToolResult(combinedData, allUrls);
    },
  });
}
