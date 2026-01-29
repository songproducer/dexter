import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi } from './api.js';
import { formatToolResult } from '../types.js';

const FinancialStatementsInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch financial statements for. For example, 'AAPL' for Apple."
    ),
  period: z
    .enum(['annual', 'quarterly'])
    .describe(
      "The reporting period for the financial statements. 'annual' for yearly, 'quarterly' for quarterly."
    ),
  limit: z
    .number()
    .default(10)
    .describe(
      'Maximum number of report periods to return (default: 10). Returns the most recent N periods based on the period type.'
    ),
});

function createParams(input: z.infer<typeof FinancialStatementsInputSchema>): Record<string, string | number | undefined> {
  return {
    symbol: input.ticker,
    period: input.period,
    limit: input.limit,
  };
}

export const getIncomeStatements = new DynamicStructuredTool({
  name: 'get_income_statements',
  description: `Fetches a company's income statements, detailing its revenues, expenses, net income, etc. over a reporting period. Useful for evaluating a company's profitability and operational efficiency.`,
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi('/income-statement', params);
    // FMP returns array directly
    const result = Array.isArray(data) ? data : [];
    return formatToolResult(result, [url]);
  },
});

export const getBalanceSheets = new DynamicStructuredTool({
  name: 'get_balance_sheets',
  description: `Retrieves a company's balance sheets, providing a snapshot of its assets, liabilities, shareholders' equity, etc. at a specific point in time. Useful for assessing a company's financial position.`,
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi('/balance-sheet-statement', params);
    // FMP returns array directly
    const result = Array.isArray(data) ? data : [];
    return formatToolResult(result, [url]);
  },
});

export const getCashFlowStatements = new DynamicStructuredTool({
  name: 'get_cash_flow_statements',
  description: `Retrieves a company's cash flow statements, showing how cash is generated and used across operating, investing, and financing activities. Useful for understanding a company's liquidity and solvency.`,
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi('/cash-flow-statement', params);
    // FMP returns array directly
    const result = Array.isArray(data) ? data : [];
    return formatToolResult(result, [url]);
  },
});

export const getAllFinancialStatements = new DynamicStructuredTool({
  name: 'get_all_financial_statements',
  description: `Retrieves all three financial statements (income statements, balance sheets, and cash flow statements) for a company. Useful when you need all three for comprehensive financial analysis.`,
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const params = createParams(input);
    // FMP doesn't have a combined endpoint, fetch all three in parallel
    const [incomeResult, balanceResult, cashFlowResult] = await Promise.all([
      callApi('/income-statement', params),
      callApi('/balance-sheet-statement', params),
      callApi('/cash-flow-statement', params),
    ]);
    const result = {
      income_statements: Array.isArray(incomeResult.data) ? incomeResult.data : [],
      balance_sheets: Array.isArray(balanceResult.data) ? balanceResult.data : [],
      cash_flow_statements: Array.isArray(cashFlowResult.data) ? cashFlowResult.data : [],
    };
    return formatToolResult(result, [incomeResult.url, balanceResult.url, cashFlowResult.url]);
  },
});

