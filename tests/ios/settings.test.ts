/**
 * Example: iOS Settings app test using Midscene.js
 *
 * Before running:
 *   1. Start WebDriverAgent on your iOS device/simulator
 *   2. Set MIDSCENE_MODEL_* env vars (see .env.example)
 *   3. pnpm install
 *   4. pnpm test:ios
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import { createIOSAgent } from 'core';

describe('iOS Settings', () => {
  let agent: Awaited<ReturnType<typeof createIOSAgent>> | undefined;

  beforeAll(async () => {
    agent = await createIOSAgent({
      wdaUrl: 'http://localhost:8100',
      aiActionContext: 'This is the iOS Settings app. If any alert appears, dismiss it.',
    });
  });

  afterAll(async () => {
    await agent?.destroy();
  });

  it('should navigate to Wi-Fi settings', async () => {
    await agent.aiAction('打开设置应用');
    await agent.aiAction('点击 Wi-Fi 选项');
    await agent.aiAssert('页面显示了 Wi-Fi 设置界面，包含 Wi-Fi 开关');
  });

  it('should check About section', async () => {
    await agent.aiAction('返回设置主页');
    await agent.aiAction('向下滚动找到"通用"选项并点击');
    await agent.aiAction('点击"关于本机"');
    await agent.aiAssert('页面显示了设备的名称和系统版本信息');
  });
});
