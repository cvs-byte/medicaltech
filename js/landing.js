/* Medicares.me Premium Landing Page Interactive Logic */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Sticky Navigation Scroll Effect
  const navbar = document.querySelector('.navbar-lp');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 40) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  // 2. Mobile Drawer Navigation Toggle
  const mobileToggle = document.querySelector('.mobile-nav-toggle');
  const drawer = document.querySelector('.mobile-nav-drawer');
  const drawerClose = document.querySelector('.mobile-drawer-close');

  if (mobileToggle && drawer) {
    mobileToggle.addEventListener('click', () => {
      drawer.classList.add('open');
      mobileToggle.setAttribute('aria-expanded', 'true');
    });
  }

  if (drawerClose && drawer) {
    drawerClose.addEventListener('click', () => {
      drawer.classList.remove('open');
      if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    });
  }

  // Close drawer when clicking a link
  const drawerLinks = document.querySelectorAll('.mobile-nav-link');
  drawerLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (drawer) drawer.classList.remove('open');
      if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // 3. Scroll Reveal Observer
  const revealElements = document.querySelectorAll('.lp-reveal');
  if (revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          // Once it's animated, we don't need to track it anymore
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));
  }

  // 4. Interactive Tabs / Dashboard Switcher
  const tabs = document.querySelectorAll('.lp-switcher-tab');
  const visualContainer = document.querySelector('.lp-switcher-visual');
  const infoTitle = document.querySelector('.lp-switcher-info h3');
  const infoDesc = document.querySelector('.lp-switcher-info p');
  const checklist = document.querySelector('.lp-switcher-checklist');

  const tabData = {
    patients: {
      title: "Everything Patients Need for a Calm Booking Experience",
      desc: "Manage appointments, track medications, and download prescriptions. Our patient dashboard keeps your medical history organized, secure, and always accessible.",
      checks: [
        "Manage upcoming and past appointments",
        "Download digital prescriptions & receipt copies",
        "Track pill intake with smart medicine reminders",
        "Secure profile encrypted using JWT standards",
        "Receive real-time notifications for slot changes"
      ],
      panelHTML: `
        <div class="panel-topline">
          <div class="panel-title">Patient Portal</div>
          <div class="panel-badge">Active Session</div>
        </div>
        <div class="panel-row">
          <div class="panel-row-left">
            <div class="panel-avatar">SK</div>
            <div class="panel-details">
              <div class="panel-name">Siddharth Kapoor</div>
              <div class="panel-subname">Patient ID: #MC-9402</div>
            </div>
          </div>
          <a class="lp-btn lp-btn-outline panel-action-btn" href="appointments.html">New Booking</a>
        </div>
        <div class="panel-row">
          <div class="panel-row-left">
            <div class="panel-avatar accent">DR</div>
            <div class="panel-details">
              <div class="panel-name">Dr. Ananya Rao (Cardiologist)</div>
              <div class="panel-subname">Tomorrow at 10:00 AM • Confirmed</div>
            </div>
          </div>
          <span class="panel-badge" style="background: rgba(37,99,235,0.1); color: var(--lp-primary);">View Details</span>
        </div>
        <div class="panel-row" style="opacity: 0.85;">
          <div class="panel-row-left">
            <div class="panel-avatar" style="background:#64748b;">RX</div>
            <div class="panel-details">
              <div class="panel-name">Amlodipine 5mg Prescription</div>
              <div class="panel-subname">Issued by Dr. Rao • 12 July 2026</div>
            </div>
          </div>
          <span class="panel-badge" style="background: rgba(148,163,184,0.15); color: var(--lp-muted);">Download</span>
        </div>
      `
    },
    doctors: {
      title: "Empower Doctors with Intelligent Practice Tools",
      desc: "Coordinate appointments, manage patient consultations, and draft electronic prescriptions in real-time. Built to optimize clinic capacity and reduce paper administration.",
      checks: [
        "Track today's appointment queue with check-in status",
        "Configure custom slot availability & hospital sessions",
        "Quick-write digital prescriptions linked to inventory",
        "Access patients' history with strict privacy controls",
        "Review practice analytics & monthly trends directly"
      ],
      panelHTML: `
        <div class="panel-topline">
          <div class="panel-title">Doctor Workspace</div>
          <div class="panel-badge" style="background: rgba(20,184,166,0.1); color: var(--lp-accent);">Consultation Mode</div>
        </div>
        <div class="panel-row">
          <div class="panel-row-left">
            <div class="panel-avatar" style="background: var(--lp-accent);">DR</div>
            <div class="panel-details">
              <div class="panel-name">Dr. Ananya Rao</div>
              <div class="panel-subname">Cardiology Clinic Room 4A</div>
            </div>
          </div>
          <span class="panel-badge">On Duty</span>
        </div>
        <div class="panel-row">
          <div class="panel-row-left">
            <div class="panel-avatar">KP</div>
            <div class="panel-details">
              <div class="panel-name">Karan Patel</div>
              <div class="panel-subname">Waiting Queue • Token #04 • 10:15 AM</div>
            </div>
          </div>
          <button class="lp-btn lp-btn-primary panel-action-btn" style="padding: 0.35rem 0.6rem; font-size: 0.7rem;">Call Patient</button>
        </div>
        <div class="panel-row">
          <div class="panel-row-left">
            <div class="panel-avatar" style="background: #f59e0b;">MA</div>
            <div class="panel-details">
              <div class="panel-name">Meera Aiyar</div>
              <div class="panel-subname">Next • Token #05 • 10:30 AM</div>
            </div>
          </div>
          <span class="panel-badge" style="background: rgba(245,158,11,0.1); color: var(--lp-warning);">In Line</span>
        </div>
      `
    },
    hospitals: {
      title: "Enterprise Clinic & Hospital Operations Control",
      desc: "Manage roster schedules, doctor allocations, reception check-ins, and multi-department analytics. Designed for hospital administration requiring robust scaling and compliance.",
      checks: [
        "Assign and coordinate staff lists & roster schedules",
        "Track occupancy rate and room statuses in real-time",
        "Oversee OPD, pharmacy, and laboratory billing paths",
        "Export detailed staff, revenue, and clinical reports",
        "GST-ready invoicing and batch billing integrations"
      ],
      panelHTML: `
        <div class="panel-topline">
          <div class="panel-title">Hospital Administrator</div>
          <div class="panel-badge" style="background: rgba(15,23,42,0.1); color: var(--lp-secondary);">Admin Center</div>
        </div>
        <div class="panel-row" style="background: rgba(37,99,235,0.03);">
          <div class="panel-row-left">
            <div class="panel-avatar" style="background: var(--lp-primary); width:28px; height:28px; font-size:0.75rem;">H</div>
            <div class="panel-name" style="font-size:0.85rem;">City Heart Hospital & Research Centre</div>
          </div>
          <span class="panel-badge" style="background: var(--lp-success); color: white;">All Systems Nominal</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-top:0.25rem;">
          <div class="panel-row" style="flex-direction:column; align-items:flex-start; gap:0.25rem; padding:0.6rem;">
            <span style="font-size:0.7rem; color:var(--lp-muted); font-weight:700;">ACTIVE DOCTORS</span>
            <span style="font-size:1.2rem; font-weight:800; font-family:var(--lp-font-manrope); color:var(--lp-text);">32 / 38</span>
          </div>
          <div class="panel-row" style="flex-direction:column; align-items:flex-start; gap:0.25rem; padding:0.6rem;">
            <span style="font-size:0.7rem; color:var(--lp-muted); font-weight:700;">DAILY APPOINTMENTS</span>
            <span style="font-size:1.2rem; font-weight:800; font-family:var(--lp-font-manrope); color:var(--lp-text);">184</span>
          </div>
        </div>
        <div class="panel-row">
          <div class="panel-row-left">
            <div class="panel-avatar accent">RD</div>
            <div class="panel-details">
              <div class="panel-name">Dr. Rajesh Deshmukh</div>
              <div class="panel-subname">On-call • Pediatrics Room 102</div>
            </div>
          </div>
          <span class="panel-badge" style="background: rgba(20,184,166,0.1); color: var(--lp-accent);">Assign OPD</span>
        </div>
      `
    }
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const persona = tab.dataset.tab;
      if (!persona || !tabData[persona]) return;

      // Update active tab button
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update content info
      const data = tabData[persona];
      infoTitle.textContent = data.title;
      infoDesc.textContent = data.desc;

      // Update checklist
      checklist.innerHTML = '';
      data.checks.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>${item}</span>
        `;
        checklist.appendChild(li);
      });

      // Update visual container
      visualContainer.innerHTML = data.panelHTML;

      // Smooth fade-in interaction
      visualContainer.style.opacity = '0';
      visualContainer.style.transform = 'translateY(10px)';
      setTimeout(() => {
        visualContainer.style.opacity = '1';
        visualContainer.style.transform = 'translateY(0)';
      }, 50);
    });
  });

  // 5. FAQ Accordion Logic
  const faqItems = document.querySelectorAll('.lp-faq-item');
  faqItems.forEach(item => {
    const trigger = item.querySelector('.lp-faq-trigger');
    if (trigger) {
      trigger.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');

        // Close all other FAQs
        faqItems.forEach(otherItem => {
          if (otherItem !== item) {
            otherItem.classList.remove('open');
            const otherContent = otherItem.querySelector('.lp-faq-content');
            if (otherContent) otherContent.style.maxHeight = null;
          }
        });

        // Toggle current FAQ
        item.classList.toggle('open');
        const content = item.querySelector('.lp-faq-content');
        if (content) {
          if (isOpen) {
            content.style.maxHeight = null;
          } else {
            content.style.maxHeight = content.scrollHeight + "px";
          }
        }
      });
    }
  });

  // 6. Search Card Form Handling
  const searchForm = document.getElementById('lp-search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const doctorInput = document.getElementById('lp-search-doctor').value.trim();
      const hospitalInput = document.getElementById('lp-search-hospital').value.trim();
      const specialtyInput = document.getElementById('lp-search-specialty').value.trim();
      const dateInput = document.getElementById('lp-search-date').value;

      // Build redirect URL to appointments.html with params
      const params = new URLSearchParams();
      if (doctorInput) params.append('doctor', doctorInput);
      if (hospitalInput) params.append('hospital', hospitalInput);
      if (specialtyInput) params.append('specialty', specialtyInput);
      if (dateInput) params.append('date', dateInput);

      // Open landing page notification
      if (window.MedicaresUI && window.MedicaresUI.notify) {
        window.MedicaresUI.notify(
          'Searching Medicares',
          'Redirecting to appointments database...',
          'success'
        );
      }

      setTimeout(() => {
        window.location.href = `appointments.html?${params.toString()}`;
      }, 500);
    });
  }

  // 7. Testimonial Rating Star Generators
  const ratingContainers = document.querySelectorAll('.lp-stars');
  ratingContainers.forEach(container => {
    const rating = parseInt(container.dataset.rating || 5);
    container.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      container.innerHTML += i < rating ? '★' : '☆';
    }
  });

  // 8. Homepage Dynamic Booking Widget Logic
  // CAPTCHA helper functions
  function generateCaptchaText(length = 5) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars like O, 0, I, 1
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function setCaptcha(codeEl, inputEl) {
    if (!codeEl) return;
    const text = generateCaptchaText();
    codeEl.textContent = text.split('').join(' ');
    codeEl.dataset.code = text;
    if (inputEl) inputEl.value = '';
  }

  function verifyCaptcha(codeEl, inputEl) {
    if (!codeEl || !inputEl) return false;
    const actualCode = codeEl.dataset.code || '';
    const enteredCode = inputEl.value.trim().toUpperCase();
    return actualCode === enteredCode;
  }

  // A. Patient Login Modal Actions
  const loginModal = document.getElementById('lp-login-modal');
  const homeLoginForm = document.getElementById('lp-home-login-form');
  const loginCaptchaCode = document.getElementById('lp-login-captcha-code');
  const loginCaptchaInput = document.getElementById('lp-login-captcha-input');
  const loginCaptchaRefresh = document.getElementById('lp-login-captcha-refresh');

  function openLoginModal() {
    if (!loginModal) return;
    loginModal.style.display = 'flex';
    if (loginCaptchaCode) setCaptcha(loginCaptchaCode, loginCaptchaInput);
  }

  function closeLoginModal() {
    if (loginModal) loginModal.style.display = 'none';
  }

  // Bind login modal triggers
  document.querySelectorAll('.lp-trigger-login').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openLoginModal();
    });
  });

  const modalCloseBtn = document.querySelector('.lp-login-modal-close');
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeLoginModal);
  }
  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) closeLoginModal();
    });
  }

  if (loginCaptchaRefresh && loginCaptchaCode) {
    loginCaptchaRefresh.addEventListener('click', () => setCaptcha(loginCaptchaCode, loginCaptchaInput));
  }

  // Helper: show an inline status banner inside the login modal
  function showLoginStatus(type, message) {
    const banner = document.getElementById('lp-login-status-banner');
    const iconEl = document.getElementById('lp-login-status-icon');
    const textEl = document.getElementById('lp-login-status-text');
    if (!banner) return;

    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    banner.className = `lp-login-status-banner lp-login-status-banner--${type} show`;
    if (iconEl) iconEl.textContent = icons[type] || 'ℹ️';
    if (textEl) textEl.textContent = message;

    // Auto-hide after 6s for non-errors
    if (type !== 'error') {
      clearTimeout(banner._hideTimer);
      banner._hideTimer = setTimeout(() => {
        banner.classList.remove('show');
      }, 6000);
    }
  }

  function hideLoginStatus() {
    const banner = document.getElementById('lp-login-status-banner');
    if (banner) banner.classList.remove('show');
  }

  if (homeLoginForm) {
    homeLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideLoginStatus();

      // Check CAPTCHA
      if (!verifyCaptcha(loginCaptchaCode, loginCaptchaInput)) {
        showLoginStatus('error', 'Incorrect security code — please try again.');
        if (window.MedicaresUI) MedicaresUI.notify('Verification Failed', 'Incorrect CAPTCHA security code. Please try again.', 'error');
        setCaptcha(loginCaptchaCode, loginCaptchaInput);
        return;
      }

      const emailOrPhone = document.getElementById('lp-login-email').value.trim();
      const password = document.getElementById('lp-login-password').value;
      const rememberMe = homeLoginForm.querySelector('[name="rememberMe"]')?.checked;
      const submitBtn = document.getElementById('lp-login-submit-btn');

      // Detect email vs phone number
      const isPhone = emailOrPhone && /^[+\d][\d\s\-().]{6,}$/.test(emailOrPhone);
      const loginPayload = {
        password,
        ...(isPhone
          ? { phoneNumber: emailOrPhone, phone: emailOrPhone }
          : { email: emailOrPhone })
      };

      if (!emailOrPhone || !password) {
        showLoginStatus('error', 'Please fill in your email or phone number and password.');
        if (window.MedicaresUI) MedicaresUI.notify('Validation Error', 'Please fill in all fields.', 'error');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
      }

      try {
        const baseUrl = window.API_URL || 'https://api.medicares.me';
        const response = await fetch(`${baseUrl}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginPayload)
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.message || 'Invalid email or password. Please try again.');
        }

        const data = await response.json();
        const token = data?.token || data?.accessToken || '';

        if (!token) {
          throw new Error('API did not return a valid auth token.');
        }

        const phoneVal = data?.user?.phoneNumber || data?.user?.phone || data?.user?.phone_number || data?.phoneNumber || data?.phone || ''
          || (isPhone ? emailOrPhone : '');
        const genderVal = data?.user?.gender || data?.gender || '';
        const dobVal = data?.user?.dateOfBirth || data?.user?.dob || data?.dateOfBirth || data?.dob || '';
        const resolvedEmail = data?.user?.email || data?.email || (emailOrPhone.includes('@') ? emailOrPhone : '');
        const user = {
          fullName: data?.user?.fullName || data?.user?.name || data?.fullName || emailOrPhone,
          name: data?.user?.fullName || data?.user?.name || data?.fullName || emailOrPhone,
          email: resolvedEmail,
          role: data?.user?.role || 'patient',
          userId: data?.user?.id || data?.user?.userId || '',
          phoneNumber: phoneVal || (isPhone ? emailOrPhone : ''),
          phone: phoneVal || (isPhone ? emailOrPhone : ''),
          gender: genderVal,
          dateOfBirth: dobVal
        };

        if (window.MedicaresAPI) {
          MedicaresAPI.setAuthSession(token, user);
          if (rememberMe) {
            localStorage.setItem(MedicaresAPI.STORAGE_KEYS.remembers, emailOrPhone);
          } else {
            localStorage.removeItem(MedicaresAPI.STORAGE_KEYS.remembers);
          }
        }

        showLoginStatus('success', `Welcome back! Redirecting to your dashboard…`);
        if (window.MedicaresUI) MedicaresUI.notify('Welcome Back! 🎉', 'Signed in successfully. Redirecting…', 'success');
        closeLoginModal();

        setTimeout(() => {
          window.location.reload();
        }, 800);

      } catch (err) {
        console.error(err);
        showLoginStatus('error', err.message || 'Login failed. Please check your credentials.');
        if (window.MedicaresUI) MedicaresUI.notify('Login Failed', err.message || 'Authentication failed.', 'error');
        setCaptcha(loginCaptchaCode, loginCaptchaInput);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        }
      }
    });
  }


  // B. Booking widget container actions
  const homeBookingForm = document.getElementById('lp-home-booking-form');
  if (homeBookingForm) {
    const doctorSelect = document.getElementById('lp-booking-doctor');
    const hospitalInput = document.getElementById('lp-booking-hospital');
    const dateInput = document.getElementById('lp-booking-date');
    const slotsSection = document.getElementById('lp-booking-slots-section');
    const slotGrid = document.getElementById('lp-booking-slot-grid');
    const timeInput = document.getElementById('lp-booking-time');
    const patientSection = document.getElementById('lp-booking-patient-section');
    const submitBtn = document.getElementById('lp-booking-submit-btn');

    const bookingCaptchaCode = document.getElementById('lp-booking-captcha-code');
    const bookingCaptchaInput = document.getElementById('lp-booking-captcha-input');
    const bookingCaptchaRefresh = document.getElementById('lp-booking-captcha-refresh');
    const captchaGroup = document.getElementById('lp-booking-captcha-group');

    let loadedDoctors = [];
    let selectedDoctor = null;
    let selectedSlot = null;

    const fallbackDoctors = [
      { id: 1, name: "Dr. Ananya Rao", specialization: "Cardiologist", hospital: "City Care Hospital", email: "ananya.rao@medicares.me" },
      { id: 2, name: "Dr. Shruti Roy", specialization: "Pediatrician", hospital: "Northside Medical", email: "shruti.roy@medicares.me" },
      { id: 3, name: "Dr. Rajesh Deshmukh", specialization: "Pediatrician", hospital: "Northside Medical", email: "rajesh.deshmukh@medicares.me" },
      { id: 4, name: "Dr. Amit Patel", specialization: "Neurologist", hospital: "City Care Hospital", email: "amit.patel@medicares.me" },
      { id: 5, name: "Dr. Sarah Jenkins", specialization: "Dermatologist", hospital: "Green Valley Clinic", email: "sarah.jenkins@medicares.me" },
      { id: 6, name: "Dr. Siddharth Sen", specialization: "Dentist", hospital: "City Care Hospital", email: "siddharth.sen@medicares.me" },
      { id: 7, name: "Dr. Meera Aiyar", specialization: "General Physician", hospital: "Green Valley Clinic", email: "meera.aiyar@medicares.me" }
    ];

    if (dateInput) {
      dateInput.min = new Date().toISOString().split('T')[0];
    }

    if (bookingCaptchaRefresh && bookingCaptchaCode) {
      bookingCaptchaRefresh.addEventListener('click', () => setCaptcha(bookingCaptchaCode, bookingCaptchaInput));
    }

    // Prefill auth check
    function updateAuthBanners() {
      const authTip = document.getElementById('lp-booking-auth-tip');
      const welcomeUser = document.getElementById('lp-booking-welcome-user');
      if (window.MedicaresAPI) {
        const token = MedicaresAPI.getAuthToken();
        if (token) {
          if (authTip) authTip.style.display = 'none';
          if (welcomeUser) welcomeUser.style.display = 'block';
        } else {
          if (authTip) authTip.style.display = 'block';
          if (welcomeUser) welcomeUser.style.display = 'none';
        }
      }
    }
    updateAuthBanners();

    async function prefillPatientDetails() {
      if (window.MedicaresAPI) {
        const token = MedicaresAPI.getAuthToken();
        if (token) {
          try {
            const profile = await MedicaresAPI.getProfile().catch(() => null) || MedicaresAPI.getAuthUser();
            if (profile) {
              const nameField = document.getElementById('lp-booking-patient-name');
              const emailField = document.getElementById('lp-booking-patient-email');
              const phoneField = document.getElementById('lp-booking-patient-phone');

              if (nameField) nameField.value = profile.fullName || profile.name || '';
              if (emailField) emailField.value = profile.email || '';
              if (phoneField) phoneField.value = profile.phoneNumber || profile.phone || '';
            }
          } catch (e) {
            console.warn('Failed to prefill homepage booking form:', e);
          }
        }
      }
    }

    async function initDoctors() {
      try {
        let doctorsData = [];
        if (window.MedicaresAPI) {
          const baseUrl = window.API_URL || MedicaresAPI.API_BASE_URL;
          const response = await fetch(`${baseUrl}/doctors`).catch(() => null);
          if (response && response.ok) {
            const data = await response.json().catch(() => null);
            doctorsData = Array.isArray(data) ? data : (data?.items || []);
          } else {
            doctorsData = await MedicaresAPI.doctors.list().catch(() => []);
          }
        }

        loadedDoctors = doctorsData.length > 0 ? doctorsData.map(d => ({
          id: Number(d.id),
          name: String(d.name || d.fullName || 'Doctor'),
          specialization: String(d.specialization || d.specialty || 'General'),
          hospital: String(d.hospital_name || d.hospital || 'N/A'),
          email: String(d.email || d.doctorEmail || '')
        })) : fallbackDoctors;

      } catch (err) {
        console.warn('Failed to load doctors, using fallbacks', err);
        loadedDoctors = fallbackDoctors;
      }

      if (doctorSelect) {
        doctorSelect.innerHTML = '<option value="" disabled selected>-- Select Doctor --</option>';
        loadedDoctors.forEach(doc => {
          const opt = document.createElement('option');
          opt.value = doc.id;
          opt.textContent = `${doc.name} (${doc.specialization})`;
          doctorSelect.appendChild(opt);
        });
      }
    }

    if (doctorSelect && dateInput) {
      const checkSlots = async () => {
        const docId = Number(doctorSelect.value);
        const dateVal = dateInput.value;

        if (!docId || !dateVal) {
          if (slotsSection) slotsSection.style.display = 'none';
          if (captchaGroup) captchaGroup.style.display = 'none';
          submitBtn.disabled = true;
          submitBtn.textContent = "Select Doctor & Date";
          return;
        }

        selectedDoctor = loadedDoctors.find(d => d.id === docId);
        if (!selectedDoctor) return;

        if (hospitalInput) {
          hospitalInput.value = selectedDoctor.hospital || 'N/A';
        }

        // If we are on the simplified homepage form, just enable the submit button for redirect
        if (!slotsSection) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Select Doctor & Date";
          return;
        }

        selectedSlot = null;
        if (timeInput) timeInput.value = '';
        if (slotsSection) slotsSection.style.display = 'flex';
        if (captchaGroup) captchaGroup.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = "Review Booking";

        slotGrid.innerHTML = Array.from({ length: 8 }, () => '<div class="slot-skeleton" style="height:32px; background:rgba(148,163,184,0.1); border-radius:6px; animation:pulse-soft 1.5s infinite;"></div>').join('');

        try {
          let bookedSlots = [];
          if (window.MedicaresAPI) {
            const response = await MedicaresAPI.appointments.list({
              doctorEmail: selectedDoctor.email,
              date: dateVal
            }).catch(() => []);

            const list = Array.isArray(response) ? response : (response?.appointments || []);
            bookedSlots = list
              .filter(apt => {
                const status = String(apt.status || '').toUpperCase();
                const aptDate = apt.appointment_date || apt.date || '';
                return status === 'BOOKED' && aptDate === dateVal;
              })
              .map(apt => {
                const rawTime = apt.appointment_time || apt.time || '';
                return rawTime.substring(0, 5);
              });
          }

          const timeSlots = [];
          for (let h = 9; h < 17; h++) {
            for (let m = 0; m < 60; m += 15) {
              timeSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            }
          }

          // Filter out expired slots for today's date
          const today = new Date();
          const selectedDateStr = dateVal; // YYYY-MM-DD

          const offset = today.getTimezoneOffset();
          const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
          const todayDateStr = todayLocal.toISOString().split('T')[0];

          const isToday = (selectedDateStr === todayDateStr);
          const currentHour = today.getHours();
          const currentMin = today.getMinutes();

          slotGrid.innerHTML = '';
          timeSlots.forEach(slot => {
            const isBooked = bookedSlots.includes(slot);

            let isExpired = false;
            const isPastDate = (selectedDateStr < todayDateStr);
            if (isPastDate) {
              isExpired = true;
            } else if (isToday) {
              const [slotH, slotM] = slot.split(':').map(Number);
              if (slotH < currentHour || (slotH === currentHour && slotM <= currentMin)) {
                isExpired = true;
              }
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lp-booking-slot-btn';
            btn.disabled = isBooked || isExpired;

            const [hStr, mStr] = slot.split(':');
            let hr = parseInt(hStr, 10);
            const suff = hr >= 12 ? 'PM' : 'AM';
            if (hr === 0) hr = 12;
            else if (hr > 12) hr -= 12;

            if (isExpired) {
              btn.textContent = `${hr}:${mStr} ${suff} (Past)`;
              btn.style.opacity = '0.35';
              btn.style.textDecoration = 'line-through';
            } else {
              btn.textContent = `${hr}:${mStr} ${suff}`;
            }

            if (!isBooked && !isExpired) {
              btn.addEventListener('click', () => {
                slotGrid.querySelectorAll('.lp-booking-slot-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                selectedSlot = slot;
                timeInput.value = slot;

                if (captchaGroup) captchaGroup.style.display = 'block';
                // Initialize CAPTCHA
                if (bookingCaptchaCode) setCaptcha(bookingCaptchaCode, bookingCaptchaInput);

                submitBtn.disabled = false;
                submitBtn.textContent = "Review Booking";
              });
            }

            slotGrid.appendChild(btn);
          });

        } catch (err) {
          console.error('Failed to load slots', err);
          slotGrid.innerHTML = '<p class="muted" style="grid-column: span 4; text-align:center;">Unable to load slots.</p>';
        }
      };

      doctorSelect.addEventListener('change', checkSlots);
      dateInput.addEventListener('change', checkSlots);
    }

    homeBookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const docId = Number(doctorSelect.value);
      const dateVal = dateInput.value;

      selectedDoctor = loadedDoctors.find(d => d.id === docId);
      if (!selectedDoctor || !dateVal) return;

      // Handle homepage redirection
      if (!slotsSection) {
        window.location.href = `appointments.html?doctor=${encodeURIComponent(selectedDoctor.name)}&date=${encodeURIComponent(dateVal)}`;
        return;
      }

      // Check CAPTCHA
      if (!verifyCaptcha(bookingCaptchaCode, bookingCaptchaInput)) {
        if (window.MedicaresUI) MedicaresUI.notify('Verification Failed', 'Incorrect security code. Please try again.', 'error');
        setCaptcha(bookingCaptchaCode, bookingCaptchaInput);
        return;
      }

      if (!selectedSlot) {
        if (window.MedicaresUI) MedicaresUI.notify('Validation Error', 'Please select a time slot.', 'error');
        return;
      }

      const name = document.getElementById('lp-booking-patient-name').value.trim();
      const email = document.getElementById('lp-booking-patient-email').value.trim();
      const phone = document.getElementById('lp-booking-patient-phone').value.trim();
      const notes = document.getElementById('lp-booking-notes').value.trim();

      if (name.length < 2) {
        if (window.MedicaresUI) MedicaresUI.notify('Validation Error', 'Please enter a valid patient name.', 'error');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (window.MedicaresUI) MedicaresUI.notify('Validation Error', 'Please enter a valid email address.', 'error');
        return;
      }

      if (!phone) {
        if (window.MedicaresUI) MedicaresUI.notify('Validation Error', 'Phone number is required.', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Reviewing...";

      const payload = {
        patientName: name,
        patientEmail: email,
        patientPhone: phone,
        phoneNumber: phone,
        phone: phone,
        doctorId: String(selectedDoctor.id),
        doctorName: selectedDoctor.name,
        doctorEmail: selectedDoctor.email,
        hospital: selectedDoctor.hospital,
        hospital_name: selectedDoctor.hospital,
        date: dateVal,
        time: selectedSlot,
        notes: notes
      };

      try {
        if (window.MedicaresAPI) {
          await MedicaresAPI.appointments.create(payload);
          if (window.MedicaresUI) {
            MedicaresUI.notify('Success', 'Your appointment has been booked successfully!', 'success');
          }
          homeBookingForm.reset();
          if (hospitalInput) hospitalInput.value = 'Auto-filled from selected doctor';
          slotGrid.innerHTML = '<p class="muted" id="lp-booking-slots-placeholder" style="grid-column: span 4; text-align:center; font-size:0.82rem; color:var(--lp-muted); margin: 0.5rem 0;">Please select a doctor and date first to view available slots.</p>';
          if (captchaGroup) captchaGroup.style.display = 'none';
          submitBtn.disabled = true;
          submitBtn.textContent = "Review Booking";

          setTimeout(() => {
            const token = MedicaresAPI.getAuthToken();
            if (token) {
              window.location.reload();
            } else {
              window.location.reload();
            }
          }, 1500);
        }
      } catch (err) {
        console.error('Booking failed', err);
        submitBtn.disabled = false;
        submitBtn.textContent = "Review Booking";
        if (window.MedicaresUI) {
          MedicaresUI.notify('Booking Failed', err.message || 'Unable to complete your request.', 'error');
        }
        setCaptcha(bookingCaptchaCode, bookingCaptchaInput);
      }
    });

    initDoctors().then(() => {
      // Parse URL parameters for pre-filling doctor and date
      const urlParams = new URLSearchParams(window.location.search);
      const doctorParam = urlParams.get('doctor') || '';
      const dateParam = urlParams.get('date') || '';

      let prefilled = false;
      if (doctorParam && doctorSelect) {
        const match = loadedDoctors.find(d => 
          d.name.toLowerCase().includes(doctorParam.toLowerCase()) || 
          doctorParam.toLowerCase().includes(d.name.toLowerCase()) || 
          String(d.id) === doctorParam
        );
        if (match) {
          doctorSelect.value = match.id;
          selectedDoctor = match;
          if (hospitalInput) {
            hospitalInput.value = match.hospital;
          }
          prefilled = true;
        }
      }

      if (dateParam && dateInput) {
        dateInput.value = dateParam;
        prefilled = true;
      }

      if (prefilled && doctorSelect.value && dateInput.value) {
        // Trigger slots check
        doctorSelect.dispatchEvent(new Event('change'));
      }
    });
    prefillPatientDetails();
  }

  // C. Tab toggler logic
  const tabButtons = document.querySelectorAll('.lp-booking-tab');
  const viewNew = document.getElementById('lp-view-new-booking');
  const viewReconsult = document.getElementById('lp-view-reconsult');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.bookingTab;

      if (tab === 'new') {
        if (viewNew) viewNew.style.display = 'block';
        if (viewReconsult) viewReconsult.style.display = 'none';
      } else {
        if (viewNew) viewNew.style.display = 'none';
        if (viewReconsult) viewReconsult.style.display = 'block';

        const reconsultCaptchaCode = document.getElementById('lp-reconsult-captcha-code');
        const reconsultCaptchaInput = document.getElementById('lp-reconsult-captcha-input');
        if (reconsultCaptchaCode) setCaptcha(reconsultCaptchaCode, reconsultCaptchaInput);

        // Pre-fill reconsult search field with logged-in user's phone number
        const reconsultSearchEl = document.getElementById('lp-reconsult-search-input');
        if (reconsultSearchEl && !reconsultSearchEl.value && window.MedicaresAPI) {
          const storedUser = MedicaresAPI.getAuthUser();
          const storedPhone = storedUser?.phoneNumber || storedUser?.phone || storedUser?.phone_number || '';
          if (storedPhone) reconsultSearchEl.value = storedPhone;
        }
      }
    });
  });

  // D. Reconsultation logic
  const reconsultSearchInput = document.getElementById('lp-reconsult-search-input');
  const reconsultFindBtn = document.getElementById('lp-reconsult-find-btn');
  const reconsultResults = document.getElementById('lp-reconsult-search-results');
  const reconsultForm = document.getElementById('lp-home-reconsult-form');

  const reconsultDocDisplay = document.getElementById('lp-reconsult-doctor-display');
  const reconsultHospDisplay = document.getElementById('lp-reconsult-hospital-display');
  const reconsultDate = document.getElementById('lp-reconsult-date');
  const reconsultSlotsSection = document.getElementById('lp-reconsult-slots-section');
  const reconsultSlotGrid = document.getElementById('lp-reconsult-slot-grid');
  const reconsultTimeInput = document.getElementById('lp-reconsult-time');
  const reconsultSubmitBtn = document.getElementById('lp-reconsult-submit-btn');

  const reconsultCaptchaCode = document.getElementById('lp-reconsult-captcha-code');
  const reconsultCaptchaInput = document.getElementById('lp-reconsult-captcha-input');
  const reconsultCaptchaRefresh = document.getElementById('lp-reconsult-captcha-refresh');

  let selectedReconsultApt = null;
  let selectedReconsultSlot = null;

  if (reconsultDate) {
    reconsultDate.min = new Date().toISOString().split('T')[0];
  }

  if (reconsultCaptchaRefresh && reconsultCaptchaCode) {
    reconsultCaptchaRefresh.addEventListener('click', () => setCaptcha(reconsultCaptchaCode, reconsultCaptchaInput));
  }

  if (reconsultFindBtn) {
    reconsultFindBtn.addEventListener('click', async () => {
      const query = reconsultSearchInput.value.trim();
      if (!query) {
        if (window.MedicaresUI) MedicaresUI.notify('Validation Error', 'Please enter a phone number or appointment ID.', 'error');
        return;
      }

      reconsultFindBtn.disabled = true;
      reconsultFindBtn.textContent = 'Searching...';
      reconsultResults.innerHTML = '<p class="muted" style="text-align:center; font-size:0.85rem; margin:1rem 0;">Searching records...</p>';

      try {
        let list = [];

        if (window.MedicaresAPI) {
          // Try by phone number first, then by appointment ID
          const isPhone = /^[0-9]{7,15}$/.test(query);
          const isId = query.toLowerCase().startsWith('apt-') || /^[0-9]+$/.test(query);

          let res = [];
          if (isPhone) {
            res = await MedicaresAPI.appointments.list({ patientPhone: query }).catch(() => []);
          } else if (isId) {
            res = await MedicaresAPI.appointments.list({ appointmentId: query }).catch(() => []);
          } else {
            // Try both
            const r1 = await MedicaresAPI.appointments.list({ patientPhone: query }).catch(() => []);
            const r2 = await MedicaresAPI.appointments.list({ appointmentId: query }).catch(() => []);
            res = [...(Array.isArray(r1) ? r1 : r1?.appointments || []), ...(Array.isArray(r2) ? r2 : r2?.appointments || [])];
          }

          list = Array.isArray(res) ? res : (res?.appointments || []);
        }

        // Filter: only show BOOKED appointments eligible for reconsultation
        const matches = list.filter(apt => {
          const status = String(apt.status || '').toUpperCase();
          const type = String(apt.appointmentType || apt.type || apt.bookingType || '').toLowerCase();
          const isEligibleStatus = status === 'BOOKED' || status === 'CONFIRMED' || status === 'COMPLETED';
          const isAlreadyReconsult = type.includes('reconsult');
          return isEligibleStatus && !isAlreadyReconsult;
        });

        if (matches.length === 0) {
          reconsultResults.innerHTML = `
            <div style="text-align:center; padding: 1.5rem 0;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div>
              <p style="font-size:0.85rem; color:var(--lp-muted); margin:0; line-height:1.5;">
                No booked appointments found for <strong>${query}</strong>.<br/>
                <span style="font-size:0.8rem;">Make sure you have an existing appointment first.</span>
              </p>
            </div>`;
        } else {
          reconsultResults.innerHTML = `<p style="font-size:0.75rem; color:var(--lp-muted); margin-bottom:0.5rem; font-weight:600;">${matches.length} appointment(s) found — click to reconsult</p>`;
          matches.forEach(apt => {
            const aptDate = apt.appointment_date || apt.date || 'N/A';
            const aptTime = apt.appointment_time || apt.time || '';
            const status = String(apt.status || '').toUpperCase();
            const statusColor = status === 'COMPLETED' ? '#22c55e' : status === 'BOOKED' ? '#2563eb' : '#f59e0b';

            const item = document.createElement('div');
            item.className = 'lp-reconsult-item';
            item.style.cssText = 'cursor:pointer; border: 1px solid var(--lp-border); border-radius: 10px; padding: 0.75rem; margin-bottom: 0.5rem; background: var(--lp-bg); transition: box-shadow 0.2s;';
            item.innerHTML = `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:700; font-size:0.85rem; color:var(--lp-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${apt.doctorName || apt.doctor_name || 'Doctor'}</div>
                  <div style="font-size:0.75rem; color:var(--lp-muted); margin-top:0.15rem;">${apt.hospital || apt.hospital_name || ''}</div>
                  <div style="font-size:0.73rem; color:var(--lp-muted); margin-top:0.1rem;">📅 ${aptDate}${aptTime ? ' • ⏰ ' + aptTime : ''}</div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.35rem; flex-shrink:0;">
                  <span style="font-size:0.68rem; font-weight:700; color:${statusColor}; background:${statusColor}18; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">${status}</span>
                  <button type="button" class="lp-btn lp-btn-primary" style="min-height:auto; padding:0.3rem 0.65rem; font-size:0.73rem;">Reconsult →</button>
                </div>
              </div>
            `;

            item.addEventListener('click', () => {
              // Highlight selected
              reconsultResults.querySelectorAll('.lp-reconsult-item').forEach(el => {
                el.style.borderColor = 'var(--lp-border)';
                el.style.background = 'var(--lp-bg)';
              });
              item.style.borderColor = 'var(--lp-primary)';
              item.style.background = 'rgba(37,99,235,0.04)';

              selectedReconsultApt = {
                ...apt,
                doctorEmail: apt.doctorEmail || apt.doctor_email || ''
              };

              if (reconsultDocDisplay) reconsultDocDisplay.value = apt.doctorName || apt.doctor_name || '';
              if (reconsultHospDisplay) reconsultHospDisplay.value = apt.hospital || apt.hospital_name || '';

              const nameHidden = document.getElementById('lp-reconsult-patient-name');
              const emailHidden = document.getElementById('lp-reconsult-patient-email');
              const phoneHidden = document.getElementById('lp-reconsult-patient-phone');
              const notesHidden = document.getElementById('lp-reconsult-notes');

              if (nameHidden) nameHidden.value = apt.patientName || apt.patient_name || '';
              if (emailHidden) emailHidden.value = apt.patientEmail || apt.patient_email || '';
              if (phoneHidden) phoneHidden.value = apt.patientPhone || apt.phoneNumber || apt.phone || '';
              if (notesHidden) notesHidden.value = `Follow-up for appointment on ${aptDate}`;

              if (reconsultForm) reconsultForm.style.display = 'block';
              if (reconsultSlotsSection) reconsultSlotsSection.style.display = 'none';
              if (reconsultDate) reconsultDate.value = '';
              if (reconsultSubmitBtn) {
                reconsultSubmitBtn.disabled = true;
                reconsultSubmitBtn.textContent = 'Book Follow-up';
              }
            });

            reconsultResults.appendChild(item);
          });
        }

      } catch (err) {
        console.error(err);
        reconsultResults.innerHTML = '<p class="muted" style="text-align:center; font-size:0.85rem; margin:1rem 0; color:var(--lp-danger);">Error fetching records. Please try again.</p>';
      } finally {
        reconsultFindBtn.disabled = false;
        reconsultFindBtn.textContent = 'Find Eligible Appointments';
      }
    });
  }

  if (reconsultDate) {
    reconsultDate.addEventListener('change', async () => {
      const dateVal = reconsultDate.value;
      if (!dateVal || !selectedReconsultApt) {
        reconsultSlotsSection.style.display = 'none';
        reconsultSubmitBtn.disabled = true;
        return;
      }

      selectedReconsultSlot = null;
      reconsultTimeInput.value = '';
      reconsultSubmitBtn.disabled = true;

      reconsultSlotsSection.style.display = 'flex';
      reconsultSlotGrid.innerHTML = Array.from({ length: 8 }, () => '<div class="slot-skeleton" style="height:32px; background:rgba(148,163,184,0.1); border-radius:6px; animation:pulse-soft 1.5s infinite;"></div>').join('');

      try {
        let bookedSlots = [];
        if (window.MedicaresAPI) {
          const response = await MedicaresAPI.appointments.list({
            doctorEmail: selectedReconsultApt.doctorEmail,
            date: dateVal
          }).catch(() => []);

          const list = Array.isArray(response) ? response : (response?.appointments || []);
          bookedSlots = list
            .filter(apt => {
              const status = String(apt.status || '').toUpperCase();
              const aptDate = apt.appointment_date || apt.date || '';
              return status === 'BOOKED' && aptDate === dateVal;
            })
            .map(apt => {
              const rawTime = apt.appointment_time || apt.time || '';
              return rawTime.substring(0, 5);
            });
        }

        const timeSlots = [];
        for (let h = 9; h < 17; h++) {
          for (let m = 0; m < 60; m += 15) {
            timeSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
          }
        }

        const today = new Date();
        const selectedDateStr = dateVal;

        const offset = today.getTimezoneOffset();
        const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
        const todayDateStr = todayLocal.toISOString().split('T')[0];

        const isToday = (selectedDateStr === todayDateStr);
        const currentHour = today.getHours();
        const currentMin = today.getMinutes();

        reconsultSlotGrid.innerHTML = '';
        timeSlots.forEach(slot => {
          const isBooked = bookedSlots.includes(slot);

          let isExpired = false;
          const isPastDate = (selectedDateStr < todayDateStr);
          if (isPastDate) {
            isExpired = true;
          } else if (isToday) {
            const [slotH, slotM] = slot.split(':').map(Number);
            if (slotH < currentHour || (slotH === currentHour && slotM <= currentMin)) {
              isExpired = true;
            }
          }

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'lp-booking-slot-btn';
          btn.disabled = isBooked || isExpired;

          const [hStr, mStr] = slot.split(':');
          let hr = parseInt(hStr, 10);
          const suff = hr >= 12 ? 'PM' : 'AM';
          if (hr === 0) hr = 12;
          else if (hr > 12) hr -= 12;

          if (isExpired) {
            btn.textContent = `${hr}:${mStr} ${suff} (Past)`;
            btn.style.opacity = '0.35';
            btn.style.textDecoration = 'line-through';
          } else {
            btn.textContent = `${hr}:${mStr} ${suff}`;
          }

          if (!isBooked && !isExpired) {
            btn.addEventListener('click', () => {
              reconsultSlotGrid.querySelectorAll('.lp-booking-slot-btn').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');

              selectedReconsultSlot = slot;
              reconsultTimeInput.value = slot;
              reconsultSubmitBtn.disabled = false;
            });
          }

          reconsultSlotGrid.appendChild(btn);
        });

      } catch (err) {
        console.error(err);
        reconsultSlotGrid.innerHTML = '<p class="muted" style="grid-column: span 4; text-align:center;">Unable to load slots.</p>';
      }
    });
  }

  if (reconsultForm) {
    reconsultForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!verifyCaptcha(reconsultCaptchaCode, reconsultCaptchaInput)) {
        if (window.MedicaresUI) MedicaresUI.notify('Verification Failed', 'Incorrect CAPTCHA security code. Please try again.', 'error');
        setCaptcha(reconsultCaptchaCode, reconsultCaptchaInput);
        return;
      }

      if (!selectedReconsultApt || !reconsultDate.value || !selectedReconsultSlot) {
        if (window.MedicaresUI) MedicaresUI.notify('Validation Error', 'Please select a date and time slot.', 'error');
        return;
      }

      reconsultSubmitBtn.disabled = true;
      reconsultSubmitBtn.textContent = 'Booking Follow-up...';

      const payload = {
        patientName: document.getElementById('lp-reconsult-patient-name').value,
        patientEmail: document.getElementById('lp-reconsult-patient-email').value,
        patientPhone: document.getElementById('lp-reconsult-patient-phone').value,
        phoneNumber: document.getElementById('lp-reconsult-patient-phone').value,
        phone: document.getElementById('lp-reconsult-patient-phone').value,
        doctorId: String(selectedReconsultApt.doctorId || selectedReconsultApt.doctorId),
        doctorName: selectedReconsultApt.doctorName,
        doctorEmail: selectedReconsultApt.doctorEmail,
        hospital: selectedReconsultApt.hospital,
        hospital_name: selectedReconsultApt.hospital,
        date: reconsultDate.value,
        time: selectedReconsultSlot,
        notes: document.getElementById('lp-reconsult-notes').value
      };

      try {
        if (window.MedicaresAPI) {
          await MedicaresAPI.appointments.create(payload);
          if (window.MedicaresUI) {
            MedicaresUI.notify('Success', 'Your reconsultation follow-up has been booked successfully!', 'success');
          }
          reconsultForm.reset();
          reconsultForm.style.display = 'none';
          reconsultSlotsSection.style.display = 'none';
          reconsultResults.innerHTML = '';
          reconsultSearchInput.value = '';

          setTimeout(() => {
            const token = MedicaresAPI.getAuthToken();
            if (token) {
              window.location.href = 'patient-dashboard.html';
            } else {
              window.location.reload();
            }
          }, 1500);
        }
      } catch (err) {
        console.error(err);
        reconsultSubmitBtn.disabled = false;
        reconsultSubmitBtn.textContent = 'Book Follow-up';
        if (window.MedicaresUI) {
          MedicaresUI.notify('Booking Failed', err.message || 'Unable to book follow-up.', 'error');
        }
        setCaptcha(reconsultCaptchaCode, reconsultCaptchaInput);
      }
    });

    initDoctors();
    prefillPatientDetails();
  }

  // 9. Contact support form interceptor (keeping compatibility with app.js data-demo-form)
  const contactForm = document.getElementById('lp-contact-form');
  if (contactForm && window.MedicaresUI) {
    contactForm.addEventListener('submit', (e) => {
      // app.js handles general form[data-demo-form] submit, but let's make sure it operates nicely
      // We don't interfere, just log or trigger a smooth transition if needed.
    });
  }
});
