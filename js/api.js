const API_BASE_URL = 'https://api.medicares.me';
const APPOINTMENTS_ENDPOINT = 'https://api.medicares.me/appointments';

const STORAGE_KEYS = {
  token: 'token',
  legacyToken: 'medicares_token',
  user: 'user',
  legacyUser: 'medicares_user',
  profileCache: 'medicares_profile_cache',
  theme: 'medicares_theme',
  appointments: 'medicares_appointments',
  reminders: 'medicares_reminders',
  remembers: 'medicares_remembers'
};

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

class APIError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
  }
}

function getJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getAuthToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || localStorage.getItem(STORAGE_KEYS.legacyToken) || '';
}

function setAuthToken(token) {
  if (!token) return;
  localStorage.setItem(STORAGE_KEYS.token, token);
  localStorage.setItem(STORAGE_KEYS.legacyToken, token);
}

function setAuthUser(user) {
  if (!user) return;
  setJson(STORAGE_KEYS.user, user);
  setJson(STORAGE_KEYS.legacyUser, user);
}

function setAuthSession(token, user) {
  setAuthToken(token || '');
  setAuthUser(user || null);
}

function clearAuthSession() {
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.legacyToken);
  localStorage.removeItem(STORAGE_KEYS.user);
  localStorage.removeItem(STORAGE_KEYS.legacyUser);
  localStorage.removeItem(STORAGE_KEYS.profileCache);
}

function getAuthUser() {
  return getJson(STORAGE_KEYS.user, getJson(STORAGE_KEYS.legacyUser, null));
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTime(value) {
  if (!value) return '-';
  const source = /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? `1970-01-01T${value}` : value;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(datePart, timePart) {
  const source = datePart && timePart ? `${datePart}T${timePart}` : datePart || timePart;
  if (!source) return '-';
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return '-';
  return `${formatDate(date)} • ${formatTime(date)}`;
}

function initials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'U';
}

function shouldRetry(error, attempt, retries) {
  if (attempt >= retries) return false;
  if (!(error instanceof APIError)) return true;
  return error.status === 429 || error.status >= 500;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  let payload;

  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => '');
    payload = text ? { message: text } : null;
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Request failed with status ${response.status}`;
    throw new APIError(message, response.status, payload);
  }

  return payload;
}

async function request(path, options = {}) {
  const {
    retries = 2,
    timeoutMs = 15000,
    includeAuth = true,
    handleUnauthorized = true,
    ...fetchOptions
  } = options;

  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {
        ...(fetchOptions.body && !(fetchOptions.headers || {})['Content-Type'] ? { 'Content-Type': 'application/json' } : {}),
        ...(fetchOptions.headers || {})
      };

      if (includeAuth) {
        const token = getAuthToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      }

      const requestUrl = /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path}`;
      const response = await fetch(requestUrl, {
        ...fetchOptions,
        headers,
        signal: controller.signal
      });

      const payload = await parseResponse(response);
      clearTimeout(timeout);
      return payload;
    } catch (error) {
      clearTimeout(timeout);

      let apiError = error;
      if (error?.name === 'AbortError') {
        apiError = new APIError('Request timed out. Please try again.', 408);
      } else if (!(error instanceof APIError)) {
        apiError = new APIError('Network error. Check your connection and try again.', 0, error);
      }

      if (handleUnauthorized && apiError.status === 401) {
        clearAuthSession();
        window.dispatchEvent(new CustomEvent('medicares:session-expired'));
      }

      if (!shouldRetry(apiError, attempt, retries)) {
        throw apiError;
      }

      attempt += 1;
      await delay(250 * attempt);
    }
  }

  throw new APIError('Unexpected request failure.');
}

async function apiRequest(path, options = {}) {
  return request(path, options);
}

async function safeApiCall(path, options = {}, fallback = null) {
  try {
    return await apiRequest(path, options);
  } catch {
    return typeof fallback === 'function' ? fallback() : fallback;
  }
}

function getCachedProfile() {
  const cache = getJson(STORAGE_KEYS.profileCache, null);
  if (!cache || !cache.data || !cache.cachedAt) return null;
  if (Date.now() - cache.cachedAt > PROFILE_CACHE_TTL_MS) return null;
  return cache.data;
}

function setCachedProfile(profile) {
  setJson(STORAGE_KEYS.profileCache, {
    data: profile,
    cachedAt: Date.now()
  });
}

async function getProfile(options = {}) {
  const { forceRefresh = false } = options;
  if (!forceRefresh) {
    const cached = getCachedProfile();
    if (cached) return cached;
  }

  const profile = await apiRequest('/profile', { method: 'GET' });
  if (profile) {
    setCachedProfile(profile);
    setAuthUser({
      name: profile.fullName || profile.name || profile.email || 'User',
      email: profile.email || '',
      role: String(profile.role || '').toLowerCase(),
      userId: profile.userId || profile.id || ''
    });
  }
  return profile;
}

