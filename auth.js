import fetch from 'node-fetch';
import { logDebug, logError, logInfo } from './logger.js';
import {
  activateToken,
  getActiveFactoryKey,
  getActiveRefreshToken,
  initializeDashboardState,
  maskToken,
  updateAuthStatus,
  updateTokenValue
} from './state.js';

const REFRESH_URL = 'https://api.workos.com/user_management/authenticate';
const REFRESH_INTERVAL_HOURS = 6;
const AUTH_TOKEN = process.env.AUTH_TOKEN ? process.env.AUTH_TOKEN.trim() : null;

let currentApiKey = null;
let lastRefreshTime = null;
let cachedRefreshTokenId = null;
let cachedRefreshTokenValue = null;
let clientId = null;

function getClientId() {
  if (!clientId) {
    clientId = 'client_01HNM792M5G5G1A2THWPXKFMXB';
    logDebug(`Using fixed client ID: ${clientId}`);
  }
  return clientId;
}

function parseAuthHeader(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }
  const parts = headerValue.split(' ');
  if (parts.length === 1) {
    return { scheme: null, token: parts[0].trim() };
  }
  const [scheme, ...rest] = parts;
  return { scheme, token: rest.join(' ').trim() };
}

function isAuthorizedForServerTokens(clientAuthorization) {
  if (!AUTH_TOKEN) {
    return false;
  }
  const parsed = parseAuthHeader(clientAuthorization);
  return parsed && parsed.token === AUTH_TOKEN;
}

function shouldRefresh() {
  if (!lastRefreshTime) {
    return true;
  }
  const hoursSinceRefresh = (Date.now() - lastRefreshTime) / (1000 * 60 * 60);
  return hoursSinceRefresh >= REFRESH_INTERVAL_HOURS;
}

function syncRefreshTokenCache() {
  const activeRefresh = getActiveRefreshToken();
  if (!activeRefresh) {
    cachedRefreshTokenId = null;
    cachedRefreshTokenValue = null;
    currentApiKey = null;
    lastRefreshTime = null;
    return null;
  }
  if (cachedRefreshTokenId !== activeRefresh.id || cachedRefreshTokenValue !== activeRefresh.value) {
    cachedRefreshTokenId = activeRefresh.id;
    cachedRefreshTokenValue = activeRefresh.value;
    currentApiKey = null;
    lastRefreshTime = null;
    updateAuthStatus({ activeAccessTokenSnippet: null });
    logInfo('Active refresh token updated, clearing cached access token');
  }
  return activeRefresh;
}

async function refreshApiKey() {
  if (!cachedRefreshTokenValue) {
    const error = new Error('No refresh token available');
    error.status = 401;
    throw error;
  }

  logInfo('Refreshing API key...');
  updateAuthStatus({ lastRefreshStatus: 'in-progress', lastRefreshError: null });

  try {
    const formData = new URLSearchParams();
    formData.append('grant_type', 'refresh_token');
    formData.append('refresh_token', cachedRefreshTokenValue);
    formData.append('client_id', getClientId());

    const response = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    currentApiKey = data.access_token;
    lastRefreshTime = Date.now();

    if (data.refresh_token && cachedRefreshTokenId) {
      cachedRefreshTokenValue = data.refresh_token;
      updateTokenValue('refresh', cachedRefreshTokenId, data.refresh_token);
      activateToken('refresh', cachedRefreshTokenId);
    }

    updateAuthStatus({
      lastRefreshAt: new Date().toISOString(),
      lastRefreshStatus: 'success',
      lastRefreshError: null,
      activeAccessTokenSnippet: maskToken(currentApiKey)
    });

    logInfo('API key refreshed successfully');
    return currentApiKey;
  } catch (error) {
    updateAuthStatus({
      lastRefreshAt: new Date().toISOString(),
      lastRefreshStatus: 'error',
      lastRefreshError: error.message
    });
    logError('Failed to refresh API key', error);
    throw error;
  }
}

async function ensureAccessTokenValid() {
  if (!cachedRefreshTokenValue) {
    const error = new Error('No refresh token configured');
    error.status = 401;
    throw error;
  }
  if (!currentApiKey || shouldRefresh()) {
    await refreshApiKey();
  }
  if (!currentApiKey) {
    const error = new Error('Refresh token did not return access token');
    error.status = 500;
    throw error;
  }
  return currentApiKey;
}

export async function initializeAuth() {
  initializeDashboardState();
  updateAuthStatus({ authTokenConfigured: Boolean(AUTH_TOKEN) });

  const activeFactory = getActiveFactoryKey();
  if (activeFactory) {
    logInfo('Factory API key available via token manager');
  }

  const activeRefresh = syncRefreshTokenCache();
  if (activeRefresh) {
    try {
      await refreshApiKey();
    } catch (error) {
      logError('Failed initial refresh with configured token', error);
    }
  } else if (!activeFactory) {
    logInfo('No server-managed tokens configured; client authorization headers will be required.');
  }
}

export function getDashboardAuthToken() {
  return AUTH_TOKEN || '';
}

export async function getApiKey(clientAuthorization = null) {
  const authorizedForServerTokens = isAuthorizedForServerTokens(clientAuthorization);
  const timestamp = new Date().toISOString();

  if (authorizedForServerTokens) {
    const activeFactory = getActiveFactoryKey();
    if (activeFactory) {
      const header = `Bearer ${activeFactory.value}`;
      const snippet = maskToken(activeFactory.value);
      updateAuthStatus({ lastSource: 'factory', lastUsedAt: timestamp, activeAccessTokenSnippet: snippet });
      return { header, source: 'factory', tokenSnippet: snippet };
    }

    const activeRefresh = syncRefreshTokenCache();
    if (activeRefresh) {
      await ensureAccessTokenValid();
      const header = `Bearer ${currentApiKey}`;
      const snippet = maskToken(currentApiKey);
      updateAuthStatus({ lastSource: 'refresh', lastUsedAt: timestamp, activeAccessTokenSnippet: snippet });
      return { header, source: 'refresh', tokenSnippet: snippet };
    }

    const noTokenError = new Error('Server-managed tokens are not configured. Please add a FACTORY_API_KEY or refresh token.');
    noTokenError.status = 503;
    throw noTokenError;
  }

  if (clientAuthorization) {
    const parsed = parseAuthHeader(clientAuthorization);
    const snippet = parsed ? maskToken(parsed.token) : 'N/A';
    updateAuthStatus({ lastSource: 'client', lastUsedAt: timestamp, lastClientTokenSnippet: snippet });
    return { header: clientAuthorization, source: 'client', tokenSnippet: snippet };
  }

  const error = new Error('No authorization available. Please configure tokens or provide Authorization header.');
  error.status = 401;
  throw error;
}
