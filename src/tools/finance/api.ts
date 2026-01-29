const BASE_URL = 'https://financialmodelingprep.com/stable';

export interface ApiResponse {
  data: Record<string, unknown>;
  url: string;
}

export async function callApi(
  endpoint: string,
  params: Record<string, string | number | string[] | undefined>
): Promise<ApiResponse> {
  // Read API key lazily at call time (after dotenv has loaded)
  const FMP_API_KEY = process.env.FMP_API_KEY;
  const url = new URL(`${BASE_URL}${endpoint}`);

  // Add API key as query param (FMP authentication)
  url.searchParams.append('apikey', FMP_API_KEY || '');

  // Add params to URL, handling arrays
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, v));
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { data, url: url.toString() };
}

