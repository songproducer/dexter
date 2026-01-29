import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi } from './api.js';
import { formatToolResult } from '../types.js';

const PriceSnapshotInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch the price snapshot for. For example, 'AAPL' for Apple."
    ),
});

export const getPriceSnapshot = new DynamicStructuredTool({
  name: 'get_price_snapshot',
  description: `Fetches the most recent price snapshot for a specific stock ticker, including the latest price, trading volume, and other open, high, low, and close price data.`,
  schema: PriceSnapshotInputSchema,
  func: async (input) => {
    const params = { symbol: input.ticker };
    const { data, url } = await callApi('/quote', params);
    // FMP returns an array, take first element
    const result = Array.isArray(data) ? data[0] : data;
    return formatToolResult(result || {}, [url]);
  },
});

const PricesInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch aggregated prices for. For example, 'AAPL' for Apple."
    ),
  start_date: z.string().describe('Start date in YYYY-MM-DD format. Must be in past. Required.'),
  end_date: z.string().describe('End date in YYYY-MM-DD format. Must be today or in the past. Required.'),
});

export const getPrices = new DynamicStructuredTool({
  name: 'get_prices',
  description: `Retrieves historical end-of-day price data for a stock over a specified date range, including open, high, low, close prices, and volume.`,
  schema: PricesInputSchema,
  func: async (input) => {
    const params = {
      symbol: input.ticker,
      from: input.start_date,
      to: input.end_date,
    };
    const { data, url } = await callApi('/historical-price-eod/full', params);
    // FMP returns { historical: [...] } or directly an array
    const prices = Array.isArray(data) ? data : (data.historical || []);
    return formatToolResult(prices, [url]);
  },
});

