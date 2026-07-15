/**
 * AI Model Configuration
 *
 * Centralized management of AI model settings.
 * Reads from environment variables and provides provider presets.
 */

export type AIModelProvider = 'api' | 'codex';
export type AIReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

export interface AIModelConfig {
  provider: AIModelProvider;
  baseUrl: string;
  apiKey?: string;
  modelName: string;
  modelFamily?: string;
  reasoningEffort?: AIReasoningEffort;
}

export interface ProviderPreset {
  provider: AIModelProvider;
  name: string;
  baseUrl: string;
  defaultModel: string;
  modelFamily?: string;
  reasoningEffort?: AIReasoningEffort;
}

export interface AIConfigDiagnostics {
  config: AIModelConfig | null;
  ready: boolean;
  issues: string[];
  warnings: string[];
}

export const DEFAULT_MIDSCENE_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_MIDSCENE_MODEL_NAME = 'gpt-4o';
export const DEFAULT_CODEX_BASE_URL = 'codex://local';
export const DEFAULT_CODEX_MODEL_NAME = 'gpt-5.4';
export const DEFAULT_CODEX_MODEL_FAMILY = 'gpt-5';
export const DEFAULT_CODEX_REASONING_EFFORT: AIReasoningEffort = 'medium';
export const PLACEHOLDER_MIDSCENE_BASE_URL = 'https://replace-with-your-model-service-url/v1';
export const PLACEHOLDER_MIDSCENE_API_KEY = 'replace-with-your-api-key';
const CODEX_PROVIDER_SCHEME = 'codex://';
const AI_REASONING_EFFORTS: AIReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    provider: 'api',
    name: 'OpenAI',
    baseUrl: DEFAULT_MIDSCENE_BASE_URL,
    defaultModel: DEFAULT_MIDSCENE_MODEL_NAME,
  },
  qwen: {
    provider: 'api',
    name: 'Qwen (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3-vl',
    modelFamily: 'qwen3-vl',
  },
  anthropic: {
    provider: 'api',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
  },
  codex: {
    provider: 'codex',
    name: 'Local Codex',
    baseUrl: DEFAULT_CODEX_BASE_URL,
    defaultModel: DEFAULT_CODEX_MODEL_NAME,
    modelFamily: DEFAULT_CODEX_MODEL_FAMILY,
    reasoningEffort: DEFAULT_CODEX_REASONING_EFFORT,
  },
};

/**
 * Read AI model configuration from environment variables.
 * Returns null if the provider is invalid or the API provider has no key.
 */
export function getAIConfig(): AIModelConfig | null {
  const provider = resolveAIModelProvider();
  if (!provider) {
    return null;
  }

  if (provider === 'codex') {
    const configuredBaseUrl = process.env.MIDSCENE_MODEL_BASE_URL?.trim();
    const configuredModelName = process.env.MIDSCENE_MODEL_NAME?.trim();
    const configuredModelFamily = process.env.MIDSCENE_MODEL_FAMILY?.trim();
    const rawReasoningEffort = process.env.MIDSCENE_MODEL_REASONING_EFFORT?.trim();
    return {
      provider,
      baseUrl: configuredBaseUrl || DEFAULT_CODEX_BASE_URL,
      modelName: configuredModelName || DEFAULT_CODEX_MODEL_NAME,
      modelFamily: configuredModelFamily || DEFAULT_CODEX_MODEL_FAMILY,
      reasoningEffort: rawReasoningEffort
        ? parseReasoningEffort(rawReasoningEffort)
        : DEFAULT_CODEX_REASONING_EFFORT,
    };
  }

  const apiKey = process.env.MIDSCENE_MODEL_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return {
    provider,
    baseUrl: process.env.MIDSCENE_MODEL_BASE_URL ?? DEFAULT_MIDSCENE_BASE_URL,
    apiKey,
    modelName: process.env.MIDSCENE_MODEL_NAME ?? DEFAULT_MIDSCENE_MODEL_NAME,
    modelFamily: process.env.MIDSCENE_MODEL_FAMILY?.trim() || undefined,
    reasoningEffort: parseReasoningEffort(process.env.MIDSCENE_MODEL_REASONING_EFFORT),
  };
}

