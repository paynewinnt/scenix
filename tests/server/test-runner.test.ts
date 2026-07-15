import { afterEach, describe, expect, it, vi } from 'vitest';

const agentMocks = vi.hoisted(() => ({
  createWebAgent: vi.fn(),
  createAndroidAgent: vi.fn(),
  createIOSAgent: vi.fn(),
}));

vi.mock('../../core/src/agents/web-agent.js', () => ({
  createWebAgent: agentMocks.createWebAgent,
}));
vi.mock('../../core/src/agents/android-agent.js', () => ({
  createAndroidAgent: agentMocks.createAndroidAgent,
}));
vi.mock('../../core/src/agents/ios-agent.js', () => ({
  createIOSAgent: agentMocks.createIOSAgent,
}));

import { TestRunner } from '../../core/src/runner/test-runner';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('TestRunner', () => {
  it('returns the finalized report path for a passing run', async () => {
    configureReadyAI();
    const agent = createAgentStub();
    agent.destroy.mockResolvedValue('/tmp/report/case-run-item.html');
    agentMocks.createWebAgent.mockResolvedValue(agent);

    const result = await new TestRunner().run({
      id: 'case-1',
      name: '搜索',
      platform: 'web',
      steps: '1. 打开首页\n2. 断言页面包含搜索结果',
      reportFileName: 'case-run-item',
    });

    expect(result).toMatchObject({
      status: 'passed',
      reportPath: '/tmp/report/case-run-item.html',
    });
    expect(agent.aiAction).toHaveBeenCalledWith('打开首页');
    expect(agent.aiAssert).toHaveBeenCalledWith('断言页面包含搜索结果');
    expect(agentMocks.createWebAgent).toHaveBeenCalledWith(
      expect.objectContaining({ reportFileName: 'case-run-item' }),
    );
  });

  it('keeps UI action failures as failed and preserves their report', async () => {
    configureReadyAI();
    const agent = createAgentStub();
    agent.aiAction.mockRejectedValue(new Error('找不到搜索按钮'));
    agent.destroy.mockResolvedValue('/tmp/report/failed.html');
    agentMocks.createWebAgent.mockResolvedValue(agent);

    const result = await new TestRunner().run({
      id: 'case-2',
      name: '搜索',
      platform: 'web',
      steps: '1. 点击搜索按钮',
    });

    expect(result.status).toBe('failed');
    expect(result.reportPath).toBe('/tmp/report/failed.html');
    expect(result.errorMessage).toContain('找不到搜索按钮');
  });

  it('opens the Bing homepage before executing the remaining visual steps', async () => {
    configureReadyAI();
    const agent = createAgentStub();
    agentMocks.createWebAgent.mockResolvedValue(agent);

    const result = await new TestRunner().run({
      id: 'case-bing',
      name: 'Bing 搜索',
      platform: 'web',
      steps: '1. 打开 Bing 首页\n2. 点击搜索框\n3. 输入 Midscene.js',
    });

    expect(result.status).toBe('passed');
    expect(agent.goto).toHaveBeenCalledWith('https://www.bing.com/');
    expect(agent.aiAction.mock.calls).toEqual([['点击搜索框'], ['输入 Midscene.js']]);
  });

  it('classifies model, network, browser, and device failures as errors', async () => {
    configureReadyAI();
    const agent = createAgentStub();
    agent.aiAction.mockRejectedValue(new Error('fetch failed: ECONNRESET'));
    agent.destroy.mockResolvedValue('/tmp/report/error.html');
    agentMocks.createWebAgent.mockResolvedValue(agent);

    const result = await new TestRunner().run({
      id: 'case-3',
      name: '搜索',
      platform: 'web',
      steps: '1. 打开首页',
    });

    expect(result).toMatchObject({
      status: 'error',
      reportPath: '/tmp/report/error.html',
    });
    expect(result.errorMessage).toContain('执行环境异常');
  });

  it('fails readiness before launching an agent when AI configuration is missing', async () => {
    vi.stubEnv('MIDSCENE_MODEL_PROVIDER', 'api');
    vi.stubEnv('MIDSCENE_MODEL_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');

    const result = await new TestRunner().run({
      id: 'case-4',
      name: '搜索',
      platform: 'web',
      steps: '1. 打开首页',
    });

    expect(result.status).toBe('error');
    expect(result.errorMessage).toContain('AI 配置未就绪');
    expect(agentMocks.createWebAgent).not.toHaveBeenCalled();
  });

  it('runs with the local Codex provider without an API key', async () => {
    vi.stubEnv('MIDSCENE_MODEL_PROVIDER', 'codex');
    vi.stubEnv('MIDSCENE_MODEL_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('MIDSCENE_MODEL_BASE_URL', 'codex://local');
    vi.stubEnv('MIDSCENE_MODEL_NAME', 'gpt-5.4');
    vi.stubEnv('MIDSCENE_MODEL_REASONING_EFFORT', 'medium');
    vi.stubEnv('MIDSCENE_MODEL_FAMILY', 'gpt-5');
    const agent = createAgentStub();
    agentMocks.createWebAgent.mockResolvedValue(agent);

    const result = await new TestRunner().run({
      id: 'case-codex',
      name: '本机 Codex 搜索',
      platform: 'web',
      steps: '1. 打开首页',
    });

    expect(result.status).toBe('passed');
    expect(agentMocks.createWebAgent).toHaveBeenCalledOnce();
    expect(agent.aiAction).toHaveBeenCalledWith('打开首页');
  });
});

function configureReadyAI(): void {
  vi.stubEnv('MIDSCENE_MODEL_PROVIDER', 'api');
  vi.stubEnv('MIDSCENE_MODEL_API_KEY', 'test-key');
  vi.stubEnv('MIDSCENE_MODEL_BASE_URL', 'https://model.example.test/v1');
  vi.stubEnv('MIDSCENE_MODEL_NAME', 'test-model');
}

function createAgentStub() {
  return {
    aiAction: vi.fn().mockResolvedValue(undefined),
    aiAssert: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}
