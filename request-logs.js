import { logDebug } from './logger.js';

// 内存中存储最近20条请求日志
const requestLogs = [];
const MAX_LOGS = 20;

/**
 * 截断token显示，只显示头尾部分
 */
function truncateToken(token) {
  if (!token) return 'N/A';
  
  // 移除 'Bearer ' 前缀（如果存在）
  const cleanToken = token.replace(/^Bearer\s+/i, '');
  
  if (cleanToken.length <= 10) {
    return cleanToken;
  }
  
  return cleanToken.substring(0, 4) + '...' + cleanToken.substring(cleanToken.length - 4);
}

/**
 * 获取客户端IP
 */
function getClientIP(req) {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         req.headers['x-forwarded-for']?.split(',')[0] ||
         req.headers['x-real-ip'] ||
         'unknown';
}

/**
 * 添加请求日志
 */
export function addRequestLog(req, res, startTime, endTime, statusCode, error = null) {
  try {
    const duration = endTime - startTime;
    const authHeader = req.headers.authorization;
    
    const logEntry = {
      id: Date.now() + Math.random(), // 简单的唯一ID
      timestamp: new Date(startTime).toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: statusCode,
      duration: `${duration}ms`,
      clientIP: getClientIP(req),
      token: truncateToken(authHeader),
      userAgent: req.headers['user-agent'] || 'unknown',
      error: error ? error.message : null
    };
    
    // 添加到日志数组开头
    requestLogs.unshift(logEntry);
    
    // 保持最多20条记录
    if (requestLogs.length > MAX_LOGS) {
      requestLogs.splice(MAX_LOGS);
    }
    
    logDebug('Request log added', logEntry);
    
  } catch (err) {
    console.error('Failed to add request log:', err);
  }
}

/**
 * 获取所有请求日志
 */
export function getRequestLogs() {
  return requestLogs;
}

/**
 * 清空请求日志
 */
export function clearRequestLogs() {
  requestLogs.length = 0;
  logDebug('Request logs cleared');
}

/**
 * 获取日志统计信息
 */
export function getLogStats() {
  const total = requestLogs.length;
  const success = requestLogs.filter(log => log.statusCode >= 200 && log.statusCode < 300).length;
  const errors = requestLogs.filter(log => log.statusCode >= 400).length;
  const avgDuration = requestLogs.length > 0 ? 
    requestLogs.reduce((sum, log) => sum + parseInt(log.duration), 0) / requestLogs.length : 0;
  
  return {
    total,
    success,
    errors,
    avgDuration: Math.round(avgDuration)
  };
}