export function getAIConfigDiagnostics(): AIConfigDiagnostics {
  const issues: string[] = [];
  const warnings: string[] = [];
  const provider = resolveAIModelProvider();

  if (!provider) {
    issues.push('MIDSCENE_MODEL_PROVIDER must be either api or codex.');
    return { config: null, ready: false, issues, warnings };
  }

  const config = getAIConfig();

  if (!config) {
    issues.push(
      'No AI model API key configured for the API provider. Set MIDSCENE_MODEL_API_KEY or OPENAI_API_KEY, or select MIDSCENE_MODEL_PROVIDER=codex.',
    );
    warnings.push('Test execution will fail until an API key is provided.');
    return { config: null, ready: false, issues, warnings };
  }

  if (!config.baseUrl.trim()) {
    issues.push('MIDSCENE_MODEL_BASE_URL must not be empty.');
  }

  if (config.baseUrl === PLACEHOLDER_MIDSCENE_BASE_URL) {
    issues.push(
      'MIDSCENE_MODEL_BASE_URL still has placeholder value. Update it to your actual model service URL.',
    );
  }

  if (!config.modelName.trim()) {
    issues.push('MIDSCENE_MODEL_NAME must not be empty.');
  }

  const rawReasoningEffort = process.env.MIDSCENE_MODEL_REASONING_EFFORT?.trim().toLowerCase();
  if (rawReasoningEffort && !parseReasoningEffort(rawReasoningEffort)) {
    issues.push('MIDSCENE_MODEL_REASONING_EFFORT must be one of low, medium, high, or xhigh.');
  }

  if (provider === 'codex') {
    if (!config.baseUrl.trim().toLowerCase().startsWith(CODEX_PROVIDER_SCHEME)) {
      issues.push('The Codex provider requires MIDSCENE_MODEL_BASE_URL to start with codex://.');
    }

    if (config.modelFamily !== DEFAULT_CODEX_MODEL_FAMILY) {
      issues.push(
        `The Codex provider requires MIDSCENE_MODEL_FAMILY=${DEFAULT_CODEX_MODEL_FAMILY}.`,
      );
    }

    if (!process.env.MIDSCENE_MODEL_NAME?.trim()) {
      warnings.push(`MIDSCENE_MODEL_NAME is unset; defaulting to ${DEFAULT_CODEX_MODEL_NAME}.`);
    }

    if (!process.env.MIDSCENE_MODEL_BASE_URL?.trim()) {
      warnings.push(`MIDSCENE_MODEL_BASE_URL is unset; defaulting to ${DEFAULT_CODEX_BASE_URL}.`);
    }

    if (!process.env.MIDSCENE_MODEL_FAMILY?.trim()) {
      warnings.push(`MIDSCENE_MODEL_FAMILY is unset; defaulting to ${DEFAULT_CODEX_MODEL_FAMILY}.`);
    }

    if (!process.env.MIDSCENE_MODEL_REASONING_EFFORT?.trim()) {
      warnings.push(
        `MIDSCENE_MODEL_REASONING_EFFORT is unset; defaulting to ${DEFAULT_CODEX_REASONING_EFFORT}.`,
      );
    }

    return {
      config,
      ready: issues.length === 0,
      issues,
      warnings,
    };
  }

  if (config.baseUrl.trim().toLowerCase().startsWith(CODEX_PROVIDER_SCHEME)) {
    issues.push('The API provider cannot use a codex:// MIDSCENE_MODEL_BASE_URL.');
  }

  if (config.apiKey === PLACEHOLDER_MIDSCENE_API_KEY) {
    issues.push('MIDSCENE_MODEL_API_KEY still has placeholder value. Update it to your actual API key.');
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

  if (!process.env.MIDSCENE_MODEL_PROVIDER?.trim()) {
    process.env.MIDSCENE_MODEL_PROVIDER = config.provider;
  }

  if (config.provider === 'api' && !process.env.MIDSCENE_MODEL_API_KEY && config.apiKey) {
    process.env.MIDSCENE_MODEL_API_KEY = config.apiKey;
  }

  if (!process.env.MIDSCENE_MODEL_BASE_URL?.trim()) {
    process.env.MIDSCENE_MODEL_BASE_URL = config.baseUrl;
  }

  if (!process.env.MIDSCENE_MODEL_NAME?.trim()) {
    process.env.MIDSCENE_MODEL_NAME = config.modelName;
  }

  if (!process.env.MIDSCENE_MODEL_FAMILY?.trim()) {
    if (config.modelFamily) {
      process.env.MIDSCENE_MODEL_FAMILY = config.modelFamily;
    } else {
      delete process.env.MIDSCENE_MODEL_FAMILY;
    }
  }

  if (!process.env.MIDSCENE_MODEL_REASONING_EFFORT?.trim() && config.reasoningEffort) {
    process.env.MIDSCENE_MODEL_REASONING_EFFORT = config.reasoningEffort;
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

function resolveAIModelProvider(): AIModelProvider | null {
  const configuredProvider = process.env.MIDSCENE_MODEL_PROVIDER?.trim().toLowerCase();
  if (configuredProvider) {
    return configuredProvider === 'api' || configuredProvider === 'codex'
      ? configuredProvider
      : null;
  }

  return process.env.MIDSCENE_MODEL_BASE_URL?.trim().toLowerCase().startsWith(CODEX_PROVIDER_SCHEME)
    ? 'codex'
    : 'api';
}

function parseReasoningEffort(value?: string): AIReasoningEffort | undefined {
  const normalized = value?.trim().toLowerCase();
  return AI_REASONING_EFFORTS.find((effort) => effort === normalized);
}
