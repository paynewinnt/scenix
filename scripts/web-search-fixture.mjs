import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export async function startSearchFixture(options = {}) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}`);
    const query = url.pathname === '/search' ? (url.searchParams.get('q') ?? '').trim() : '';

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(renderSearchPage(query));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Unable to resolve search fixture address');
  }

  return {
    url: `http://${host}:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function renderSearchPage(query) {
  const safeQuery = escapeHtml(query);
  const hasQuery = query.length > 0;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${hasQuery ? `${safeQuery} - ` : ''}Scenix Search</title>
    <style>
      :root { color-scheme: light; font-family: Georgia, "Times New Roman", serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; color: #17211d; background: radial-gradient(circle at 15% 15%, #f4d9a8 0, transparent 32%), linear-gradient(135deg, #edf2e6, #d7e7df); }
      main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 72px 0; }
      .eyebrow { margin: 0 0 10px; color: #a0442c; font: 700 13px/1.2 ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(42px, 8vw, 84px); line-height: .95; letter-spacing: -.055em; }
      .intro { max-width: 620px; margin: 22px 0 34px; color: #46534d; font-size: 18px; line-height: 1.6; }
      form { display: flex; gap: 10px; padding: 10px; border: 1px solid rgba(23,33,29,.25); border-radius: 18px; background: rgba(255,255,255,.78); box-shadow: 0 24px 70px rgba(39,72,58,.14); }
      input { min-width: 0; flex: 1; border: 0; outline: 0; padding: 14px 16px; background: transparent; color: inherit; font: 600 18px/1.2 ui-monospace, monospace; }
      button { border: 0; border-radius: 12px; padding: 14px 22px; color: #fff; background: #a0442c; font: 700 16px/1 ui-monospace, monospace; cursor: pointer; }
      button:hover { background: #813522; }
      .summary { margin: 38px 0 14px; color: #46534d; font: 700 14px/1.4 ui-monospace, monospace; }
      .results { display: grid; gap: 14px; }
      article { padding: 22px; border: 1px solid rgba(23,33,29,.16); border-radius: 16px; background: rgba(255,255,255,.65); }
      article h2 { margin: 0 0 8px; font-size: 25px; }
      article p { margin: 0; color: #52605a; line-height: 1.55; }
      @media (max-width: 560px) { main { padding-top: 44px; } form { flex-direction: column; } button { width: 100%; } }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Scenix deterministic fixture</p>
      <h1>搜索测试实验室</h1>
      <p class="intro">这是一个无公网依赖、无验证码的本地页面，用于稳定验证自然语言搜索流程。</p>
      <form action="/search" method="get" role="search">
        <input name="q" type="search" aria-label="搜索框" placeholder="输入关键词，例如 Midscene.js" value="${safeQuery}" autocomplete="off" />
        <button type="submit">搜索</button>
      </form>
      ${hasQuery ? renderResults(safeQuery) : ''}
    </main>
  </body>
</html>`;
}

function renderResults(query) {
  return `
      <p class="summary" role="status">找到 2 条与“${query}”相关的搜索结果</p>
      <section class="results" aria-label="搜索结果">
        <article>
          <h2>Midscene.js 自然语言自动化</h2>
          <p>使用视觉模型理解页面，并通过自然语言完成定位、操作与断言。</p>
        </article>
        <article>
          <h2>Scenix 测试执行平台</h2>
          <p>编排 Web、Android 与 iOS 测试套件，并在站内查看执行报告。</p>
        </article>
      </section>`;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const fixture = await startSearchFixture({
    port: Number(process.env.WEB_FIXTURE_PORT ?? 4174),
  });
  console.log(`Search fixture running at ${fixture.url}`);
}