function loginRedirectByRole(role) {
  if (String(role || '').toLowerCase() === 'doctor') return 'doctor-login.html';
  return 'login.html';
}

async function requireAuth(options = {}) {
  const {
    role = null,
    redirectTo = role ? loginRedirectByRole(role) : 'login.html',
    validateProfile = true
  } = options;

  const token = getAuthToken();
  if (!token) {
    window.location.href = redirectTo;
    return null;
  }

  if (!validateProfile) return { token, user: getAuthUser() };

  try {
    const profile = await getProfile();
    if (role) {
      const actualRole = String(profile?.role || '').toLowerCase();
      if (actualRole && actualRole !== String(role).toLowerCase()) {
        window.location.href = loginRedirectByRole(actualRole);
        return null;
      }
    }
    return profile;
  } catch (error) {
    const status = error?.status || 0;
    if (status === 401 || status === 403) {
      clearAuthSession();
      window.location.href = redirectTo;
      return null;
    }

    const storedUser = getAuthUser();
    if (storedUser) {
      return {
        ...storedUser,
        userId: storedUser.userId || storedUser.id || '',
        fullName: storedUser.fullName || storedUser.name || 'User',
        email: storedUser.email || '',
        role: storedUser.role || role
      };
    }

    return {
      userId: '',
      fullName: 'User',
      email: '',
      role
    };
  }
}

const doctors = {
  list: () => apiRequest('/doctors', { method: 'GET' }),
  create: (payload) => apiRequest('/doctors', { method: 'POST', body: JSON.stringify(payload) }),
  update: (payload) => {
    const id = payload.id;
    const cleanPayload = { ...payload };
    delete cleanPayload.id;
    return apiRequest(`/doctors?id=${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(cleanPayload) });
  },
  delete: (payload) => {
    const id = payload?.id ?? payload;
    return apiRequest(`/doctors?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
};

const users = {
  list: () => apiRequest('/users', { method: 'GET' }),
  create: (payload) => apiRequest('/users', { method: 'POST', body: JSON.stringify(payload) }),
  update: (payload) => {
    const id = payload.id;
    const cleanPayload = { ...payload };
    delete cleanPayload.id;
    return apiRequest(`/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(cleanPayload) });
  },
  delete: (payload) => {
    const id = payload?.id ?? payload?.userId ?? payload;
    return apiRequest(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
};

const appointments = {
  list: (options = {}) => {
    const params = new URLSearchParams();
    const patientEmail = String(options.patientEmail || '').trim();
    const doctorEmail = String(options.doctorEmail || '').trim();

    if (patientEmail) {
      params.set('patientEmail', patientEmail);
    }
    if (doctorEmail) {
      params.set('doctorEmail', doctorEmail);
    }

    const requestPath = params.toString()
      ? `${APPOINTMENTS_ENDPOINT}?${params.toString()}`
      : APPOINTMENTS_ENDPOINT;

    return apiRequest(requestPath, { method: 'GET' });
  },
  create: (payload) => apiRequest('/appointments', { method: 'POST', body: JSON.stringify(payload) }),
  delete: (payload) => apiRequest('/appointments', { method: 'DELETE', body: JSON.stringify(payload) })
};

function getErrorMessage(error) {
  if (error instanceof APIError) {
    switch (error.status) {
      case 400:
        return error.message || 'Invalid request parameters. Please verify your details.';
      case 401:
        return error.message || 'Your session has expired. Please log in again.';
      case 403:
        return error.message || 'Access denied. You do not have permission to perform this action.';
      case 404:
        return error.message || 'The requested resource could not be found.';
      case 409:
        return error.message || 'Conflict. A record with these details might already exist.';
      case 500:
        return error.message || 'Server error. Something went wrong on our end. Please try again later.';
      default:
        return error.message || 'Request failed. Please try again.';
    }
  }
  return error?.message || 'Network error. Please check your internet connection.';
}

function loadLocalList(key, fallback = []) {
  return getJson(key, fallback);
}

function storeLocalList(key, list) {
  setJson(key, list);
}

window.MedicaresAPI = {
  API_BASE_URL,
  STORAGE_KEYS,
  APIError,
  getJson,
  setJson,
  getAuthToken,
  setAuthToken,
  setAuthUser,
  setAuthSession,
  clearAuthSession,
  getAuthUser,
  sanitizeText,
  formatDate,
  formatTime,
  formatDateTime,
  initials,
  apiRequest,
  safeApiCall,
  request,
  getProfile,
  requireAuth,
  doctors,
  users,
  appointments,
  getErrorMessage,
  loadLocalList,
  storeLocalList
};

window.API_URL = API_BASE_URL;
