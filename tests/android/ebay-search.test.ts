/**
 * Example: Android eBay search test using Midscene.js
 *
 * Before running:
 *   1. Connect an Android device with USB debugging enabled
 *   2. Set MIDSCENE_MODEL_* env vars (see .env.example)
 *   3. pnpm install
 *   4. pnpm test:android
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createAndroidAgent } from 'core';

describe('Android eBay Search', () => {
  let agent: Awaited<ReturnType<typeof createAndroidAgent>> | undefined;

  beforeAll(async () => {
    agent = await createAndroidAgent({
      aiActionContext: '如果出现权限弹窗或用户协议，点击同意/允许。当前是在Chrome浏览器中操作。',
    });
  });

  afterAll(async () => {
    await agent?.destroy();
  });

  it('should search for wireless headphones on eBay', async () => {
    await agent.aiAction('打开Chrome浏览器');
    await agent.aiAction('在地址栏中输入 ebay.com 并访问');
    await agent.aiAction('在搜索框中输入 "wireless headphones" 并搜索');
    await agent.aiAssert('页面显示了无线耳机的搜索结果列表');

    const firstItem = await agent.aiQuery<{ name: string; price: string }>(
      '{ name: string, price: string }',
      '提取第一个搜索结果的商品名称和价格',
    );
    expect(firstItem.name).toBeTruthy();
    expect(firstItem.price).toBeTruthy();
  });
});
