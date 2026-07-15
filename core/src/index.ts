import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAIConfigDefaultsToEnv } from './config/ai-config.js';

const coreSrcDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(coreSrcDir, '../../.env');

if (existsSync(envPath)) {
  const envText = readFileSync(envPath, 'utf8');
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

if (process.env.MIDSCENE_REPLANNING_CYCLE_LIMIT === undefined) {
  process.env.MIDSCENE_REPLANNING_CYCLE_LIMIT = '3';
}

applyAIConfigDefaultsToEnv();

export { createWebAgent } from './agents/web-agent.js';
export { createAndroidAgent } from './agents/android-agent.js';
export { createIOSAgent } from './agents/ios-agent.js';
export { createAppiumAgent } from './agents/appium-agent.js';
export { DeviceManager } from './device/device-manager.js';
export { TestRunner } from './runner/test-runner.js';
export type { TestCaseInput, TestResult } from './runner/test-runner.js';
export {
  applyAIConfigDefaultsToEnv,
  DEFAULT_CODEX_BASE_URL,
  DEFAULT_CODEX_MODEL_FAMILY,
  DEFAULT_CODEX_MODEL_NAME,
  DEFAULT_CODEX_REASONING_EFFORT,
  getAIConfig,
  getAIConfigDiagnostics,
  validateAIConfig,
  PROVIDER_PRESETS,
} from './config/ai-config.js';
export type {
  AIConfigDiagnostics,
  AIModelConfig,
  AIModelProvider,
  AIReasoningEffort,
  ProviderPreset,
} from './config/ai-config.js';
export { getRuntimeReadinessReport, resolveAndroidSdkEnvironment } from './config/runtime-readiness.js';
export type {
  AndroidSdkEnvironment,
  CodexRuntimeStatus,
  ReadinessCheck,
  ReadinessStatus,
  RuntimeReadinessReport,
} from './config/runtime-readiness.js';
