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
      console.log("Request URL", requestUrl);
      const response = await fetch(requestUrl, {
        ...fetchOptions,
        headers,
        signal: controller.signal
      });

      const payload = await parseResponse(response);
      console.log("API Response", payload);
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
    const existingUser = getAuthUser() || {};
    const phoneVal = profile.phoneNumber || profile.phone || profile.phone_number || existingUser.phoneNumber || existingUser.phone || existingUser.phone_number || '';
    const genderVal = profile.gender || existingUser.gender || '';
    const dobVal = profile.dateOfBirth || profile.dob || existingUser.dateOfBirth || existingUser.dob || '';
    const fullNameVal = profile.fullName || profile.name || existingUser.fullName || existingUser.name || profile.email || 'User';

    const merged = {
      ...existingUser,
      ...profile,
      fullName: fullNameVal,
      name: fullNameVal,
      email: profile.email || existingUser.email || '',
      role: String(profile.role || existingUser.role || '').toLowerCase(),
      userId: profile.userId || profile.id || existingUser.userId || existingUser.id || '',
      id: profile.id || profile.userId || existingUser.id || existingUser.userId || '',
      phoneNumber: phoneVal,
      phone: phoneVal,
      gender: genderVal,
      dateOfBirth: dobVal,
      dob: dobVal
    };

    Object.assign(profile, merged);
    setCachedProfile(profile);
    setAuthUser(profile);
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

function extractDoctorsArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.doctors)) return data.doctors;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.results)) return data.results;
  return [];
}

function normalizeDoctor(d) {
  if (!d) return null;
  const userObj = d.user && typeof d.user === 'object' ? d.user : {};

  const id = d.id ?? d.doctorId ?? d.doctor_id ?? d.user_id ?? d.userId ?? userObj.id ?? userObj.userId ?? 0;
  const rawName = d.name || d.fullName || d.doctorName || d.doctor_name || userObj.name || userObj.fullName || '';
  const cleanName = String(rawName).trim();
  const printableName = cleanName ? (cleanName.toLowerCase().startsWith('dr') ? cleanName : `Dr. ${cleanName}`) : 'Doctor';

  const email = String(d.email || d.doctorEmail || d.doctor_email || d.contactEmail || userObj.email || '').trim();
  const phone = String(d.phone || d.phoneNumber || d.phone_number || d.contactPhone || userObj.phone || userObj.phoneNumber || userObj.phone_number || '').trim();
  const specialization = String(d.specialization || d.specialty || d.spec || 'General').trim();
  const hospital = String(d.hospital_name || d.hospital || d.hospitalName || d.location || d.address || 'N/A').trim();
  const location = String(d.location || d.address || d.hospital_name || d.hospital || 'N/A').trim();
  const fee = Number(d.consultation_fee || d.consultationFee || d.fee || 0);

  return {
    id: id,
    name: printableName,
    rawName: cleanName || 'Doctor',
    fullName: printableName,
    email: email,
    phone: phone,
    phoneNumber: phone,
    specialization: specialization,
    hospital: hospital,
    hospital_name: hospital,
    location: location,
    consultationFee: fee,
    experience: String(d.experience || '').trim(),
    rating: d.rating ?? null,
    raw: d
  };
}

function normalizeDoctorsList(raw) {
  const arr = extractDoctorsArray(raw);
  return arr.map(normalizeDoctor).filter(Boolean);
}

const doctors = {
  list: () => apiRequest('/doctors', { method: 'GET' }),
  create: (payload) => apiRequest('/doctors', { method: 'POST', body: JSON.stringify(payload) }),
  update: (payload) => {
    const id = payload?.id ?? payload;
    const cleanPayload = { ...payload };
    delete cleanPayload.id;
    return apiRequest(`/doctors?id=${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(cleanPayload) });
  },
  delete: (payload) => {
    const rawId = typeof payload === 'object' && payload !== null ? (payload.id ?? payload.doctorId ?? payload.user_id) : payload;
    const cleanId = String(rawId || '').trim();
    if (!cleanId) return Promise.reject(new APIError('Invalid doctor ID', 400));

    return apiRequest(`/doctors?id=${encodeURIComponent(cleanId)}`, { method: 'DELETE' }).catch(() => {
      return apiRequest('/doctors', { method: 'DELETE', body: JSON.stringify({ id: cleanId, doctorId: cleanId }) });
    });
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
  list: async (options = {}) => {
    const params = new URLSearchParams();
    const patientEmail = String(options.patientEmail || '').trim();
    const doctorEmail = String(options.doctorEmail || '').trim();
    const patientPhone = String(options.patientPhone || '').trim();
    const appointmentId = String(options.appointmentId || '').trim();
    const date = String(options.date || options.appointmentDate || '').trim();

    if (patientEmail) params.set('patientEmail', patientEmail);
    if (doctorEmail) params.set('doctorEmail', doctorEmail);
    if (patientPhone) params.set('patientPhone', patientPhone);
    if (appointmentId) params.set('appointmentId', appointmentId);
    if (date) params.set('date', date);

    const requestPath = params.toString()
      ? `/appointments?${params.toString()}`
      : '/appointments';

    let remoteList = [];
    try {
      const response = await apiRequest(requestPath, { method: 'GET', handleUnauthorized: false });
      remoteList = Array.isArray(response)
        ? response
        : (response?.appointments || response?.bookedSlots || response?.items || response?.data || []);
    } catch (e) {
      remoteList = [];
    }

    return remoteList;
  },
  create: async (payload) => {
    const response = await apiRequest('/appointments', { method: 'POST', body: JSON.stringify(payload) });
    return response;
  },
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
  extractDoctorsArray,
  normalizeDoctor,
  normalizeDoctorsList,
  users,
  appointments,
  getErrorMessage,
  loadLocalList,
  storeLocalList
};

window.API_URL = API_BASE_URL;
