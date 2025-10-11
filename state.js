import fs from 'fs';
import os from 'os';
import path from 'path';

const configuredStorePath = process.env.TOKEN_STORE_PATH;
const STORE_PATH = configuredStorePath
  ? path.isAbsolute(configuredStorePath)
    ? configuredStorePath
    : path.join(process.cwd(), configuredStorePath)
  : path.join(process.cwd(), 'data', 'token-store.json');
const FACTORY_AUTH_PATH = path.join(os.homedir(), '.factory', 'auth.json');
const MAX_LOGS = 100;

let initialized = false;
let requestLogs = [];
let tokenStore = {
  factoryKeys: [],
  refreshTokens: [],
  activeFactoryKeyId: null,
  activeRefreshTokenId: null
};
let authStatus = {
  authTokenConfigured: false,
  lastSource: 'none',
  lastUsedAt: null,
  lastRefreshAt: null,
  lastRefreshStatus: null,
  lastRefreshError: null,
  activeAccessTokenSnippet: null,
  lastClientTokenSnippet: null
};

function maskToken(value) {
  if (!value || typeof value !== 'string') {
    return 'N/A';
  }
  if (value.length <= 8) {
    return value;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function persistStore() {
  try {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify(tokenStore, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error('[ERROR] Failed to persist token store', error);
  }
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadStore() {
  if (fs.existsSync(STORE_PATH)) {
    try {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      tokenStore = {
        factoryKeys: Array.isArray(parsed.factoryKeys) ? parsed.factoryKeys : [],
        refreshTokens: Array.isArray(parsed.refreshTokens) ? parsed.refreshTokens : [],
        activeFactoryKeyId: parsed.activeFactoryKeyId || null,
        activeRefreshTokenId: parsed.activeRefreshTokenId || null
      };
    } catch (error) {
      console.error('[ERROR] Failed to read token store, using defaults', error);
    }
  }
}

function loadLegacyFactoryToken() {
  if (!fs.existsSync(FACTORY_AUTH_PATH)) {
    return;
  }
  try {
    const raw = fs.readFileSync(FACTORY_AUTH_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.refresh_token) {
        ensureToken('refresh', parsed.refresh_token, 'Factory Refresh Token', true);
      }
      if (parsed.access_token) {
        ensureToken('factory', parsed.access_token, 'Factory Access Token', true);
      }
    }
  } catch (error) {
    console.error('[ERROR] Failed to load legacy factory auth', error);
  }
}

function ensureToken(type, value, label, readOnly = false) {
  if (typeof value === 'string') {
    value = value.trim();
  }
  if (!value) {
    return;
  }
  const collection = type === 'factory' ? tokenStore.factoryKeys : tokenStore.refreshTokens;
  const existing = collection.find((item) => item.value === value);
  if (existing) {
    if (readOnly) {
      existing.readOnly = true;
      if (label) {
        existing.label = label;
      }
    }
    if (type === 'factory' && !tokenStore.activeFactoryKeyId) {
      tokenStore.activeFactoryKeyId = existing.id;
    }
    if (type === 'refresh' && !tokenStore.activeRefreshTokenId) {
      tokenStore.activeRefreshTokenId = existing.id;
    }
    return;
  }

  const token = {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: label || `${type === 'factory' ? 'Factory' : 'Refresh'} Token`,
    value,
    readOnly
  };
  collection.push(token);
  if (type === 'factory' && !tokenStore.activeFactoryKeyId) {
    tokenStore.activeFactoryKeyId = token.id;
  }
  if (type === 'refresh' && !tokenStore.activeRefreshTokenId) {
    tokenStore.activeRefreshTokenId = token.id;
  }
}

function hydrateFromEnvironment() {
  const envFactory = process.env.FACTORY_API_KEY;
  if (envFactory && envFactory.trim() !== '') {
    ensureToken('factory', envFactory.trim(), 'FACTORY_API_KEY (env)', true);
  }
  const envRefresh = process.env.DROID_REFRESH_KEY;
  if (envRefresh && envRefresh.trim() !== '') {
    ensureToken('refresh', envRefresh.trim(), 'DROID_REFRESH_KEY (env)', true);
  }
}

export function initializeDashboardState() {
  if (initialized) {
    return;
  }
  ensureDirectory(STORE_PATH);
  loadStore();
  hydrateFromEnvironment();
  loadLegacyFactoryToken();
  persistStore();
  initialized = true;
}

function requireInitialization() {
  if (!initialized) {
    initializeDashboardState();
  }
}

export function recordRequestLog(entry) {
  requireInitialization();
  const normalized = {
    timestamp: entry.timestamp || new Date().toISOString(),
    method: entry.method,
    path: entry.path,
    status: entry.status,
    durationMs: entry.durationMs,
    clientIp: entry.clientIp,
    tokenSource: entry.tokenSource || 'none',
    tokenSnippet: entry.tokenSnippet ? entry.tokenSnippet : 'N/A'
  };
  requestLogs.push(normalized);
  if (requestLogs.length > MAX_LOGS) {
    requestLogs = requestLogs.slice(-MAX_LOGS);
  }
}

export function getRecentLogs(limit = 20) {
  requireInitialization();
  return requestLogs.slice(-limit).reverse();
}

function sanitizeToken(token) {
  return {
    id: token.id,
    label: token.label,
    snippet: maskToken(token.value),
    readOnly: Boolean(token.readOnly)
  };
}

export function getTokenStoreSnapshot() {
  requireInitialization();
  return {
    factoryKeys: tokenStore.factoryKeys.map(sanitizeToken),
    refreshTokens: tokenStore.refreshTokens.map(sanitizeToken),
    activeFactoryKeyId: tokenStore.activeFactoryKeyId,
    activeRefreshTokenId: tokenStore.activeRefreshTokenId
  };
}

export function getActiveFactoryKey() {
  requireInitialization();
  if (!tokenStore.activeFactoryKeyId) {
    return null;
  }
  return tokenStore.factoryKeys.find((token) => token.id === tokenStore.activeFactoryKeyId) || null;
}

export function getActiveRefreshToken() {
  requireInitialization();
  if (!tokenStore.activeRefreshTokenId) {
    return null;
  }
  return tokenStore.refreshTokens.find((token) => token.id === tokenStore.activeRefreshTokenId) || null;
}

export function addToken(type, value, label) {
  requireInitialization();
  ensureToken(type, value, label, false);
  persistStore();
  return getTokenStoreSnapshot();
}

export function removeToken(type, id) {
  requireInitialization();
  const collection = type === 'factory' ? tokenStore.factoryKeys : tokenStore.refreshTokens;
  const index = collection.findIndex((token) => token.id === id);
  if (index === -1) {
    throw new Error('Token not found');
  }
  if (collection[index].readOnly) {
    throw new Error('Cannot remove read-only token');
  }
  collection.splice(index, 1);
  if (type === 'factory' && tokenStore.activeFactoryKeyId === id) {
    tokenStore.activeFactoryKeyId = collection[0]?.id || null;
  }
  if (type === 'refresh' && tokenStore.activeRefreshTokenId === id) {
    tokenStore.activeRefreshTokenId = collection[0]?.id || null;
  }
  persistStore();
  return getTokenStoreSnapshot();
}

export function activateToken(type, id) {
  requireInitialization();
  const collection = type === 'factory' ? tokenStore.factoryKeys : tokenStore.refreshTokens;
  const exists = collection.some((token) => token.id === id);
  if (!exists) {
    throw new Error('Token not found');
  }
  if (type === 'factory') {
    tokenStore.activeFactoryKeyId = id;
  } else {
    tokenStore.activeRefreshTokenId = id;
  }
  persistStore();
  return getTokenStoreSnapshot();
}

export function getTokenValue(type, id) {
  requireInitialization();
  const collection = type === 'factory' ? tokenStore.factoryKeys : tokenStore.refreshTokens;
  const token = collection.find((item) => item.id === id);
  if (!token) {
    return null;
  }
  return { ...token };
}

export function updateTokenValue(type, id, value) {
  requireInitialization();
  const collection = type === 'factory' ? tokenStore.factoryKeys : tokenStore.refreshTokens;
  const token = collection.find((item) => item.id === id);
  if (!token) {
    throw new Error('Token not found');
  }
  token.value = value;
  persistStore();
}

export function updateAuthStatus(update) {
  authStatus = { ...authStatus, ...update };
}

export function getAuthStatus() {
  return { ...authStatus };
}

export function getDashboardState(limit = 20) {
  return {
    logs: getRecentLogs(limit),
    tokens: getTokenStoreSnapshot(),
    authStatus: getAuthStatus()
  };
}

export { maskToken };
