/**
 * LM Studio API utilities
 * LM Studio provides an OpenAI-compatible API
 */

interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}

interface LMStudioModelsResponse {
  data: LMStudioModel[];
}

/**
 * Fetches locally loaded models from the LM Studio API
 */
export async function getLMStudioModels(): Promise<string[]> {
  const baseUrl = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1';

  try {
    const response = await fetch(`${baseUrl}/models`);

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as LMStudioModelsResponse;
    return data.data.map((m) => m.id);
  } catch {
    // LM Studio not running or unreachable
    return [];
  }
}
