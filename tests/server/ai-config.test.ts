import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAIConfigDefaultsToEnv,
  getAIConfigDiagnostics,
} from '../../core/src/config/ai-config';

const ORIGINAL_ENV = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  MIDSCENE_MODEL_API_KEY: process.env.MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL: process.env.MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME: process.env.MIDSCENE_MODEL_NAME,
  MIDSCENE_MODEL_FAMILY: process.env.MIDSCENE_MODEL_FAMILY,
};

afterEach(() => {
  restoreEnv();
});

describe('ai-config', () => {
  it('mirrors fallback OpenAI config into Midscene runtime env', () => {
    restoreEnv();
    process.env.OPENAI_API_KEY = 'sk-test-openai-key';
    delete process.env.MIDSCENE_MODEL_API_KEY;
    delete process.env.MIDSCENE_MODEL_BASE_URL;
    delete process.env.MIDSCENE_MODEL_NAME;
    delete process.env.MIDSCENE_MODEL_FAMILY;

    const diagnostics = applyAIConfigDefaultsToEnv();

    expect(diagnostics.ready).toBe(true);
    expect(process.env.MIDSCENE_MODEL_API_KEY).toBe('sk-test-openai-key');
    expect(process.env.MIDSCENE_MODEL_BASE_URL).toBe('https://api.openai.com/v1');
    expect(process.env.MIDSCENE_MODEL_NAME).toBe('gpt-4o');
  });

  it('reports placeholder values as blocking issues', () => {
    restoreEnv();
    process.env.MIDSCENE_MODEL_API_KEY = 'replace-with-your-api-key';
    process.env.MIDSCENE_MODEL_BASE_URL = 'https://replace-with-your-model-service-url/v1';
    process.env.MIDSCENE_MODEL_NAME = 'qwen3-vl';

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
  assignEnvValue('MIDSCENE_MODEL_API_KEY', ORIGINAL_ENV.MIDSCENE_MODEL_API_KEY);
  assignEnvValue('MIDSCENE_MODEL_BASE_URL', ORIGINAL_ENV.MIDSCENE_MODEL_BASE_URL);
  assignEnvValue('MIDSCENE_MODEL_NAME', ORIGINAL_ENV.MIDSCENE_MODEL_NAME);
  assignEnvValue('MIDSCENE_MODEL_FAMILY', ORIGINAL_ENV.MIDSCENE_MODEL_FAMILY);
}

function assignEnvValue(key: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
