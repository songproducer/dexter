import Exa from 'exa-js';
import type { AgentEvent } from '../agent/types.js';

// Lazily initialized Exa client
let exaClient: Exa | null = null;

function getExaClient(): Exa {
  if (!exaClient) {
    const apiKey = process.env.EXASEARCH_API_KEY;
    if (!apiKey) {
      throw new Error('EXASEARCH_API_KEY not found in environment variables');
    }
    exaClient = new Exa(apiKey);
  }
  return exaClient;
}

/**
 * Check if a model is an Exa model
 */
export function isExaModel(model: string): boolean {
  return model.startsWith('exa:');
}

/**
 * Get the Exa mode from the model string
 */
export function getExaMode(model: string): 'answer' | 'search' {
  const mode = model.replace(/^exa:/, '');
  return mode === 'search' ? 'search' : 'answer';
}

interface ExaAnswerResponse {
  answer: string;
  citations: Array<{
    id: string;
    url: string;
    title: string;
    author?: string;
    publishedDate?: string;
    text?: string;
  }>;
}

interface ExaSearchResponse {
  results: Array<{
    title: string | null;
    url: string;
    publishedDate?: string;
    author?: string;
    text?: string;
    highlights?: string[];
  }>;
}

/**
 * Format citations as markdown
 */
function formatCitations(citations: ExaAnswerResponse['citations']): string {
  if (citations.length === 0) return '';

  const citationList = citations
    .map((c, i) => {
      const date = c.publishedDate ? ` (${new Date(c.publishedDate).toLocaleDateString()})` : '';
      return `${i + 1}. [${c.title}](${c.url})${date}`;
    })
    .join('\n');

  return `\n\n**Sources:**\n${citationList}`;
}

/**
 * Format search results as markdown
 */
function formatSearchResults(results: ExaSearchResponse['results']): string {
  return results
    .map((r, i) => {
      const title = r.title || 'Untitled';
      const date = r.publishedDate ? ` (${new Date(r.publishedDate).toLocaleDateString()})` : '';
      const snippet = r.highlights?.join(' ') || r.text?.slice(0, 300) || '';
      return `### ${i + 1}. ${title}${date}\n${r.url}\n\n${snippet}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Run Exa as a "model" - bypasses the agent loop entirely.
 * Yields events compatible with the Agent event stream.
 */
export async function* runExaModel(
  query: string,
  model: string
): AsyncGenerator<AgentEvent> {
  const mode = getExaMode(model);
  const client = getExaClient();

  yield { type: 'thinking', message: `Searching with Exa (${mode} mode)...` };

  try {
    if (mode === 'answer') {
      // Use Exa's Answer endpoint - returns LLM-generated answer with citations
      const response = await client.answer(query, {
        text: true,
      }) as ExaAnswerResponse;

      const answer = response.answer + formatCitations(response.citations);

      yield {
        type: 'done',
        answer,
        toolCalls: [{
          tool: 'exa_answer',
          args: { query },
          result: response.answer,
        }],
        iterations: 1,
      };
    } else {
      // Use Exa's Search endpoint - returns raw search results
      const response = await client.searchAndContents(query, {
        numResults: 5,
        highlights: true,
      }) as ExaSearchResponse;

      const answer = formatSearchResults(response.results);

      yield {
        type: 'done',
        answer,
        toolCalls: [{
          tool: 'exa_search',
          args: { query },
          result: `Found ${response.results.length} results`,
        }],
        iterations: 1,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    yield {
      type: 'done',
      answer: `Error from Exa: ${errorMessage}`,
      toolCalls: [],
      iterations: 1,
    };
  }
}

/**
 * Quick reference for Exa parameters.
 * Can be shown via /exa-docs command.
 */
export const EXA_QUICK_DOCS = `
# Exa Search Quick Reference

## How to Use

Just type naturally - Dexter auto-detects what you need:

  "tweets about NVDA"           → searches Twitter/X
  "research papers on RAG"      → searches academic papers
  "Tesla github repos"          → searches GitHub
  "latest news on Fed rates"    → searches news articles
  "Bitcoin whitepaper pdf"      → searches PDFs

## Query Modifiers

Add these phrases to control search behavior:

  TIME:
  "...from the last 24 hours"   → maxAgeHours: 24
  "...from this week"           → maxAgeHours: 168
  "...from today"               → maxAgeHours: 24

  SOURCES:
  "...from arxiv"               → includeDomains: ["arxiv.org"]
  "...from reuters or bloomberg"→ includeDomains: ["reuters.com", "bloomberg.com"]
  "...not from reddit"          → excludeDomains: ["reddit.com"]

  QUANTITY:
  "...give me 10 results"       → numResults: 10

## Example Queries

  TWEETS:
  "What are people tweeting about Tezos?"
  "Latest mass tweets about Tesla stock"
  "Twitter sentiment on Bitcoin today"

  RESEARCH:
  "Recent papers on transformer architecture"
  "Arxiv research about diffusion models"
  "Academic studies on LLM hallucination"

  NEWS:
  "Breaking news on Apple earnings"
  "Latest headlines about AI regulation"
  "News from the last 24 hours about SpaceX"

  GITHUB:
  "Open source alternatives to Notion"
  "React state management repos"
  "Python libraries for web scraping github"

  FINANCIAL:
  "Tesla 10-K SEC filing"
  "Apple quarterly earnings report"
  "Amazon annual report 2024"

## Categories (Auto-Detected)

  tweets, twitter, x posts      → tweet
  research, paper, arxiv        → research paper
  github, repo, code            → github
  news, headlines               → news
  pdf, whitepaper               → pdf
  10-k, 10-q, sec filing        → financial report
  company, startup              → company

## Exa Model (Fast Mode)

Select "Exa (Fast Search)" as provider for instant answers:
  • exa:answer - Quick factual answers with citations
  • exa:search - Raw search results
`.trim();
