/**
 * DeepSeek API Client — OpenAI-compatible interface.
 * V4 Pro (deepseek-reasoner): razonamiento profundo para planificación y revisión adversarial.
 * Flash (deepseek-chat): generación rápida para producir skill.md + validate.sh.
 */

const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';

export type DeepSeekModel = 'v4' | 'flash';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekResponse {
  choices: { message: { content: string } }[];
}

function getModelId(model: DeepSeekModel): string {
  if (model === 'v4') {
    return process.env.DEEPSEEK_V4_MODEL || 'deepseek-reasoner';
  }
  return process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-chat';
}

function getApiKey(): string {
  return process.env.DEEPSEEK_API_KEY || '';
}

/**
 * Call DeepSeek API with OpenAI-compatible chat completions format.
 */
export async function deepseekChat(
  model: DeepSeekModel,
  messages: DeepSeekMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    responseFormat?: 'text' | 'json_object';
  }
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY no está configurada. Revisa tu archivo .env');
  }

  const body: Record<string, unknown> = {
    model: getModelId(model),
    messages,
    max_tokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.3,
  };

  if (options?.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as DeepSeekResponse;
  return data.choices[0]?.message?.content ?? '';
}
