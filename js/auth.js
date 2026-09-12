document.addEventListener('DOMContentLoaded', () => {
  const patientLoginForm = document.getElementById('patientLoginForm');
  const doctorLoginForm = document.getElementById('doctorLoginForm');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const registerForm = document.getElementById('patientRegisterForm');
  const rememberEmail = localStorage.getItem(MedicaresAPI.STORAGE_KEYS.remembers) || '';
  const registrationNoticeKey = 'medicares_registration_notice_seen';
  const dashboardByRole = {
    admin: 'admin-dashboard.html',
    doctor: 'doctor-dashboard.html',
    patient: 'patient-dashboard.html'
  };

  if (patientLoginForm) {
    // Support both old name="email" and new name="emailOrPhone" field
    const emailInput = patientLoginForm.querySelector('[name="emailOrPhone"], [name="email"]');
    if (emailInput && rememberEmail) {
      emailInput.value = rememberEmail;
    }

    bindPasswordToggles(patientLoginForm);
    patientLoginForm.addEventListener('submit', (event) => submitLogin(event, 'patient'));
    bindForgotPassword(patientLoginForm);
  }

  if (doctorLoginForm) {
    bindPasswordToggles(doctorLoginForm);
    doctorLoginForm.addEventListener('submit', (event) => submitLogin(event, 'doctor'));
  }

  if (adminLoginForm) {
    bindPasswordToggles(adminLoginForm);
    adminLoginForm.addEventListener('submit', (event) => submitLogin(event, 'admin'));
  }

  if (registerForm) {
    bindPasswordToggles(registerForm);
    registerForm.addEventListener('submit', submitRegister);
  }

  function bindPasswordToggles(form) {
    form.querySelectorAll('[data-toggle-password]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = form.querySelector(button.dataset.togglePassword);
        if (!target) return;
        target.type = target.type === 'password' ? 'text' : 'password';
        button.textContent = target.type === 'password' ? 'Show' : 'Hide';
      });
    });
  }

  function bindForgotPassword(form) {
    const trigger = form.querySelector('[data-forgot-password]');
    if (!trigger) return;
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      MedicaresUI.notify('Reset link ready', 'A password reset flow would be sent through api.medicares.me in production.', 'info');
    });
  }

  function resolveRole(...candidates) {
    return String(candidates.find((value) => String(value || '').trim()) || '').toLowerCase();
  }

  function dashboardRouteForRole(role) {
    return dashboardByRole[role] || dashboardByRole.patient;
  }

  async function safeReadJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function submitLogin(event, role) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');

    if (form.dataset.submitting === 'true') {
      return;
    }

    const payload = Object.fromEntries(new FormData(form).entries());

    // Detect whether the user entered an email or a phone number
    const emailOrPhone = String(payload.emailOrPhone || payload.email || '').trim();
    const isPhone = emailOrPhone && /^[+\d][\d\s\-().]{6,}$/.test(emailOrPhone);
    const loginPayload = {
      password: payload.password,
      ...(isPhone
        ? { phoneNumber: emailOrPhone, phone: emailOrPhone }
        : { email: emailOrPhone })
    };

    if (!emailOrPhone || !payload.password) {
      MedicaresUI.notify('Missing details', 'Enter your email or phone number and password.', 'error');
      return;
    }

    form.dataset.submitting = 'true';
    MedicaresUI.setLoading(submitButton, true, 'Signing in...');

    try {
      const baseUrl = window.API_URL || MedicaresAPI.API_BASE_URL;
      const loginPath = role === 'doctor'
        ? '/doctors/login'
        : role === 'admin'
          ? '/admin/login'
          : '/login';

      const response = await fetch(`${baseUrl}${loginPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(loginPayload)
      });

      const data = await safeReadJson(response);

      if (!response.ok || !data || data?.success === false) {
        throw new Error(data?.message || `Login failed with status ${response.status}.`);
      }

      const requestedRole = resolveRole(role, 'patient');
      const resolvedRole = requestedRole === 'patient'
        ? 'patient'
        : resolveRole(data?.user?.role, data?.role, requestedRole, 'patient');
      const token = data?.token || data?.accessToken || data?.access_token || data?.user?.token || '';
      const phoneVal = data?.user?.phoneNumber || data?.user?.phone || data?.user?.phone_number || data?.phoneNumber || data?.phone || data?.phone_number || '';
      // emailOrPhone holds what the user typed (email or phone)
      const typedIdentifier = String(payload.emailOrPhone || payload.email || '').trim();
      const session = {
        token,
        user: {
          ...data?.user,
          name: data?.user?.name || data?.user?.fullName || data?.name || data?.fullName || typedIdentifier,
          email: data?.user?.email || data?.email || (typedIdentifier.includes('@') ? typedIdentifier : ''),
          role: resolvedRole,
          userId: data?.user?.userId || data?.user?.id || data?.userId || data?.id || '',
          phoneNumber: phoneVal || (isPhone ? typedIdentifier : ''),
          phone: phoneVal || (isPhone ? typedIdentifier : '')
        }
      };

      if (!session.token) {
        throw new Error('Login succeeded but no token was returned by the API.');
      }

      MedicaresUI.setAuthSession(session.token, {
        ...session.user,
        role: resolvedRole
      });

      if (form.querySelector('[name="rememberMe"]')?.checked) {
        // Store the identifier (email or phone) for next-time prefill
        localStorage.setItem(MedicaresAPI.STORAGE_KEYS.remembers, typedIdentifier);
      } else {
        localStorage.removeItem(MedicaresAPI.STORAGE_KEYS.remembers);
      }

      const welcomeLabel = resolvedRole === 'admin'
        ? 'admin user'
        : resolvedRole === 'doctor'
          ? 'doctor user'
          : 'patient user';

      MedicaresUI.notify('Signed in', `Welcome back, ${welcomeLabel}.`, 'success');
      window.setTimeout(() => {
        window.location.href = dashboardRouteForRole(resolvedRole || requestedRole);
      }, 700);
    } catch (error) {
      MedicaresUI.notify('Login failed', error.message, 'error');
    } finally {
      form.dataset.submitting = 'false';
      MedicaresUI.setLoading(submitButton, false);
    }
  }

  // ── Registration form helpers ─────────────────────────────────────────────

  function setFieldStatus(statusEl, state, message) {
    if (!statusEl) return;
    statusEl.className = `field-check-status ${state}`;
    if (state === 'valid') {
      statusEl.innerHTML = `✓ ${message}`;
    } else if (state === 'invalid') {
      statusEl.innerHTML = `✗ ${message}`;
    } else if (state === 'taken') {
      statusEl.innerHTML = `✗ ${message}`;
    } else {
      statusEl.innerHTML = '';
    }
  }

  function showRegStatus(type, message) {
    const banner = document.getElementById('reg-status-banner');
    const iconEl = document.getElementById('reg-status-icon');
    const textEl = document.getElementById('reg-status-text');
    if (!banner) return;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    banner.className = `lp-login-status-banner lp-login-status-banner--${type} show`;
    if (iconEl) iconEl.textContent = icons[type] || 'ℹ️';
    if (textEl) textEl.textContent = message;
  }

  function hideRegStatus() {
    const banner = document.getElementById('reg-status-banner');
    if (banner) banner.classList.remove('show');
  }

  // Client-side format validation only on blur — NO API calls here
  const regEmailInput = document.getElementById('registerEmail');
  const regPhoneInput = document.getElementById('phone');

  if (regEmailInput) {
    regEmailInput.addEventListener('input', () => {
      setFieldStatus(document.getElementById('email-check-status'), '', '');
    });
    regEmailInput.addEventListener('blur', () => {
      const val = regEmailInput.value.trim();
      const emailStatusEl = document.getElementById('email-check-status');
      if (!val) {
        setFieldStatus(emailStatusEl, '', '');
        return;
      }
      const validFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      if (validFormat) {
        setFieldStatus(emailStatusEl, 'valid', 'Valid email format');
      } else {
        setFieldStatus(emailStatusEl, 'invalid', 'Enter a valid email address');
      }
    });
  }

  if (regPhoneInput) {
    regPhoneInput.addEventListener('input', () => {
      setFieldStatus(document.getElementById('phone-check-status'), '', '');
    });
    regPhoneInput.addEventListener('blur', () => {
      const val = regPhoneInput.value.trim().replace(/\s/g, '');
      const phoneStatusEl = document.getElementById('phone-check-status');
      if (!val) {
        setFieldStatus(phoneStatusEl, '', '');
        return;
      }
      const validFormat = /^[+\d][\d\-().]{7,}$/.test(val) && val.replace(/\D/g, '').length >= 10;
      if (validFormat) {
        setFieldStatus(phoneStatusEl, 'valid', 'Valid phone number format');
      } else {
        setFieldStatus(phoneStatusEl, 'invalid', 'Enter a valid phone number (min 10 digits)');
      }
    });
  }

  // ── Registration submit — the ONLY place data goes to the API ─────────────
  async function submitRegister(event) {
    event.preventDefault();
    hideRegStatus();
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');

    if (form.dataset.submitting === 'true') {
      return;
    }

    const payload = Object.fromEntries(new FormData(form).entries());
    const registerPayload = {
      fullName: payload.fullName,
      email: payload.email,
      phoneNumber: payload.phoneNumber || payload.phone || '',
      gender: payload.gender || '',
      dateOfBirth: payload.dateOfBirth || payload.dob || '',
      role: 'patient',
      password: payload.password,
      confirmPassword: payload.confirmPassword
    };

    // ── Client-side validation only ──
    if (!registerPayload.fullName || !registerPayload.email || !registerPayload.phoneNumber || !registerPayload.gender || !registerPayload.dateOfBirth || !registerPayload.password || !registerPayload.confirmPassword) {
      showRegStatus('error', 'Please complete all required fields before submitting.');
      MedicaresUI.notify('Missing details', 'Complete all required fields.', 'error');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerPayload.email)) {
      showRegStatus('error', 'Please enter a valid email address.');
      setFieldStatus(document.getElementById('email-check-status'), 'invalid', 'Enter a valid email address');
      MedicaresUI.notify('Invalid email', 'Please enter a valid email address.', 'error');
      return;
    }

    if (registerPayload.password !== registerPayload.confirmPassword) {
      showRegStatus('error', 'Passwords do not match. Please re-enter them.');
      MedicaresUI.notify('Password mismatch', 'Passwords must match before creating an account.', 'error');
      return;
    }

    if (!localStorage.getItem(registrationNoticeKey)) {
      MedicaresUI.notify(
        'Registration in progress',
        'Your first signup may take a moment while we create your account. Please wait for the response.',
        'info'
      );
      localStorage.setItem(registrationNoticeKey, 'true');
    }

    form.dataset.submitting = 'true';
    MedicaresUI.setLoading(submitButton, true, 'Creating account...');

    try {
      const response = await fetch(`${window.API_URL || MedicaresAPI.API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerPayload)
      });

      const result = await safeReadJson(response);

      if (!response.ok || !result || result?.success === false) {
        const errMsg = String(result?.message || '').toLowerCase();

        // ── Detect which field caused the duplicate error ──
        const isDupe = (kw) =>
          errMsg.includes('already') || errMsg.includes('duplicate') ||
          errMsg.includes('exist') || errMsg.includes('taken') ||
          errMsg.includes('registered') || errMsg.includes('in use') || errMsg.includes(kw);

        if ((errMsg.includes('email') && isDupe('email')) ||
            response.status === 409 && errMsg.includes('email')) {
          setFieldStatus(document.getElementById('email-check-status'), 'taken', 'Email is already registered');
          showRegStatus('error', 'This email address is already registered. Please log in or use a different email.');
          MedicaresUI.notify('Email already registered', 'That email is already in use. Try logging in instead.', 'error');
          return;
        }

        if ((errMsg.includes('phone') && isDupe('phone')) ||
            response.status === 409 && errMsg.includes('phone')) {
          setFieldStatus(document.getElementById('phone-check-status'), 'taken', 'Phone number is already registered');
          showRegStatus('error', 'This phone number is already registered. Please log in or use a different number.');
          MedicaresUI.notify('Phone already registered', 'That phone number is already in use. Try logging in instead.', 'error');
          return;
        }

        // Generic 409 without field details
        if (response.status === 409) {
          showRegStatus('error', 'An account with these details already exists. Please log in or use different credentials.');
          MedicaresUI.notify('Already registered', 'Account already exists. Try logging in.', 'error');
          return;
        }

        throw new Error(result?.message || `Registration failed with status ${response.status}.`);
      }

      const resolvedRole = resolveRole(result?.user?.role, result?.role, 'patient');
      const token = result?.token || result?.accessToken || result?.access_token || result?.user?.token || '';

      const phoneVal = result?.user?.phoneNumber || result?.user?.phone || result?.user?.phone_number
        || result?.phoneNumber || result?.phone || result?.phone_number
        || payload.phone || payload.phoneNumber || '';

      const session = {
        token,
        user: {
          ...result?.user,
          name: result?.user?.name || result?.user?.fullName || result?.name || result?.fullName || payload.fullName,
          email: result?.user?.email || result?.email || payload.email,
          role: resolvedRole,
          userId: result?.user?.userId || result?.user?.id || result?.userId || result?.id || '',
          phoneNumber: phoneVal,
          phone: phoneVal
        }
      };

      MedicaresUI.setAuthSession(session.token, session.user);
      showRegStatus('success', 'Account created successfully! Redirecting to your dashboard…');
      MedicaresUI.notify('Account created', 'Your profile is ready.', 'success');
      window.setTimeout(() => {
        window.location.href = dashboardRouteForRole(resolvedRole);
      }, 700);
    } catch (error) {
      showRegStatus('error', error.message || 'Registration failed. Please try again.');
      MedicaresUI.notify('Registration failed', error.message, 'error');
    } finally {
      form.dataset.submitting = 'false';
      MedicaresUI.setLoading(submitButton, false);
    }
  }
});
