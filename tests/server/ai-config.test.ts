import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAIConfigDefaultsToEnv,
  getAIConfigDiagnostics,
} from '../../core/src/config/ai-config';

const ORIGINAL_ENV = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  MIDSCENE_MODEL_PROVIDER: process.env.MIDSCENE_MODEL_PROVIDER,
  MIDSCENE_MODEL_API_KEY: process.env.MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL: process.env.MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME: process.env.MIDSCENE_MODEL_NAME,
  MIDSCENE_MODEL_FAMILY: process.env.MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_REASONING_EFFORT: process.env.MIDSCENE_MODEL_REASONING_EFFORT,
};

afterEach(() => {
  restoreEnv();
});

describe('ai-config', () => {
  it('mirrors fallback OpenAI config into Midscene runtime env', () => {
    restoreEnv();
    process.env.OPENAI_API_KEY = 'sk-test-openai-key';
    delete process.env.MIDSCENE_MODEL_PROVIDER;
    delete process.env.MIDSCENE_MODEL_API_KEY;
    delete process.env.MIDSCENE_MODEL_BASE_URL;
    delete process.env.MIDSCENE_MODEL_NAME;
    delete process.env.MIDSCENE_MODEL_FAMILY;
    delete process.env.MIDSCENE_MODEL_REASONING_EFFORT;

    const diagnostics = applyAIConfigDefaultsToEnv();

    expect(diagnostics.ready).toBe(true);
    expect(diagnostics.config?.provider).toBe('api');
    expect(process.env.MIDSCENE_MODEL_PROVIDER).toBe('api');
    expect(process.env.MIDSCENE_MODEL_API_KEY).toBe('sk-test-openai-key');
    expect(process.env.MIDSCENE_MODEL_BASE_URL).toBe('https://api.openai.com/v1');
    expect(process.env.MIDSCENE_MODEL_NAME).toBe('gpt-4o');
  });

  it('configures local Codex without an API key using gpt-5.4 medium defaults', () => {
    restoreEnv();
    delete process.env.OPENAI_API_KEY;
    process.env.MIDSCENE_MODEL_PROVIDER = 'codex';
    delete process.env.MIDSCENE_MODEL_API_KEY;
    delete process.env.MIDSCENE_MODEL_BASE_URL;
    delete process.env.MIDSCENE_MODEL_NAME;
    delete process.env.MIDSCENE_MODEL_FAMILY;
    delete process.env.MIDSCENE_MODEL_REASONING_EFFORT;

    const diagnostics = applyAIConfigDefaultsToEnv();

    expect(diagnostics.ready).toBe(true);
    expect(diagnostics.config).toMatchObject({
      provider: 'codex',
      baseUrl: 'codex://local',
      modelName: 'gpt-5.4',
      modelFamily: 'gpt-5',
      reasoningEffort: 'medium',
    });
    expect(process.env.MIDSCENE_MODEL_API_KEY).toBeUndefined();
    expect(process.env.MIDSCENE_MODEL_BASE_URL).toBe('codex://local');
    expect(process.env.MIDSCENE_MODEL_NAME).toBe('gpt-5.4');
    expect(process.env.MIDSCENE_MODEL_FAMILY).toBe('gpt-5');
    expect(process.env.MIDSCENE_MODEL_REASONING_EFFORT).toBe('medium');
  });

  it('infers the Codex provider from a codex base URL for Midscene compatibility', () => {
    restoreEnv();
    delete process.env.OPENAI_API_KEY;
    delete process.env.MIDSCENE_MODEL_PROVIDER;
    delete process.env.MIDSCENE_MODEL_API_KEY;
    process.env.MIDSCENE_MODEL_BASE_URL = 'codex://local';
    process.env.MIDSCENE_MODEL_NAME = 'gpt-5.4';
    process.env.MIDSCENE_MODEL_FAMILY = 'gpt-5';
    process.env.MIDSCENE_MODEL_REASONING_EFFORT = 'medium';

    const diagnostics = getAIConfigDiagnostics();

    expect(diagnostics.ready).toBe(true);
    expect(diagnostics.config?.provider).toBe('codex');
  });

  it('rejects unsupported providers and reasoning levels', () => {
    restoreEnv();
    process.env.MIDSCENE_MODEL_PROVIDER = 'local';

    expect(getAIConfigDiagnostics().issues).toContain(
      'MIDSCENE_MODEL_PROVIDER must be either api or codex.',
    );

    process.env.MIDSCENE_MODEL_PROVIDER = 'codex';
    process.env.MIDSCENE_MODEL_BASE_URL = 'codex://local';
    process.env.MIDSCENE_MODEL_NAME = 'gpt-5.4';
    delete process.env.MIDSCENE_MODEL_FAMILY;
    process.env.MIDSCENE_MODEL_REASONING_EFFORT = 'max';

    expect(getAIConfigDiagnostics().issues).toContain(
      'MIDSCENE_MODEL_REASONING_EFFORT must be one of low, medium, high, or xhigh.',
    );

    process.env.MIDSCENE_MODEL_REASONING_EFFORT = 'medium';
    process.env.MIDSCENE_MODEL_FAMILY = 'qwen3-vl';

    expect(getAIConfigDiagnostics().issues).toContain(
      'The Codex provider requires MIDSCENE_MODEL_FAMILY=gpt-5.',
    );
  });

  it('reports placeholder values as blocking issues', () => {
    restoreEnv();
    process.env.MIDSCENE_MODEL_PROVIDER = 'api';
    process.env.MIDSCENE_MODEL_API_KEY = 'replace-with-your-api-key';
    process.env.MIDSCENE_MODEL_BASE_URL = 'https://replace-with-your-model-service-url/v1';
    process.env.MIDSCENE_MODEL_NAME = 'qwen3-vl';
    delete process.env.MIDSCENE_MODEL_REASONING_EFFORT;

    const diagnostics = getAIConfigDiagnostics();

    expect(diagnostics.ready).toBe(false);
    expect(diagnostics.issues).toContain(
      'MIDSCENE_MODEL_API_KEY still has placeholder value. Update it to your actual API key.',
    );
    expect(diagnostics.issues).toContain(
      'MIDSCENE_MODEL_BASE_URL still has placeholder value. Update it to your actual model service URL.',
    );
  });
});

function restoreEnv(): void {
  assignEnvValue('OPENAI_API_KEY', ORIGINAL_ENV.OPENAI_API_KEY);
  assignEnvValue('MIDSCENE_MODEL_PROVIDER', ORIGINAL_ENV.MIDSCENE_MODEL_PROVIDER);
  assignEnvValue('MIDSCENE_MODEL_API_KEY', ORIGINAL_ENV.MIDSCENE_MODEL_API_KEY);
  assignEnvValue('MIDSCENE_MODEL_BASE_URL', ORIGINAL_ENV.MIDSCENE_MODEL_BASE_URL);
  assignEnvValue('MIDSCENE_MODEL_NAME', ORIGINAL_ENV.MIDSCENE_MODEL_NAME);
  assignEnvValue('MIDSCENE_MODEL_FAMILY', ORIGINAL_ENV.MIDSCENE_MODEL_FAMILY);
  assignEnvValue(
    'MIDSCENE_MODEL_REASONING_EFFORT',
    ORIGINAL_ENV.MIDSCENE_MODEL_REASONING_EFFORT,
  );
}

function assignEnvValue(key: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
