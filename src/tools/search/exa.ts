import { DynamicStructuredTool } from '@langchain/core/tools';
import Exa from 'exa-js';
import { z } from 'zod';
import { formatToolResult, parseSearchResults } from '../types.js';

// Lazily initialized to avoid errors when API key is not set
let exaClient: Exa | null = null;

function getExaClient(): Exa {
  if (!exaClient) {
    exaClient = new Exa(process.env.EXASEARCH_API_KEY);
  }
  return exaClient;
}

const categoryEnum = z.enum([
  'company',
  'research paper',
  'news',
  'github',
  'tweet',
  'personal site',
  'pdf',
  'financial report',
  'people',
]);

const searchTypeEnum = z.enum(['neural', 'keyword', 'auto']);

type ExaCategory = z.infer<typeof categoryEnum>;

/**
 * Detect category from query keywords when LLM doesn't specify one
 */
function detectCategoryFromQuery(query: string): ExaCategory | undefined {
  const q = query.toLowerCase();

  // Tweet/Twitter/X detection
  if (/\b(tweets?|twitter|x posts?|x\.com)\b/.test(q)) {
    return 'tweet';
  }

  // Research/academic detection
  if (/\b(research|paper|papers|study|studies|arxiv|academic|journal)\b/.test(q)) {
    return 'research paper';
  }

  // GitHub/code detection
  if (/\b(github|repo|repository|code|open source|oss)\b/.test(q)) {
    return 'github';
  }

  // News detection
  if (/\b(news|headline|headlines|breaking|latest news)\b/.test(q)) {
    return 'news';
  }

  // PDF detection
  if (/\b(pdf|whitepaper|white paper|documentation)\b/.test(q)) {
    return 'pdf';
  }

  // Company detection
  if (/\b(company|companies|startup|startups|corporation)\b/.test(q)) {
    return 'company';
  }

  // Financial report detection
  if (/\b(10-k|10-q|annual report|quarterly report|sec filing|earnings report)\b/.test(q)) {
    return 'financial report';
  }

  return undefined;
}

export const exaSearch = new DynamicStructuredTool({
  name: 'web_search',
  description: `Search the web for current information on any topic. Returns relevant search results with URLs and content snippets.

Advanced options:
- maxAgeHours: Filter to recent content (e.g., 24 for last day, 168 for last week)
- category: Filter by content type (tweet, research paper, news, github, company, pdf, etc.)
- includeDomains/excludeDomains: Filter to specific sites (e.g., ["arxiv.org", "github.com"])
- type: Search mode - "neural" (semantic), "keyword" (exact match), or "auto" (default)`,
  schema: z.object({
    query: z.string().describe('The search query to look up on the web'),
    maxAgeHours: z
      .number()
      .optional()
      .describe('Only return results published within the last N hours'),
    category: categoryEnum
      .optional()
      .describe('Filter results by content category'),
    includeDomains: z
      .array(z.string())
      .optional()
      .describe('Only include results from these domains'),
    excludeDomains: z
      .array(z.string())
      .optional()
      .describe('Exclude results from these domains'),
    numResults: z
      .number()
      .optional()
      .describe('Number of results to return (default: 5, max: 10)'),
    type: searchTypeEnum
      .optional()
      .describe('Search type: neural (semantic), keyword (exact), or auto'),
  }),
  func: async (input) => {
    const client = getExaClient();

    // Auto-detect category from query if not explicitly provided
    const detectedCategory = input.category ?? detectCategoryFromQuery(input.query);

    const searchOptions: Parameters<typeof client.searchAndContents>[1] = {
      numResults: Math.min(input.numResults ?? 5, 10),
      highlights: true,
    };

    if (input.maxAgeHours) {
      searchOptions.startPublishedDate = new Date(
        Date.now() - input.maxAgeHours * 60 * 60 * 1000
      ).toISOString();
    }
    if (detectedCategory) {
      searchOptions.category = detectedCategory;
    }
    if (input.includeDomains?.length) {
      searchOptions.includeDomains = input.includeDomains;
    }
    if (input.excludeDomains?.length) {
      searchOptions.excludeDomains = input.excludeDomains;
    }
    if (input.type) {
      searchOptions.type = input.type;
    }

    const response = await client.searchAndContents(input.query, searchOptions);

    // Format results similar to LangChain wrapper output
    const resultText = response.results
      .map((r) => {
        const result = r as typeof r & { highlights?: string[] };
        const highlights = result.highlights?.join('\n') ?? '';
        return `Title: ${r.title}\nURL: ${r.url}\nPublished: ${r.publishedDate ?? 'N/A'}\n${highlights}`;
      })
      .join('\n\n---\n\n');

    const urls = response.results.map((r) => r.url);
    const { parsed } = parseSearchResults(resultText);
    return formatToolResult(parsed, urls);
  },
});
