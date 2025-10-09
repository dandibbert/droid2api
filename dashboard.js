import express from 'express';
import { getDashboardAuthToken } from './auth.js';
import {
  activateToken,
  addToken,
  getDashboardState,
  removeToken
} from './state.js';

const dashboardRouter = express.Router();

function renderLoginPage(errorMessage = '') {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>droid2api Dashboard 登录</title>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
      .card { background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 16px; padding: 32px; width: 360px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.4); }
      h1 { margin-top: 0; font-size: 24px; text-align: center; }
      label { display: block; margin-bottom: 8px; font-weight: 600; }
      input[type="password"] { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.4); background: rgba(15, 23, 42, 0.6); color: #e2e8f0; }
      input[type="password"]:focus { outline: none; border-color: #38bdf8; box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2); }
      button { width: 100%; padding: 12px; border: none; border-radius: 8px; background: linear-gradient(135deg, #38bdf8, #6366f1); color: white; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 16px; }
      button:hover { opacity: 0.9; }
      .error { margin-top: 12px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.5); color: #fca5a5; padding: 10px 12px; border-radius: 8px; }
      .hint { margin-top: 16px; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.4; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Dashboard 登录</h1>
      <form method="post" action="/dashboard/login">
        <label for="token">请输入 AUTH_TOKEN</label>
        <input id="token" type="password" name="token" placeholder="AUTH_TOKEN" required autofocus />
        <button type="submit">进入 Dashboard</button>
      </form>
      ${errorMessage ? `<div class="error">${errorMessage}</div>` : ''}
      <div class="hint">只有知道 AUTH_TOKEN 的用户才能访问 Dashboard 和使用服务器维护的令牌。</div>
    </div>
  </body>
</html>`;
}

function renderDashboardPage() {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>droid2api Dashboard</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; background: radial-gradient(circle at top, #1e293b, #0f172a 55%, #020617); color: #e2e8f0; min-height: 100vh; }
      .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px 48px; }
      header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
      h1 { font-size: 28px; margin: 0; }
      .actions { display: flex; gap: 12px; align-items: center; }
      button, .button { background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #bfdbfe; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-weight: 600; }
      button:hover, .button:hover { background: rgba(59, 130, 246, 0.35); }
      section { background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 12px 40px rgba(2, 6, 23, 0.45); }
      section h2 { margin-top: 0; font-size: 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { padding: 10px 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.15); font-size: 13px; text-align: left; }
      th { text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 600; }
      tr:last-child td { border-bottom: none; }
      .log-source { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
      .source-factory { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
      .source-refresh { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }
      .source-client { background: rgba(249, 115, 22, 0.15); color: #fb923c; }
      .source-none { background: rgba(100, 116, 139, 0.15); color: #cbd5f5; }
      .token-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
      .token-card { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 14px; padding: 16px 18px; }
      .token-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
      .token-item { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 10px; border: 1px solid rgba(148, 163, 184, 0.15); background: rgba(15, 23, 42, 0.55); }
      .token-header { display: flex; justify-content: space-between; align-items: center; }
      .token-label { font-weight: 600; font-size: 14px; }
      .badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(148, 163, 184, 0.4); color: #cbd5f5; }
      .token-actions { display: flex; gap: 8px; }
      .token-actions button { padding: 6px 10px; font-size: 12px; border-radius: 6px; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.35); color: #bfdbfe; cursor: pointer; }
      .token-actions button.danger { background: rgba(239, 68, 68, 0.18); border-color: rgba(239, 68, 68, 0.4); color: #fca5a5; }
      form.inline { display: flex; gap: 12px; margin-top: 16px; }
      form.inline input { flex: 1; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.3); background: rgba(15, 23, 42, 0.5); color: #e2e8f0; }
      form.inline input:focus { outline: none; border-color: #38bdf8; box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2); }
      form.inline button { padding: 10px 14px; font-size: 14px; }
      .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 12px; }
      .status-card { background: rgba(15, 23, 42, 0.55); padding: 12px 14px; border-radius: 10px; border: 1px solid rgba(148, 163, 184, 0.2); font-size: 13px; }
      .status-card strong { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
      .empty { color: #64748b; font-size: 13px; padding: 12px 0; }
      .error { color: #fca5a5; font-size: 13px; margin-top: 12px; }
      .logout { background: rgba(239, 68, 68, 0.18); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; }
      @media (max-width: 720px) {
        header { flex-direction: column; align-items: flex-start; gap: 12px; }
        .actions { width: 100%; justify-content: flex-start; flex-wrap: wrap; }
        button, .button { width: auto; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>droid2api Dashboard</h1>
        <div class="actions">
          <button id="toggle-refresh" type="button">暂停自动刷新</button>
          <button id="refresh-now" type="button">立即刷新</button>
          <form method="post" action="/dashboard/logout" style="margin:0">
            <button class="logout" type="submit">退出登录</button>
          </form>
        </div>
      </header>

      <section>
        <h2>最近请求 (最多20条)</h2>
        <div id="logs-empty" class="empty" style="display:none">暂无请求记录</div>
        <div class="table-wrapper">
          <table id="logs-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>方法</th>
                <th>路径</th>
                <th>状态码</th>
                <th>耗时 (ms)</th>
                <th>客户端 IP</th>
                <th>Token</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>令牌状态</h2>
        <div class="status-grid" id="status-cards"></div>
      </section>

      <section>
        <h2>令牌管理</h2>
        <div class="token-columns">
          <div class="token-card">
            <h3>FACTORY_API_KEY</h3>
            <ul id="factory-list" class="token-list"></ul>
            <form class="inline" id="factory-form">
              <input type="text" name="value" placeholder="新增 FACTORY_API_KEY" required />
              <input type="text" name="label" placeholder="备注 (可选)" />
              <button type="submit">添加</button>
            </form>
          </div>
          <div class="token-card">
            <h3>Refresh Token</h3>
            <ul id="refresh-list" class="token-list"></ul>
            <form class="inline" id="refresh-form">
              <input type="text" name="value" placeholder="新增 refresh_token" required />
              <input type="text" name="label" placeholder="备注 (可选)" />
              <button type="submit">添加</button>
            </form>
          </div>
        </div>
        <div id="token-error" class="error" style="display:none"></div>
      </section>
    </div>

    <script>
      const state = {
        autoRefresh: true,
        timer: null
      };

      const sourceClassMap = {
        factory: 'source-factory',
        refresh: 'source-refresh',
        client: 'source-client',
        none: 'source-none'
      };

      async function fetchState() {
        const response = await fetch('/dashboard/api/state', { credentials: 'same-origin' });
        if (!response.ok) {
          throw new Error('无法获取 Dashboard 数据');
        }
        return response.json();
      }

      function renderLogs(logs) {
        const tbody = document.querySelector('#logs-table tbody');
        const empty = document.getElementById('logs-empty');
        tbody.innerHTML = '';
        if (!logs || logs.length === 0) {
          empty.style.display = 'block';
          return;
        }
        empty.style.display = 'none';
        logs.forEach((log) => {
          const tr = document.createElement('tr');
          const tokenClass = sourceClassMap[log.tokenSource] || 'source-none';
          const tokenLabel = (log.tokenSource || 'NONE').toUpperCase();
          const tokenSuffix = log.tokenSnippet ? ' (' + log.tokenSnippet + ')' : '';
          tr.innerHTML =
            '<td>' + new Date(log.timestamp).toLocaleString() + '</td>' +
            '<td>' + log.method + '</td>' +
            '<td>' + log.path + '</td>' +
            '<td>' + log.status + '</td>' +
            '<td>' + log.durationMs + '</td>' +
            '<td>' + log.clientIp + '</td>' +
            '<td><span class="log-source ' + tokenClass + '">' + tokenLabel + tokenSuffix + '</span></td>';
          tbody.appendChild(tr);
        });
      }

      function renderStatus(status) {
        const container = document.getElementById('status-cards');
        container.innerHTML = '';
        const items = [
          { label: 'AUTH_TOKEN 已配置', value: status.authTokenConfigured ? '是' : '否' },
          { label: '最近使用来源', value: status.lastSource ? status.lastSource.toUpperCase() : '未知' },
          { label: '最近使用时间', value: status.lastUsedAt ? new Date(status.lastUsedAt).toLocaleString() : '暂无' },
          { label: '最近刷新时间', value: status.lastRefreshAt ? new Date(status.lastRefreshAt).toLocaleString() : '暂无' },
          { label: '刷新状态', value: status.lastRefreshStatus ? status.lastRefreshStatus : '未刷新' },
          { label: '当前服务器 Token', value: status.activeAccessTokenSnippet || '未使用服务器 Token' },
          { label: '最近客户端 Token', value: status.lastClientTokenSnippet || '暂无' },
          { label: '刷新错误', value: status.lastRefreshError || '无' }
        ];
        items.forEach((item) => {
          const card = document.createElement('div');
          card.className = 'status-card';
          card.innerHTML = '<strong>' + item.label + '</strong>' + item.value;
          container.appendChild(card);
        });
      }

      function renderTokenList(type, list, activeId) {
        const ul = document.getElementById(type === 'factory' ? 'factory-list' : 'refresh-list');
        ul.innerHTML = '';
        if (!list || list.length === 0) {
          const li = document.createElement('li');
          li.className = 'empty';
          li.textContent = '暂无配置';
          ul.appendChild(li);
          return;
        }

        list.forEach((token) => {
          const li = document.createElement('li');
          li.className = 'token-item';
          const isActive = token.id === activeId;
          const badge = isActive ? '<span class="badge">使用中</span>' : '';
          const activateDisabled = isActive ? ' disabled' : '';
          const removeDisabled = token.readOnly ? ' disabled' : '';
          li.innerHTML =
            '<div class="token-header">' +
              '<div>' +
                '<div class="token-label">' + (token.label || '未命名令牌') + '</div>' +
                '<div class="token-snippet">' + token.snippet + '</div>' +
              '</div>' +
              badge +
            '</div>' +
            '<div class="token-actions">' +
              '<button type="button" data-action="activate" data-type="' + type + '" data-id="' + token.id + '"' + activateDisabled + '>设为当前</button>' +
              '<button type="button" class="danger" data-action="remove" data-type="' + type + '" data-id="' + token.id + '"' + removeDisabled + '>删除</button>' +
            '</div>';
          ul.appendChild(li);
        });
      }

      function renderTokens(tokens) {
        renderTokenList('factory', tokens.factoryKeys, tokens.activeFactoryKeyId);
        renderTokenList('refresh', tokens.refreshTokens, tokens.activeRefreshTokenId);
      }

      function showError(message) {
        const box = document.getElementById('token-error');
        if (!message) {
          box.style.display = 'none';
          return;
        }
        box.textContent = message;
        box.style.display = 'block';
      }

      async function loadAndRender() {
        try {
          const data = await fetchState();
          renderLogs(data.logs);
          renderTokens(data.tokens);
          renderStatus(data.authStatus);
          showError('');
        } catch (error) {
          showError(error.message);
        }
      }

      function scheduleRefresh() {
        clearTimeout(state.timer);
        if (!state.autoRefresh) {
          return;
        }
        state.timer = setTimeout(async () => {
          await loadAndRender();
          scheduleRefresh();
        }, 5000);
      }

      document.getElementById('toggle-refresh').addEventListener('click', () => {
        state.autoRefresh = !state.autoRefresh;
        document.getElementById('toggle-refresh').textContent = state.autoRefresh ? '暂停自动刷新' : '开启自动刷新';
        if (state.autoRefresh) {
          scheduleRefresh();
        } else {
          clearTimeout(state.timer);
        }
      });

      document.getElementById('refresh-now').addEventListener('click', async () => {
        await loadAndRender();
        if (state.autoRefresh) {
          scheduleRefresh();
        }
      });

      async function submitToken(type, form) {
        const value = form.value.value.trim();
        const label = form.label.value.trim();
        if (!value) {
          showError('请输入有效的 token 值');
          return;
        }
        const response = await fetch('/dashboard/api/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ type, value, label })
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          showError(error.error || '保存 token 失败');
          return;
        }
        const data = await response.json();
        renderTokens(data.tokens);
        renderStatus(data.authStatus);
        showError('');
        form.reset();
      }

      document.getElementById('factory-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitToken('factory', event.target);
      });

      document.getElementById('refresh-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitToken('refresh', event.target);
      });

      document.getElementById('factory-list').addEventListener('click', onTokenAction);
      document.getElementById('refresh-list').addEventListener('click', onTokenAction);

      async function onTokenAction(event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const action = target.getAttribute('data-action');
        if (!action) return;
        const type = target.getAttribute('data-type');
        const id = target.getAttribute('data-id');
        if (!type || !id) return;

        if (action === 'remove') {
          const response = await fetch('/dashboard/api/tokens/' + type + '/' + id, {
            method: 'DELETE',
            credentials: 'same-origin'
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showError(error.error || '删除失败');
            return;
          }
          const data = await response.json();
          renderTokens(data.tokens);
          renderStatus(data.authStatus);
          showError('');
          return;
        }

        if (action === 'activate') {
          const response = await fetch('/dashboard/api/tokens/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ type, id })
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showError(error.error || '切换失败');
            return;
          }
          const data = await response.json();
          renderTokens(data.tokens);
          renderStatus(data.authStatus);
          showError('');
        }
      }

      loadAndRender().then(scheduleRefresh);
    </script>
  </body>
</html>`;
  return html.replace(/__TPL__/g, '$');
}

function ensureDashboardAuth(req, res, next) {
  if (req.session && req.session.dashboardAuthenticated) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

dashboardRouter.get('/', (req, res) => {
  if (!getDashboardAuthToken()) {
    return res.send(renderLoginPage('服务器未配置 AUTH_TOKEN，无法登录 Dashboard。'));
  }
  if (req.session && req.session.dashboardAuthenticated) {
    return res.send(renderDashboardPage());
  }
  const hasError = req.query.error === '1';
  const message = hasError ? 'AUTH_TOKEN 不正确' : '';
  res.send(renderLoginPage(message));
});

dashboardRouter.post('/login', (req, res) => {
  const { token } = req.body || {};
  const authToken = getDashboardAuthToken();
  if (!authToken) {
    return res.send(renderLoginPage('服务器未配置 AUTH_TOKEN。'));
  }
  if (token && token.trim() === authToken) {
    if (req.session) {
      req.session.dashboardAuthenticated = true;
    }
    return res.redirect('/dashboard');
  }
  return res.send(renderLoginPage('AUTH_TOKEN 不正确')); 
});

dashboardRouter.post('/logout', (req, res) => {
  if (req.session) {
    req.session.dashboardAuthenticated = false;
    req.session.destroy(() => {
      res.redirect('/dashboard');
    });
  } else {
    res.redirect('/dashboard');
  }
});

dashboardRouter.get('/api/state', ensureDashboardAuth, (req, res) => {
  res.json(getDashboardState());
});

dashboardRouter.post('/api/tokens', ensureDashboardAuth, (req, res) => {
  const { type, value, label } = req.body || {};
  if (!type || !value) {
    return res.status(400).json({ error: '缺少必要的字段 type 或 value' });
  }
  if (!['factory', 'refresh'].includes(type)) {
    return res.status(400).json({ error: 'type 必须是 factory 或 refresh' });
  }
  try {
    addToken(type, value, label);
    return res.json(getDashboardState());
  } catch (error) {
    return res.status(400).json({ error: error.message || '保存失败' });
  }
});

dashboardRouter.delete('/api/tokens/:type/:id', ensureDashboardAuth, (req, res) => {
  const { type, id } = req.params;
  if (!['factory', 'refresh'].includes(type)) {
    return res.status(400).json({ error: 'type 必须是 factory 或 refresh' });
  }
  try {
    removeToken(type, id);
    return res.json(getDashboardState());
  } catch (error) {
    return res.status(400).json({ error: error.message || '删除失败' });
  }
});

dashboardRouter.post('/api/tokens/activate', ensureDashboardAuth, (req, res) => {
  const { type, id } = req.body || {};
  if (!type || !id) {
    return res.status(400).json({ error: '缺少必要的字段 type 或 id' });
  }
  if (!['factory', 'refresh'].includes(type)) {
    return res.status(400).json({ error: 'type 必须是 factory 或 refresh' });
  }
  try {
    activateToken(type, id);
    return res.json(getDashboardState());
  } catch (error) {
    return res.status(400).json({ error: error.message || '切换失败' });
  }
});

export default dashboardRouter;
