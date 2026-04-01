/**
 * Example: Web login flow test using Midscene.js + Playwright
 *
 * Before running:
 *   1. Set MIDSCENE_MODEL_* env vars (see .env.example)
 *   2. pnpm install
 *   3. pnpm test:web
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import { createWebAgent } from 'core';

describe('Web Login Flow', () => {
  let agent: Awaited<ReturnType<typeof createWebAgent>> | undefined;

  beforeAll(async () => {
    agent = await createWebAgent({
      headless: false,
      baseUrl: 'https://example.com/login', // Replace with your app URL
    });
  });

  afterAll(async () => {
    await agent?.destroy();
  });

  it('should login with valid credentials', async () => {
    await agent.aiAction('在用户名输入框中输入 testuser');
    await agent.aiAction('在密码输入框中输入 password123');
    await agent.aiAction('点击登录按钮');
    await agent.aiAssert('页面上显示了"欢迎回来"或类似的成功登录提示');
  });

  it('should show error for invalid credentials', async () => {
    await agent.goto('https://example.com/login');
    await agent.aiAction('在用户名输入框中输入 wronguser');
    await agent.aiAction('在密码输入框中输入 wrongpass');
    await agent.aiAction('点击登录按钮');
    await agent.aiAssert('页面上显示了错误提示信息');
  });
});
