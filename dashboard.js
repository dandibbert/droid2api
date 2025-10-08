import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAuthToken, setAuthToken } from './config.js';
import { getRequestLogs, clearRequestLogs, getLogStats } from './request-logs.js';
import { reloadTokens, getAuthStatus } from './auth.js';
import { logInfo, logError } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dashboardRouter = express.Router();

/**
 * Dashboard认证中间件
 */
function authenticateDashboard(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;

  const validAuthToken = getAuthToken();
  
  if (!validAuthToken) {
    return res.status(500).json({ 
      error: 'AUTH_TOKEN not configured',
      message: 'Please set AUTH_TOKEN in config.json or environment variable' 
    });
  }

  if (!token || token !== validAuthToken) {
    return res.status(401).json({ error: 'Invalid or missing AUTH_TOKEN' });
  }

  next();
}

/**
 * 提供dashboard静态文件
 */
dashboardRouter.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

dashboardRouter.get('/dashboard.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.css'));
});

dashboardRouter.get('/dashboard.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.js'));
});

/**
 * Dashboard认证API
 */
dashboardRouter.post('/api/auth', (req, res) => {
  try {
    const { token } = req.body;
    const validAuthToken = getAuthToken();

    if (!validAuthToken) {
      return res.status(500).json({ 
        error: 'AUTH_TOKEN not configured',
        message: 'Please set AUTH_TOKEN in config.json or environment variable' 
      });
    }

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    if (token !== validAuthToken) {
      logInfo('Dashboard authentication failed', { providedToken: token.substring(0, 4) + '...' });
      return res.status(401).json({ error: 'Invalid AUTH_TOKEN' });
    }

    logInfo('Dashboard authentication successful');
    res.json({ success: true });
  } catch (error) {
    logError('Dashboard authentication error', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * 获取请求日志和统计信息
 */
dashboardRouter.get('/api/logs', authenticateDashboard, (req, res) => {
  try {
    const logs = getRequestLogs();
    const stats = getLogStats();
    
    res.json({
      logs,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logError('Failed to get logs', error);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

/**
 * 清空请求日志
 */
dashboardRouter.post('/api/logs/clear', authenticateDashboard, (req, res) => {
  try {
    clearRequestLogs();
    logInfo('Request logs cleared via dashboard');
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (error) {
    logError('Failed to clear logs', error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

/**
 * 获取Token状态
 */
dashboardRouter.get('/api/tokens/status', authenticateDashboard, async (req, res) => {
  try {
    const authStatus = getAuthStatus();
    const factoryApiKey = process.env.FACTORY_API_KEY;
    const refreshToken = process.env.DROID_REFRESH_KEY;
    
    // 确定当前使用的Token类型
    let currentType = 'Client Authorization';
    if (authStatus.authSource === 'factory_key') {
      currentType = 'FACTORY_API_KEY';
    } else if (authStatus.authSource === 'env' || authStatus.authSource === 'file') {
      currentType = 'Refresh Token';
    }

    res.json({
      currentType,
      authSource: authStatus.authSource,
      status: '正常',
      factoryApiKey: !!factoryApiKey,
      refreshToken: !!refreshToken,
      hasCurrentApiKey: authStatus.hasCurrentApiKey,
      lastRefreshTime: authStatus.lastRefreshTime
    });
  } catch (error) {
    logError('Failed to get token status', error);
    res.status(500).json({ error: 'Failed to get token status' });
  }
});

/**
 * 保存Token
 */
dashboardRouter.post('/api/tokens/save', authenticateDashboard, (req, res) => {
  try {
    const { type, value } = req.body;

    if (!type || !value) {
      return res.status(400).json({ error: 'Type and value are required' });
    }

    if (type === 'factoryApiKey') {
      process.env.FACTORY_API_KEY = value;
      logInfo('FACTORY_API_KEY updated via dashboard');
    } else if (type === 'refreshToken') {
      process.env.DROID_REFRESH_KEY = value;
      logInfo('DROID_REFRESH_KEY updated via dashboard');
    } else {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    res.json({ success: true, message: 'Token saved successfully' });
  } catch (error) {
    logError('Failed to save token', error);
    res.status(500).json({ error: 'Failed to save token' });
  }
});

/**
 * 测试Token
 */
dashboardRouter.post('/api/tokens/test', authenticateDashboard, async (req, res) => {
  try {
    const { type } = req.body;

    if (type === 'factoryApiKey') {
      const key = process.env.FACTORY_API_KEY;
      if (!key) {
        return res.json({ message: 'FACTORY_API_KEY not set' });
      }
      // 这里可以添加实际的API测试逻辑
      res.json({ message: 'FACTORY_API_KEY is available (test not implemented)' });
    } else if (type === 'refreshToken') {
      const token = process.env.DROID_REFRESH_KEY;
      if (!token) {
        return res.json({ message: 'Refresh Token not set' });
      }
      // 这里可以添加实际的Token刷新测试
      res.json({ message: 'Refresh Token is available (test not implemented)' });
    } else {
      res.status(400).json({ error: 'Invalid token type' });
    }
  } catch (error) {
    logError('Failed to test token', error);
    res.status(500).json({ error: 'Failed to test token' });
  }
});

/**
 * 热重载Token
 */
dashboardRouter.post('/api/tokens/reload', authenticateDashboard, async (req, res) => {
  try {
    await reloadTokens();
    logInfo('Token configuration reloaded via dashboard');
    res.json({ success: true, message: 'Token configuration reloaded successfully' });
  } catch (error) {
    logError('Failed to reload tokens', error);
    res.status(500).json({ error: 'Failed to reload tokens: ' + error.message });
  }
});

/**
 * 清空所有Token
 */
dashboardRouter.post('/api/tokens/clear', authenticateDashboard, (req, res) => {
  try {
    delete process.env.FACTORY_API_KEY;
    delete process.env.DROID_REFRESH_KEY;
    
    logInfo('All tokens cleared via dashboard');
    res.json({ success: true, message: 'All tokens cleared successfully' });
  } catch (error) {
    logError('Failed to clear tokens', error);
    res.status(500).json({ error: 'Failed to clear tokens' });
  }
});

export default dashboardRouter;