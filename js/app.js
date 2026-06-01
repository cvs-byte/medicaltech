document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem(MedicaresAPI.STORAGE_KEYS.theme) || 'light';
  root.dataset.theme = savedTheme;

  const toastStack = ensureToastStack();
  const body = document.body;

  function ensureToastStack() {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function notify(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <strong>${title}</strong>
      <div>${message}</div>
    `;
    toast.style.borderLeft = `4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#2563eb'}`;
    toastStack.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  function setLoading(button, isLoading, loadingText = 'Loading...') {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = loadingText;
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || button.textContent;
    }
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem(MedicaresAPI.STORAGE_KEYS.theme, theme);
  }

  function bindThemeToggle() {
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
      button.addEventListener('click', () => {
        const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        button.setAttribute('aria-pressed', String(nextTheme === 'dark'));
        notify('Theme updated', `Switched to ${nextTheme} mode.`, 'success');
      });
    });
  }

  function bindMobileNav() {
    const toggle = document.querySelector('[data-mobile-menu]');
    const menu = document.querySelector('[data-nav-menu]');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    menu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function bindLogout() {
    document.querySelectorAll('[data-logout]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const currentRole = String(document.body?.dataset?.role || '').toLowerCase();
        const redirectTo = currentRole === 'doctor'
          ? 'doctor-login.html'
          : currentRole === 'admin'
            ? 'admin-login.html'
            : 'login.html';

        MedicaresAPI.clearAuthSession();
        notify('Signed out', 'Your Medicares session has been cleared.', 'success');
        window.setTimeout(() => {
          window.location.href = redirectTo;
        }, 650);
      });
    });
  }

  function animateCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        const target = Number(element.dataset.counter || 0);
        const duration = 900;
        const start = performance.now();
        const initial = 0;

        function step(now) {
          const progress = Math.min((now - start) / duration, 1);
          element.textContent = Math.round(initial + (target - initial) * progress).toLocaleString();
          if (progress < 1) window.requestAnimationFrame(step);
        }

        window.requestAnimationFrame(step);
        obs.unobserve(element);
      });
    }, { threshold: 0.5 });

    counters.forEach((counter) => observer.observe(counter));
  }

  function revealOnScroll() {
    const targets = document.querySelectorAll('[data-animate]');
    if (!targets.length) return;

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    targets.forEach((target) => observer.observe(target));
  }

  function updateYear() {
    document.querySelectorAll('[data-year]').forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function markActiveLinks() {
    const current = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('[data-nav-menu] a, .sidebar-nav a').forEach((link) => {
      const linkPath = link.getAttribute('href');
      if (linkPath && linkPath.endsWith(current)) {
        link.classList.add('active');
      }
    });
  }

  function bindDemoForms() {
    document.querySelectorAll('form[data-demo-form]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();

        const supportEmail = form.dataset.supportEmail || '';
        if (supportEmail) {
          const values = Object.fromEntries(new FormData(form).entries());
          const subject = encodeURIComponent('Medicares support request');
          const body = encodeURIComponent([
            `Name: ${values.name || ''}`,
            `Email: ${values.email || ''}`,
            '',
            values.message || ''
          ].join('\n'));

          window.location.href = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
          notify('Support request ready', `Your message is being sent to ${supportEmail}.`, 'success');
          form.reset();
          return;
        }

        const submitButton = form.querySelector('[type="submit"]');
        setLoading(submitButton, true, 'Sending...');

        window.setTimeout(() => {
          setLoading(submitButton, false);
          form.reset();
          const title = form.dataset.successTitle || 'Request submitted';
          const message = form.dataset.successMessage || 'We received your request and will be in touch soon.';
          notify(title, message, 'success');
        }, 700);
      });
    });
  }

  function bindQuickActions() {
    document.querySelectorAll('[data-toast]').forEach((button) => {
      button.addEventListener('click', () => {
        notify(button.dataset.toastTitle || 'Medicares', button.dataset.toast || 'Action completed.', button.dataset.toastType || 'info');
      });
    });
  }

  function bindSectionScroll() {
    document.querySelectorAll('[data-scroll-to]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = document.querySelector(button.dataset.scrollTo);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function getDisplayName(user) {
    const displayName = String(user?.fullName || user?.name || user?.displayName || '').trim();
    if (displayName) return displayName;

    const emailName = String(user?.email || '').split('@')[0].trim();
    if (emailName) return emailName;

    return 'User';
  }

  function renderAuthState() {
    const user = MedicaresAPI.getAuthUser();
    const token = MedicaresAPI.getAuthToken();
    const isAuthenticated = Boolean(token || user);
    const bookAppointmentLink = document.querySelector('[data-book-appointment]');

    document.querySelectorAll('[data-auth-guest]').forEach((element) => {
      element.hidden = isAuthenticated;
    });

    document.querySelectorAll('[data-auth-user]').forEach((element) => {
      element.hidden = !isAuthenticated;
    });

    document.querySelectorAll('[data-auth-name]').forEach((element) => {
      if (!isAuthenticated) {
        element.hidden = true;
        element.textContent = '';
        return;
      }

      element.hidden = false;
      element.textContent = getDisplayName(user);
    });

    if (bookAppointmentLink) {
      bookAppointmentLink.href = isAuthenticated ? 'dashboard.html' : 'login.html';
    }
  }

  window.MedicaresUI = {
    notify,
    setLoading,
    applyTheme,
    currentTheme: () => root.dataset.theme,
    getUser: MedicaresAPI.getAuthUser,
    getToken: MedicaresAPI.getAuthToken,
    setAuthSession: MedicaresAPI.setAuthSession,
    clearAuthSession: MedicaresAPI.clearAuthSession
  };

  bindThemeToggle();
  bindMobileNav();
  bindLogout();
  animateCounters();
  revealOnScroll();
  updateYear();
  markActiveLinks();
  bindDemoForms();
  bindQuickActions();
  bindSectionScroll();
  renderAuthState();

  const heroGreeting = document.querySelector('[data-user-greeting]');
  if (heroGreeting) {
    const user = MedicaresAPI.getAuthUser();
    heroGreeting.textContent = user ? `Welcome back, ${getDisplayName(user)}` : 'Welcome to Medicares';
  }
});
