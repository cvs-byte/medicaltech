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
    const emailInput = patientLoginForm.querySelector('[name="email"]');
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

    if (!payload.email || !payload.password) {
      MedicaresUI.notify('Missing details', 'Enter both email and password.', 'error');
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
        body: JSON.stringify(payload)
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
      const session = {
        token,
        user: {
          ...data?.user,
          name: data?.user?.name || data?.user?.fullName || data?.name || data?.fullName || payload.email,
          email: data?.user?.email || data?.email || payload.email,
          role: resolvedRole,
          userId: data?.user?.userId || data?.user?.id || data?.userId || data?.id || '',
          phoneNumber: phoneVal,
          phone: phoneVal
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
        localStorage.setItem(MedicaresAPI.STORAGE_KEYS.remembers, payload.email);
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

  async function submitRegister(event) {
    event.preventDefault();
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

    if (!registerPayload.fullName || !registerPayload.email || !registerPayload.phoneNumber || !registerPayload.gender || !registerPayload.dateOfBirth || !registerPayload.password || !registerPayload.confirmPassword) {
      MedicaresUI.notify('Missing details', 'Complete all required fields.', 'error');
      return;
    }

    if (registerPayload.password !== registerPayload.confirmPassword) {
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(registerPayload)
      });

      const result = await safeReadJson(response);

      if (!response.ok || !result || result?.success === false) {
        throw new Error(result?.message || `Registration failed with status ${response.status}.`);
      }

      const resolvedRole = resolveRole(result?.user?.role, result?.role, 'patient');
      const token = result?.token || result?.accessToken || result?.access_token || result?.user?.token || '';

      const phoneVal = result?.user?.phoneNumber || result?.user?.phone || result?.user?.phone_number || result?.phoneNumber || result?.phone || result?.phone_number || payload.phone || payload.phoneNumber || '';
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
      MedicaresUI.notify('Account created', 'Your profile is ready.', 'success');
      window.setTimeout(() => {
        window.location.href = dashboardRouteForRole(resolvedRole);
      }, 700);
    } catch (error) {
      MedicaresUI.notify('Registration failed', error.message, 'error');
    } finally {
      form.dataset.submitting = 'false';
      MedicaresUI.setLoading(submitButton, false);
    }
  }
});
