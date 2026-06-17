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

export interface AIConfigDiagnostics {
  config: AIModelConfig | null;
  ready: boolean;
  issues: string[];
  warnings: string[];
}

export const DEFAULT_MIDSCENE_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_MIDSCENE_MODEL_NAME = 'gpt-4o';
export const PLACEHOLDER_MIDSCENE_BASE_URL = 'https://replace-with-your-model-service-url/v1';
export const PLACEHOLDER_MIDSCENE_API_KEY = 'replace-with-your-api-key';

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    name: 'OpenAI',
    baseUrl: DEFAULT_MIDSCENE_BASE_URL,
    defaultModel: DEFAULT_MIDSCENE_MODEL_NAME,
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
    baseUrl: process.env.MIDSCENE_MODEL_BASE_URL ?? DEFAULT_MIDSCENE_BASE_URL,
    apiKey,
    modelName: process.env.MIDSCENE_MODEL_NAME ?? DEFAULT_MIDSCENE_MODEL_NAME,
    modelFamily: process.env.MIDSCENE_MODEL_FAMILY,
  };
}

export function getAIConfigDiagnostics(): AIConfigDiagnostics {
  const config = getAIConfig();
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!config) {
    issues.push(
      'No AI model API key configured. Set MIDSCENE_MODEL_API_KEY or OPENAI_API_KEY in .env file.',
    );
    warnings.push('Test execution will fail until an API key is provided.');
    return { config: null, ready: false, issues, warnings };
  }

  if (config.baseUrl === PLACEHOLDER_MIDSCENE_BASE_URL) {
    issues.push(
      'MIDSCENE_MODEL_BASE_URL still has placeholder value. Update it to your actual model service URL.',
    );
  }

  if (config.apiKey === PLACEHOLDER_MIDSCENE_API_KEY) {
    issues.push('MIDSCENE_MODEL_API_KEY still has placeholder value. Update it to your actual API key.');
  }

  if (!config.modelName.trim()) {
    issues.push('MIDSCENE_MODEL_NAME is required. Set it explicitly or rely on the default gpt-4o preset.');
  }

  if (!process.env.MIDSCENE_MODEL_API_KEY && process.env.OPENAI_API_KEY) {
    warnings.push('MIDSCENE_MODEL_API_KEY is unset; OPENAI_API_KEY will be mirrored into Midscene runtime config.');
  }

  if (!process.env.MIDSCENE_MODEL_NAME) {
    warnings.push(`MIDSCENE_MODEL_NAME is unset; defaulting to ${DEFAULT_MIDSCENE_MODEL_NAME}.`);
  }

  if (!process.env.MIDSCENE_MODEL_BASE_URL) {
    warnings.push(`MIDSCENE_MODEL_BASE_URL is unset; defaulting to ${DEFAULT_MIDSCENE_BASE_URL}.`);
  }

  return {
    config,
    ready: issues.length === 0,
    issues,
    warnings,
  };
}

export function applyAIConfigDefaultsToEnv(): AIConfigDiagnostics {
  const config = getAIConfig();
  if (!config) {
    return getAIConfigDiagnostics();
  }

  if (!process.env.MIDSCENE_MODEL_API_KEY) {
    process.env.MIDSCENE_MODEL_API_KEY = config.apiKey;
  }

  if (!process.env.MIDSCENE_MODEL_BASE_URL) {
    process.env.MIDSCENE_MODEL_BASE_URL = config.baseUrl;
  }

  if (!process.env.MIDSCENE_MODEL_NAME) {
    process.env.MIDSCENE_MODEL_NAME = config.modelName;
  }

  if (!process.env.MIDSCENE_MODEL_FAMILY && config.modelFamily) {
    process.env.MIDSCENE_MODEL_FAMILY = config.modelFamily;
  }

  return getAIConfigDiagnostics();
}

/**
 * Validate AI configuration on startup.
 * Returns warning messages (empty array if all good).
 */
export function validateAIConfig(): string[] {
  const diagnostics = getAIConfigDiagnostics();
  return [...diagnostics.issues, ...diagnostics.warnings];
}
