/**
 * AI Model Configuration
 *
 * Centralized management of AI model settings.
 * Reads from environment variables and provides provider presets.
 */

export interface AIModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  modelFamily?: string;
}

export interface ProviderPreset {
  name: string;
  baseUrl: string;
  defaultModel: string;
  modelFamily?: string;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  qwen: {
    name: 'Qwen (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3-vl',
    modelFamily: 'qwen-vl',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
  },
};

/**
 * Read AI model configuration from environment variables.
 * Returns null if no API key is configured.
 */
export function getAIConfig(): AIModelConfig | null {
  const apiKey = process.env.MIDSCENE_MODEL_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return {
    baseUrl: process.env.MIDSCENE_MODEL_BASE_URL ?? 'https://api.openai.com/v1',
    apiKey,
    modelName: process.env.MIDSCENE_MODEL_NAME ?? 'gpt-4o',
    modelFamily: process.env.MIDSCENE_MODEL_FAMILY,
  };
}

/**
 * Validate AI configuration on startup.
 * Returns warning messages (empty array if all good).
 */
export function validateAIConfig(): string[] {
  const warnings: string[] = [];
  const config = getAIConfig();

  if (!config) {
    warnings.push(
      'No AI model API key configured. Set MIDSCENE_MODEL_API_KEY or OPENAI_API_KEY in .env file.',
    );
    warnings.push('Test execution will fail until an API key is provided.');
    return warnings;
  }

  if (config.baseUrl === 'https://replace-with-your-model-service-url/v1') {
    warnings.push('MIDSCENE_MODEL_BASE_URL still has placeholder value. Update it to your actual model service URL.');
  }

  if (config.apiKey === 'replace-with-your-api-key') {
    warnings.push('MIDSCENE_MODEL_API_KEY still has placeholder value. Update it to your actual API key.');
  }

  return warnings;
}
