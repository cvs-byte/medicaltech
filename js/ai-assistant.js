/**
 * ============================================================
 * MEDICARES AI ASSISTANT - PRODUCTION JAVASCRIPT MODULE
 * Floating AI Button, Right-Side Drawer, APIM Integration & Voice
 * With State Continuation across Conversation Turns (previous_response_id)
 * And Authenticated Patient Context Propagation
 * ============================================================
 */

(function () {
  'use strict';

  // Configuration
  const AI_API_URL =
    (typeof window !== 'undefined' && (window.VITE_MEDICARES_AI_API_URL || window.MEDICARES_AI_API_URL)) ||
    'https://apiai.medicares.me/ai/api/chat';

  const STORAGE_KEY = 'medicares_ai_chat_history';

  // SVG Icons
  const ICONS = {
    sparkle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
    sparkleSmall: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L21.6 12l-7.2 2.4L12 21.6l-2.4-7.2L2.4 12l7.2-2.4L12 2z"/></svg>`,
    close: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    trash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
    mic: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
    send: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
    calendar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
    doctor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    hospital: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v4"/><path d="M14 8h-4"/><path d="M18 18h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/><path d="M6 14v8h12v-8"/></svg>`,
    alert: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`
  };

  // State
  let messages = [];
  let previousResponseId = null;
  let currentPatientId = null;
  let isOpen = false;
  let isLoading = false;
  let isListening = false;
  let recognition = null;
  let activeAbortController = null;
  let lastFailedMessage = null;

  // DOM Elements cache
  let dom = {
    triggerBtn: null,
    drawer: null,
    body: null,
    welcome: null,
    form: null,
    textarea: null,
    sendBtn: null,
    micBtn: null,
    voiceBanner: null,
    closeBtn: null,
    clearBtn: null,
  };

  // ==========================================
  // AUTHENTICATED PATIENT PROFILE CONTEXT
  // ==========================================
  const SENSITIVE_KEY_PATTERNS = [
    'password',
    'token',
    'secret',
    'jwt',
    'auth',
    'key',
    'credential',
    'hash',
    'private',
  ];

  function isSensitiveKey(key) {
    if (!key || typeof key !== 'string') return true;
    const lower = key.toLowerCase();
    return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
  }

  function isValidField(val) {
    if (val === null || val === undefined) return false;
    const s = String(val).trim();
    if (!s) return false;
    const lower = s.toLowerCase();
    if (
      lower === 'null' ||
      lower === 'undefined' ||
      lower === 'unknown' ||
      lower === '[object object]'
    ) {
      return false;
    }
    return true;
  }

  function getAuthenticatedPatientContext() {
    try {
      let user = null;
      if (
        typeof window !== 'undefined' &&
        window.MedicaresAPI &&
        typeof window.MedicaresAPI.getAuthUser === 'function'
      ) {
        user = window.MedicaresAPI.getAuthUser();
      }
      if (!user) {
        const raw =
          localStorage.getItem('user') ||
          localStorage.getItem('medicares_user');
        user = raw ? JSON.parse(raw) : null;
      }

      // Merge cached profile if available for any enriched fields
      if (
        typeof window !== 'undefined' &&
        window.MedicaresAPI &&
        typeof window.MedicaresAPI.getCachedProfile === 'function'
      ) {
        const cached = window.MedicaresAPI.getCachedProfile();
        if (cached && typeof cached === 'object') {
          user = { ...(user || {}), ...cached };
        }
      } else {
        try {
          const rawCache = localStorage.getItem('medicares_profile_cache');
          if (rawCache) {
            const cacheObj = JSON.parse(rawCache);
            if (cacheObj && cacheObj.data && typeof cacheObj.data === 'object') {
              user = { ...(user || {}), ...cacheObj.data };
            }
          }
        } catch {
          // ignore cache read failure
        }
      }

      if (!user || typeof user !== 'object') return null;

      const roleStr = String(user.role || '').trim().toLowerCase();
      const isPatientDashboard =
        typeof document !== 'undefined' &&
        document.body?.dataset?.role === 'patient';

      // Only attach patient context when authenticated user is a patient
      if (roleStr && roleStr !== 'patient' && !isPatientDashboard) {
        return null;
      }

      const context = {};

      // role: always 'PATIENT' for authenticated patient sessions
      if (roleStr === 'patient' || isPatientDashboard || isValidField(user.patientId || user.patient_id)) {
        context.role = 'PATIENT';
      } else if (isValidField(user.role)) {
        context.role = String(user.role).trim().toUpperCase();
      }

      // patientId: primary patient identifier
      const pid = user.patientId || user.patient_id || user.userId || user.id;
      if (isValidField(pid)) {
        context.patientId = String(pid).trim();
      }

      // userId: user account identifier
      const uid = user.userId || user.id;
      if (isValidField(uid)) {
        context.userId = String(uid).trim();
      }

      // fullName / name
      const name = user.fullName || user.name;
      if (isValidField(name)) {
        context.fullName = String(name).trim();
      }

      // firstName
      if (isValidField(user.firstName)) {
        context.firstName = String(user.firstName).trim();
      }

      // lastName
      if (isValidField(user.lastName)) {
        context.lastName = String(user.lastName).trim();
      }

      // email
      if (isValidField(user.email)) {
        context.email = String(user.email).trim();
      }

      // mobileNumber / phoneNumber
      const phone =
        user.mobileNumber ||
        user.phoneNumber ||
        user.phone ||
        user.phone_number;
      if (isValidField(phone)) {
        context.mobileNumber = String(phone).trim();
        context.phoneNumber = String(phone).trim();
      }

      // gender
      if (isValidField(user.gender)) {
        context.gender = String(user.gender).trim();
      }

      // dateOfBirth / dob
      const dob = user.dateOfBirth || user.dob;
      if (isValidField(dob)) {
        context.dateOfBirth = String(dob).trim();
      }

      // address / city / state / postalCode
      if (isValidField(user.address)) {
        context.address = String(user.address).trim();
      }
      if (isValidField(user.city)) {
        context.city = String(user.city).trim();
      }
      if (isValidField(user.state)) {
        context.state = String(user.state).trim();
      }
      const postal = user.postalCode || user.zipCode || user.pincode;
      if (isValidField(postal)) {
        context.postalCode = String(postal).trim();
      }

      // status
      const status = user.status || user.patientStatus;
      if (isValidField(status)) {
        context.patientStatus = String(status).trim();
      }

      // bloodGroup
      if (isValidField(user.bloodGroup)) {
        context.bloodGroup = String(user.bloodGroup).trim();
      }

      // Ensure no sensitive credentials or tokens leaked
      Object.keys(context).forEach((k) => {
        if (isSensitiveKey(k)) {
          delete context[k];
        }
      });

      // Ensure at least one identity field or valid role is present
      const hasIdentity = Boolean(
        context.patientId || context.userId || context.fullName || context.email || context.mobileNumber
      );
      if (!hasIdentity && !context.role) {
        return null;
      }

      return context;
    } catch {
      return null;
    }
  }

  // Safe development logging without exposing sensitive secrets or raw PII (Section 29)
  function logSafePatientContext(ctx) {
    if (!ctx) {
      console.log('[Medicares AI] Authenticated patient context: NONE (guest/unauthenticated)');
      return;
    }
    const safeSummary = {};
    Object.keys(ctx).forEach((k) => {
      safeSummary[k] = k === 'role' ? ctx[k] : 'PRESENT';
    });
    console.log('[Medicares AI] Authenticated patient context loaded:', safeSummary);
  }

  // Supported model-visible developer instruction for Microsoft Foundry Responses API
  function buildModelVisiblePatientContextMessage(patientContext) {
    if (!patientContext || typeof patientContext !== 'object') return null;

    const lines = [
      'AUTHENTICATED MEDICARES PATIENT CONTEXT',
      'The following patient context was supplied by the authenticated Medicares application.',
      '',
      'Patient identity:',
    ];

    if (patientContext.patientId) lines.push(`patientId = ${patientContext.patientId}`);
    if (patientContext.userId) lines.push(`userId = ${patientContext.userId}`);
    if (patientContext.role) lines.push(`role = ${patientContext.role}`);

    const profileLines = [];
    if (patientContext.fullName) profileLines.push(`fullName = ${patientContext.fullName}`);
    if (patientContext.firstName) profileLines.push(`firstName = ${patientContext.firstName}`);
    if (patientContext.lastName) profileLines.push(`lastName = ${patientContext.lastName}`);
    if (patientContext.email) profileLines.push(`email = ${patientContext.email}`);
    if (patientContext.mobileNumber) profileLines.push(`mobileNumber = ${patientContext.mobileNumber}`);
    if (patientContext.phoneNumber && patientContext.phoneNumber !== patientContext.mobileNumber) {
      profileLines.push(`phoneNumber = ${patientContext.phoneNumber}`);
    }
    if (patientContext.gender) profileLines.push(`gender = ${patientContext.gender}`);
    if (patientContext.dateOfBirth) profileLines.push(`dateOfBirth = ${patientContext.dateOfBirth}`);
    if (patientContext.address) profileLines.push(`address = ${patientContext.address}`);
    if (patientContext.city) profileLines.push(`city = ${patientContext.city}`);
    if (patientContext.state) profileLines.push(`state = ${patientContext.state}`);
    if (patientContext.postalCode) profileLines.push(`postalCode = ${patientContext.postalCode}`);
    if (patientContext.patientStatus) profileLines.push(`patientStatus = ${patientContext.patientStatus}`);
    if (patientContext.bloodGroup) profileLines.push(`bloodGroup = ${patientContext.bloodGroup}`);

    if (profileLines.length > 0) {
      lines.push('', 'Profile:');
      lines.push(...profileLines);
    }

    lines.push(
      '',
      'Rules:',
      '- The patient is already authenticated in the Medicares patient dashboard.',
      '- Do not ask whether the patient is logged in.',
      '- Do not ask for patient identity or profile information that is already present in this context.',
      '- Use the authenticated patient identity and profile when calling authorized patient-specific tools (e.g. getAppointments, getMedicalReports, createAppointment, cancelAppointment).',
      '- Never replace the authenticated patient identity with an ID supplied by ordinary user text.',
      '- Never reveal internal authentication tokens, keys, or credentials.'
    );

    return {
      type: 'message',
      role: 'developer',
      content: [
        {
          type: 'input_text',
          text: lines.join('\n'),
        },
      ],
    };
  }

  // ==========================================
  // SAFE MARKDOWN FORMATTING
  // ==========================================
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderFormattedMessage(text) {
    if (!text) return '';

    const lines = text.split('\n');
    let html = '';
    let inList = false;
    let listType = 'ul';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      if (!line) {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
        }
        continue;
      }

      // Unordered list
      const ulMatch = line.match(/^[-*•]\s+(.+)$/);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) html += `</${listType}>`;
          html += '<ul>';
          inList = true;
          listType = 'ul';
        }
        html += `<li>${formatInline(ulMatch[1])}</li>`;
        continue;
      }

      // Ordered list
      const olMatch = line.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) html += `</${listType}>`;
          html += '<ol>';
          inList = true;
          listType = 'ol';
        }
        html += `<li>${formatInline(olMatch[1])}</li>`;
        continue;
      }

      if (inList) {
        html += `</${listType}>`;
        inList = false;
      }

      // Heading (### or ## or #)
      const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        html += `<strong>${formatInline(hMatch[2])}</strong><br>`;
        continue;
      }

      // Blockquote
      if (line.startsWith('>')) {
        html += `<blockquote>${formatInline(line.replace(/^>\s?/, ''))}</blockquote>`;
        continue;
      }

      // Regular paragraph line
      html += `<p>${formatInline(line)}</p>`;
    }

    if (inList) {
      html += `</${listType}>`;
    }

    return html;
  }

  function formatInline(text) {
    let escaped = escapeHtml(text);

    // `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

    // **bold**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // *italic*
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // [text](url)
    escaped = escaped.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    return escaped;
  }

  function formatTime(isoString) {
    try {
      const d = isoString ? new Date(isoString) : new Date();
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  // ==========================================
  // STORAGE PERSISTENCE & SESSION SEGREGATION
  // ==========================================
  function loadStoredMessages() {
    const patientContext = getAuthenticatedPatientContext();
    const activePid = patientContext
      ? patientContext.patientId || patientContext.userId || null
      : null;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.messages)) {
          // If patient switched or logged out, clear chat to prevent identity leakage
          if (parsed.patientId !== activePid) {
            messages = [];
            previousResponseId = null;
            currentPatientId = activePid;
            return;
          }
          messages = parsed.messages;
          previousResponseId = parsed.previousResponseId || null;
          currentPatientId = activePid;
          return;
        }
        if (Array.isArray(parsed)) {
          messages = parsed;
          currentPatientId = activePid;
          return;
        }
      }
    } catch {
      // Ignore storage read failures
    }
    messages = [];
    previousResponseId = null;
    currentPatientId = activePid;
  }

  function saveStoredMessages() {
    try {
      const toSave = {
        messages: messages.slice(-40),
        previousResponseId: previousResponseId || null,
        patientId: currentPatientId || null,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Ignore storage write failures
    }
  }

  // ==========================================
  // API REQUEST & RESPONSE PARSING
  // ==========================================
  function extractAssistantText(data) {
    if (typeof data === 'string' && data.trim().length > 0) {
      return data.trim();
    }
    if (typeof data !== 'object' || data === null) {
      return '';
    }

    const output = Array.isArray(data.output) ? data.output : [];

    // Primary Microsoft Responses API extractor:
    // output[].type === "message" -> content[].type === "output_text" -> text
    const textParts = output
      .filter((item) => item && item.type === 'message')
      .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
      .filter((c) => c && c.type === 'output_text')
      .map((c) => (typeof c.text === 'string' ? c.text : ''))
      .filter(Boolean);

    if (textParts.length > 0) {
      return textParts.join('\n').trim();
    }

    // Fallback: any item with content text
    const fallbackParts = output
      .filter((item) => item && (item.type === 'message' || item.role === 'assistant'))
      .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
      .map((c) => (typeof c.text === 'string' ? c.text : ''))
      .filter(Boolean);

    if (fallbackParts.length > 0) {
      return fallbackParts.join('\n').trim();
    }

    if (data.message && typeof data.message === 'string') {
      return data.message.trim();
    }

    return '';
  }

  async function postChatMessage(userText) {
    const patientContext = getAuthenticatedPatientContext();
    const activePid = patientContext
      ? patientContext.patientId || patientContext.userId || null
      : null;

    // Reset conversation continuity if user switched between patients or logged out
    if (activePid !== currentPatientId) {
      currentPatientId = activePid;
      previousResponseId = null;
      messages = [];
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }

    logSafePatientContext(patientContext);

    // Build the user message item for Responses API
    const userMessage = {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: userText,
        },
      ],
    };

    // Inject model-visible developer instruction with authenticated patient context
    // on new conversations or whenever previousResponseId is not yet established.
    const inputItems = [];
    if (!previousResponseId && patientContext) {
      const devMsg = buildModelVisiblePatientContextMessage(patientContext);
      if (devMsg) {
        inputItems.push(devMsg);
      }
    }
    inputItems.push(userMessage);

    const requestBody = {
      input: inputItems,
    };

    // Attach previous_response_id to preserve conversation context across turns
    if (previousResponseId) {
      requestBody.previous_response_id = previousResponseId;
    }

    // Minimal non-sensitive metadata only (role identifier); complete patient profile is model-visible in developer message
    if (patientContext && patientContext.role) {
      requestBody.metadata = {
        role: 'PATIENT',
      };
    }

    activeAbortController = new AbortController();

    const headers = {
      'Content-Type': 'application/json',
    };

    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: activeAbortController.signal,
    });

    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      // Differentiated error logging without logging secrets (Section 17)
      console.error('Medicares AI error:', {
        status: response.status,
        body: raw,
      });

      let errorMessage = '';
      if (response.status === 400) {
        if (data?.error?.code === 'content_filter') {
          errorMessage =
            'Your message could not be processed due to content safety policy. Please rephrase your query.';
        } else {
          errorMessage =
            data?.error?.message ||
            data?.message ||
            'The request was invalid or could not be processed.';
        }
      } else if (response.status === 401) {
        errorMessage = 'AI session expired or unauthorized. Please sign in again.';
      } else if (response.status === 403) {
        errorMessage = 'Access to this healthcare assistant is forbidden.';
      } else if (response.status === 409) {
        errorMessage =
          data?.error?.message ||
          data?.message ||
          'An appointment scheduling conflict occurred. Please select an alternate time.';
      } else if (response.status === 429) {
        errorMessage = 'Rate limit reached. Please wait a moment before sending another message.';
      } else if (response.status >= 500) {
        errorMessage = 'Medicares AI service is temporarily unavailable. Please try again shortly.';
      } else {
        errorMessage =
          data?.error?.message ||
          data?.message ||
          `AI request failed with status ${response.status}.`;
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    const text = extractAssistantText(data);
    if (!text) {
      throw new Error('The AI response did not contain assistant text.');
    }

    // Capture returned response ID for subsequent conversation turns
    if (data && data.id) {
      previousResponseId = data.id;
    }

    return text;
  }

  // ==========================================
  // SPEECH RECOGNITION (VOICE INPUT)
  // ==========================================
  function initSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition ||
      null;

    if (!SpeechRecognition) {
      return null;
    }

    try {
      const sr = new SpeechRecognition();
      sr.continuous = false;
      sr.interimResults = true;
      sr.lang = 'en-US';

      sr.onstart = function () {
        isListening = true;
        updateVoiceUI();
      };

      sr.onresult = function (event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (dom.textarea) {
          dom.textarea.value = transcript;
          adjustTextareaHeight();
          updateSendButtonState();
        }
      };

      sr.onerror = function () {
        isListening = false;
        updateVoiceUI();
      };

      sr.onend = function () {
        isListening = false;
        updateVoiceUI();
      };

      return sr;
    } catch {
      return null;
    }
  }

  function toggleVoiceInput() {
    if (!recognition) {
      recognition = initSpeechRecognition();
    }

    if (!recognition) {
      alert(
        'Voice recognition is not supported in this browser. Please use Google Chrome, Edge, or a Web Speech-compatible browser.'
      );
      return;
    }

    if (isListening) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      isListening = false;
      updateVoiceUI();
    } else {
      try {
        recognition.start();
      } catch (err) {
        console.warn('Speech recognition start failed:', err);
      }
    }
  }

  function updateVoiceUI() {
    if (!dom.micBtn || !dom.voiceBanner) return;

    if (isListening) {
      dom.micBtn.classList.add('is-active');
      dom.micBtn.setAttribute('title', 'Stop listening');
      dom.voiceBanner.classList.add('is-listening');
    } else {
      dom.micBtn.classList.remove('is-active');
      dom.micBtn.setAttribute('title', 'Voice input');
      dom.voiceBanner.classList.remove('is-listening');
    }
  }

  // ==========================================
  // UI RENDERING
  // ==========================================
  function renderUI() {
    if (!dom.body) return;

    dom.body.innerHTML = '';

    if (messages.length === 0) {
      const patientContext = getAuthenticatedPatientContext();
      const patientNameGreeting = patientContext?.fullName
        ? `, ${patientContext.fullName}`
        : '';

      // Render welcome screen
      const welcome = document.createElement('div');
      welcome.className = 'medicares-ai-welcome';
      welcome.innerHTML = `
        <div class="medicares-ai-welcome-icon" aria-hidden="true">${ICONS.sparkle}</div>
        <h3 class="medicares-ai-welcome-title">How can I help you today${escapeHtml(patientNameGreeting)}?</h3>
        <p class="medicares-ai-welcome-desc">
          I'm your Medicares healthcare assistant. Ask about doctor availability, schedule appointments, or explore clinic services.
        </p>
        <div class="medicares-ai-quick-actions">
          <button type="button" class="medicares-ai-quick-btn" data-query="I want a dental appointment">
            <span class="medicares-ai-quick-btn-icon">${ICONS.calendar}</span>
            <span>Book a dental appointment</span>
          </button>
          <button type="button" class="medicares-ai-quick-btn" data-query="Hello, can you help me find a doctor for a general checkup?">
            <span class="medicares-ai-quick-btn-icon">${ICONS.doctor}</span>
            <span>Find a doctor for a general checkup</span>
          </button>
          <button type="button" class="medicares-ai-quick-btn" data-query="naku dental appointment kavali">
            <span class="medicares-ai-quick-btn-icon">${ICONS.hospital}</span>
            <span>Dental care in Tirupathi (Telugu)</span>
          </button>
          <button type="button" class="medicares-ai-quick-btn" data-query="What healthcare services and specialist departments are available?">
            <span class="medicares-ai-quick-btn-icon">${ICONS.sparkleSmall}</span>
            <span>Explore specialist clinic departments</span>
          </button>
        </div>
      `;

      welcome.querySelectorAll('.medicares-ai-quick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const query = btn.getAttribute('data-query');
          if (query) handleSendMessage(query);
        });
      });

      dom.body.appendChild(welcome);
      return;
    }

    // Render messages
    messages.forEach((msg) => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `medicares-ai-message ${msg.role}`;

      if (msg.role === 'assistant') {
        msgDiv.innerHTML = `
          <div class="medicares-ai-msg-avatar" aria-hidden="true">${ICONS.sparkleSmall}</div>
          <div class="medicares-ai-bubble">
            <div>${renderFormattedMessage(msg.content)}</div>
            <div class="medicares-ai-msg-time">${formatTime(msg.createdAt)}</div>
          </div>
        `;
      } else {
        msgDiv.innerHTML = `
          <div class="medicares-ai-bubble">
            <div>${renderFormattedMessage(msg.content)}</div>
            <div class="medicares-ai-msg-time">${formatTime(msg.createdAt)}</div>
          </div>
        `;
      }

      dom.body.appendChild(msgDiv);
    });

    // Loading indicator
    if (isLoading) {
      const typingDiv = document.createElement('div');
      typingDiv.className = 'medicares-ai-message assistant';
      typingDiv.innerHTML = `
        <div class="medicares-ai-msg-avatar" aria-hidden="true">${ICONS.sparkleSmall}</div>
        <div class="medicares-ai-typing" aria-label="Medicares AI is typing">
          <div class="medicares-ai-dot"></div>
          <div class="medicares-ai-dot"></div>
          <div class="medicares-ai-dot"></div>
        </div>
      `;
      dom.body.appendChild(typingDiv);
    }

    // Error message with retry
    if (lastFailedMessage && !isLoading) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'medicares-ai-error';
      const userErrText = lastFailedMessage.errorText || "Sorry, I couldn't connect to Medicares AI right now. Please try again.";
      errorDiv.innerHTML = `
        <div class="medicares-ai-error-text">
          ${ICONS.alert}
          <span>${escapeHtml(userErrText)}</span>
        </div>
        <button type="button" class="medicares-ai-retry-btn" id="medicares-ai-retry">Retry message</button>
      `;

      const retryBtn = errorDiv.querySelector('#medicares-ai-retry');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          const retryText = lastFailedMessage.text || lastFailedMessage;
          lastFailedMessage = null;
          handleSendMessage(retryText);
        });
      }

      dom.body.appendChild(errorDiv);
    }

    scrollToBottom();
  }

  function scrollToBottom() {
    if (!dom.body) return;
    requestAnimationFrame(() => {
      dom.body.scrollTop = dom.body.scrollHeight;
    });
  }

  function adjustTextareaHeight() {
    if (!dom.textarea) return;
    dom.textarea.style.height = 'auto';
    const newHeight = Math.min(dom.textarea.scrollHeight, 120);
    dom.textarea.style.height = `${newHeight}px`;
  }

  function updateSendButtonState() {
    if (!dom.sendBtn || !dom.textarea) return;
    const canSend = Boolean(dom.textarea.value.trim()) && !isLoading;
    dom.sendBtn.disabled = !canSend;
  }

  // ==========================================
  // CHAT ACTIONS
  // ==========================================
  async function handleSendMessage(rawText) {
    const text = (rawText || (dom.textarea && dom.textarea.value) || '').trim();
    if (!text || isLoading) return;

    if (dom.textarea) {
      dom.textarea.value = '';
      adjustTextareaHeight();
      updateSendButtonState();
    }

    if (isListening && recognition) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      isListening = false;
      updateVoiceUI();
    }

    // Append user message
    messages.push({
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    });

    isLoading = true;
    lastFailedMessage = null;
    renderUI();

    try {
      const assistantReply = await postChatMessage(text);

      messages.push({
        role: 'assistant',
        content: assistantReply,
        createdAt: new Date().toISOString(),
      });

      saveStoredMessages();
    } catch (err) {
      lastFailedMessage = {
        text,
        errorText: err.message || 'Request failed.',
      };
    } finally {
      isLoading = false;
      activeAbortController = null;
      renderUI();
      updateSendButtonState();
    }
  }

  function clearChat() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    messages = [];
    previousResponseId = null;
    lastFailedMessage = null;
    isLoading = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    renderUI();
  }

  function openDrawer() {
    isOpen = true;
    if (dom.drawer) dom.drawer.classList.add('is-open');
    if (dom.triggerBtn) {
      dom.triggerBtn.setAttribute('aria-expanded', 'true');
      dom.triggerBtn.setAttribute('title', 'Close AI Assistant');
    }
    renderUI();
    setTimeout(() => {
      if (dom.textarea) dom.textarea.focus();
    }, 150);
  }

  function closeDrawer() {
    isOpen = false;
    if (dom.drawer) dom.drawer.classList.remove('is-open');
    if (dom.triggerBtn) {
      dom.triggerBtn.setAttribute('aria-expanded', 'false');
      dom.triggerBtn.setAttribute('title', 'Open AI Assistant');
    }
    if (isListening && recognition) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      isListening = false;
      updateVoiceUI();
    }
  }

  function toggleDrawer() {
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  // ==========================================
  // COMPONENT MOUNTING
  // ==========================================
  function mount() {
    if (document.getElementById('medicares-ai-root')) return;

    loadStoredMessages();

    const root = document.createElement('div');
    root.id = 'medicares-ai-root';
    root.innerHTML = `
      <!-- Floating AI Button -->
      <button
        type="button"
        id="medicares-ai-trigger"
        class="medicares-ai-trigger"
        aria-label="Open Medicares AI assistant"
        aria-expanded="false"
        aria-controls="medicares-ai-drawer"
        title="Open AI Assistant"
      >
        <span class="medicares-ai-trigger-icon" aria-hidden="true">${ICONS.sparkle}</span>
        <span class="medicares-ai-trigger-pulse" aria-hidden="true"></span>
      </button>

      <!-- Right-Side AI Assistant Drawer -->
      <div
        id="medicares-ai-drawer"
        class="medicares-ai-drawer"
        role="region"
        aria-label="Medicares AI Assistant"
        aria-hidden="true"
      >
        <!-- Header -->
        <div class="medicares-ai-header">
          <div class="medicares-ai-header-brand">
            <div class="medicares-ai-avatar" aria-hidden="true">${ICONS.sparkleSmall}</div>
            <div class="medicares-ai-title-wrap">
              <div class="medicares-ai-title">
                Medicares AI
                <span class="medicares-ai-badge">Live</span>
              </div>
              <div class="medicares-ai-subtitle">Your healthcare assistant</div>
            </div>
          </div>
          <div class="medicares-ai-header-actions">
            <button
              type="button"
              id="medicares-ai-clear-btn"
              class="medicares-ai-btn-icon"
              aria-label="Clear chat conversation"
              title="Clear conversation"
            >
              ${ICONS.trash}
            </button>
            <button
              type="button"
              id="medicares-ai-close-btn"
              class="medicares-ai-btn-icon"
              aria-label="Close AI assistant"
              title="Close assistant"
            >
              ${ICONS.close}
            </button>
          </div>
        </div>

        <!-- Chat Body -->
        <div id="medicares-ai-body" class="medicares-ai-body" role="log" aria-live="polite"></div>

        <!-- Voice Status Banner -->
        <div id="medicares-ai-voice-banner" class="medicares-ai-voice-status">
          <span class="medicares-ai-mic-pulse"></span>
          <span>Listening to your voice... Speak now</span>
        </div>

        <!-- Footer / Input Area -->
        <div class="medicares-ai-footer">
          <form id="medicares-ai-form" class="medicares-ai-input-form" action="#">
            <textarea
              id="medicares-ai-textarea"
              class="medicares-ai-textarea"
              placeholder="Ask Medicares AI..."
              rows="1"
              aria-label="Ask Medicares AI message input"
            ></textarea>
            <button
              type="button"
              id="medicares-ai-mic-btn"
              class="medicares-ai-btn-mic"
              aria-label="Voice input with microphone"
              title="Voice input"
            >
              ${ICONS.mic}
            </button>
            <button
              type="submit"
              id="medicares-ai-send-btn"
              class="medicares-ai-btn-send"
              aria-label="Send message to Medicares AI"
              title="Send message"
              disabled
            >
              ${ICONS.send}
            </button>
          </form>
          <div class="medicares-ai-footer-hint">
            <span>Enter to send, Shift + Enter for new line</span>
            <span>Secured via Azure APIM</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    // Cache elements
    dom.triggerBtn = document.getElementById('medicares-ai-trigger');
    dom.drawer = document.getElementById('medicares-ai-drawer');
    dom.body = document.getElementById('medicares-ai-body');
    dom.form = document.getElementById('medicares-ai-form');
    dom.textarea = document.getElementById('medicares-ai-textarea');
    dom.sendBtn = document.getElementById('medicares-ai-send-btn');
    dom.micBtn = document.getElementById('medicares-ai-mic-btn');
    dom.voiceBanner = document.getElementById('medicares-ai-voice-banner');
    dom.closeBtn = document.getElementById('medicares-ai-close-btn');
    dom.clearBtn = document.getElementById('medicares-ai-clear-btn');

    // Event bindings
    dom.triggerBtn.addEventListener('click', toggleDrawer);
    dom.closeBtn.addEventListener('click', closeDrawer);
    dom.clearBtn.addEventListener('click', () => {
      if (confirm('Clear current Medicares AI chat history?')) {
        clearChat();
      }
    });

    dom.micBtn.addEventListener('click', toggleVoiceInput);

    dom.textarea.addEventListener('input', () => {
      adjustTextareaHeight();
      updateSendButtonState();
    });

    dom.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    dom.form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSendMessage();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeDrawer();
      }
    });

    // Initial render
    renderUI();
  }

  // Global API Exposure
  window.MedicaresAI = {
    init: mount,
    open: openDrawer,
    close: closeDrawer,
    toggle: toggleDrawer,
    sendMessage: handleSendMessage,
    clearChat: clearChat,
    getPreviousResponseId: () => previousResponseId,
    getPatientContext: getAuthenticatedPatientContext,
  };

  // Auto-init on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
