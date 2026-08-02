document.addEventListener('DOMContentLoaded', async () => {
  const role = String(document.body?.dataset?.role || '').toLowerCase();
  if (!role) return;

  bindSidebarToggle();

  const loginPage = role === 'doctor' ? 'doctor-login.html' : 'login.html';
  const profile = await MedicaresAPI.requireAuth({ role, redirectTo: loginPage, validateProfile: true });
  if (!profile) return;

  try {
    setGlobalGreeting(profile);
    showLoadingState(role);

    const [appointmentsRaw, doctorsRaw, usersRaw] = await Promise.all([
      loadAppointmentsForRole(role, profile),
      MedicaresAPI.safeApiCall('/doctors', { method: 'GET' }, []),
      role === 'admin' ? loadUsersForAdmin(profile) : Promise.resolve([])
    ]);

    const appointments = normalizeAppointments(appointmentsRaw);
    const doctors = normalizeDoctors(doctorsRaw);
    const users = normalizeUsers(usersRaw, appointments, profile);

    if (role === 'patient') {
      renderPatientDashboard(profile, appointments, doctors);
    } else if (role === 'doctor') {
      renderDoctorDashboard(profile, appointments, doctors);
    } else {
      renderAdminDashboard(profile, appointments, doctors, users);
    }
  } catch (error) {
    showErrorState(role, error?.message || 'Unable to load dashboard data.');
  }

  function bindSidebarToggle() {
    document.querySelectorAll('[data-sidebar-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.toggle('open');
      });
    });
  }

  function notify(title, message, type = 'error') {
    if (window.MedicaresUI?.notify) {
      window.MedicaresUI.notify(title, message, type);
      return;
    }
    alert(`${title}: ${message}`);
  }

  function setGlobalGreeting(user) {
    const fullName = MedicaresAPI.sanitizeText(user.fullName || user.name || 'User');
    const greeting = document.querySelector('[data-dashboard-greeting]');
    if (greeting) greeting.textContent = `Welcome, ${fullName}`;

    const doctorName = document.querySelector('[data-doctor-name]');
    if (doctorName) {
      const printableName = fullName.toLowerCase().startsWith('dr.') ? fullName : `Dr. ${fullName}`;
      doctorName.textContent = printableName;
    }
  }

  function normalizeDoctors(items) {
    if (window.MedicaresAPI && typeof MedicaresAPI.normalizeDoctorsList === 'function') {
      return MedicaresAPI.normalizeDoctorsList(items);
    }
    const list = Array.isArray(items) ? items : (items?.doctors || items?.items || []);
    return list.map((doctor) => {
      const userObj = doctor.user && typeof doctor.user === 'object' ? doctor.user : {};
      const rawName = doctor.name || doctor.fullName || userObj.name || userObj.fullName || '';
      const cleanName = String(rawName).trim();
      const printableName = cleanName ? (cleanName.toLowerCase().startsWith('dr') ? cleanName : `Dr. ${cleanName}`) : 'Doctor';
      return {
        id: doctor.id ?? doctor.doctorId ?? userObj.id ?? 0,
        name: printableName,
        fullName: printableName,
        specialization: doctor.specialization || doctor.specialty || 'General',
        email: doctor.email || doctor.doctorEmail || userObj.email || '',
        address: doctor.address || doctor.location || doctor.hospital || '',
        hospital: doctor.hospital_name || doctor.hospital || doctor.location || doctor.address || 'N/A',
        location: doctor.location || doctor.address || doctor.hospital_name || doctor.hospital || 'N/A',
      };
    });
  }

  async function loadAppointmentsForRole(roleName, profileData) {
    if (roleName === 'patient') {
      return MedicaresAPI.appointments.list({ patientEmail: profileData.email }).catch(() => []);
    }

    if (roleName === 'doctor') {
      return MedicaresAPI.appointments.list({ doctorEmail: profileData.email }).catch(() => []);
    }

    const candidatePaths = roleName === 'admin'
      ? ['/admin/appointments', '/appointments']
      : ['/doctor/appointments', '/appointments'];

    for (const path of candidatePaths) {
      const response = await MedicaresAPI.safeApiCall(path, { method: 'GET' }, null);
      const source = extractCollection(response);
      if (source.length) return source;
    }

    return [];
  }

  async function loadUsersForAdmin() {
    const response = await MedicaresAPI.safeApiCall('/users', { method: 'GET' }, null);
    const source = extractCollection(response);
    if (source.length) return source;

    return [];
  }

  function extractCollection(items) {
    if (Array.isArray(items)) return items;
    if (Array.isArray(items?.users)) return items.users;
    if (Array.isArray(items?.patients)) return items.patients;
    if (Array.isArray(items?.appointments)) return items.appointments;
    if (Array.isArray(items?.items)) return items.items;
    if (Array.isArray(items?.data)) return items.data;
    return [];
  }

  function normalizeUsers(items, appointments, profileData) {
    if (Array.isArray(items) && items.length) {
      return items.map((item) => ({
        name: item.name || item.fullName || item.username || item.email || 'User',
        email: item.email || '',
        role: String(item.role || item.userRole || 'patient').toLowerCase(),
        status: String(item.status || item.state || 'Active')
      }));
    }

    const fallbackUsers = [];
    const seen = new Set();

    appointments.forEach((appointment) => {
      const key = String(appointment.patientEmail || appointment.patientId || '').trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      fallbackUsers.push({
        name: appointment.patientName || appointment.patientEmail || appointment.patientId || 'Patient',
        email: appointment.patientEmail || '',
        role: 'patient',
        status: 'Active'
      });
    });

    if (fallbackUsers.length) return fallbackUsers;

    return [{
      name: profileData.fullName || profileData.name || profileData.email || 'Admin',
      email: profileData.email || '',
      role: 'admin',
      status: 'Active'
    }];
  }

  function normalizeUserRecord(item) {
    return {
      id: item.id || item.userId || '',
      name: item.name || item.fullName || item.username || 'User',
      email: item.email || '',
      role: String(item.role || item.userRole || 'patient').toLowerCase(),
      status: String(item.status || item.state || 'Active')
    };
  }

  function normalizeAppointments(items) {
    const source = Array.isArray(items)
      ? items
      : Array.isArray(items?.appointments)
        ? items.appointments
        : Array.isArray(items?.items)
          ? items.items
          : Array.isArray(items?.data)
            ? items.data
            : [];

    return source.map((appointment) => {
      const date = appointment.appointment_date || appointment.date || '';
      const time = appointment.appointment_time || appointment.time || '';
      return {
        id: appointment.id || appointment.appointmentId,
        doctorId: Number(appointment.doctor_id || appointment.doctorId || 0),
        doctorName: String(appointment.doctorName || appointment.doctor_name || ''),
        doctorEmail: String(appointment.doctorEmail || appointment.doctor_email || ''),
        patientId: String(appointment.patient_id || appointment.patientId || ''),
        patientEmail: String(appointment.patient_email || appointment.patientEmail || appointment.email || ''),
        patientName: String(appointment.patient_name || appointment.patientName || appointment.patient || ''),
        patientPhone: String(appointment.patientPhone || appointment.phoneNumber || appointment.phone || appointment.patient_phone || ''),
        appointmentType: String(appointment.appointmentType || appointment.type || appointment.bookingType || 'Consultation'),
        date,
        time,
        status: String(appointment.status || 'BOOKED').toUpperCase(),
        dateTimeMs: getDateMs(date, time)
      };
    }).sort((a, b) => a.dateTimeMs - b.dateTimeMs);
  }

  function getDateMs(date, time) {
    const source = date && time ? `${date}T${time}` : date || '';
    const ms = source ? new Date(source).getTime() : Number.NaN;
    return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
  }

  function appointmentLabel(item) {
    return `${MedicaresAPI.formatDate(item.date)} • ${MedicaresAPI.formatTime(item.time)}`;
  }

  function renderPatientDashboard(user, appointments, doctors) {
    const userIdentityCandidates = getPatientIdentityCandidates(user);
    const ownAppointments = appointments.filter((item) => {
      if (!userIdentityCandidates.length) return true;

      const appointmentCandidates = [item.patientId, item.patientEmail, item.patientName]
        .map(normalizeIdentity)
        .filter(Boolean);

      return appointmentCandidates.some((candidate) => userIdentityCandidates.includes(candidate));
    });
    const now = Date.now();
    const upcoming = ownAppointments.filter((item) => item.dateTimeMs >= now);
    const history = ownAppointments.filter((item) => item.dateTimeMs < now);

    renderPatientKpis(upcoming.length, history.length);
    renderPatientProfile(user);
    renderPatientCalendar(upcoming);
    renderPatientUpcoming(upcoming, doctors);
    renderPatientSummary(upcoming.length, history.length, ownAppointments.length);
    renderPatientHistory(history, doctors);
    renderPatientReminders();
  }

  function renderPatientKpis(upcomingCount, historyCount) {
    const kpis = document.querySelectorAll('.dashboard-grid.cols-3 .kpi-value');
    if (kpis[0]) kpis[0].textContent = String(upcomingCount);
    if (kpis[1]) kpis[1].textContent = String(historyCount);
    if (kpis[2]) kpis[2].textContent = String(upcomingCount + historyCount);

    const notes = document.querySelectorAll('.dashboard-grid.cols-3 .kpi-note');
    if (notes[0]) notes[0].textContent = upcomingCount ? 'Your next consultations are scheduled.' : 'No upcoming appointments yet.';
    if (notes[1]) notes[1].textContent = historyCount ? 'Past consultations are available below.' : 'No booking history available yet.';
    if (notes[2]) notes[2].textContent = 'Live count from appointment records.';
  }

  function renderPatientProfile(user) {
    const profileCard = document.querySelector('[data-profile-card]');
    if (!profileCard) return;

    // Merge locally-stored session user so phone/gender from login credentials
    // are always available, even when the live API profile omits those fields.
    const storedUser = MedicaresAPI.getAuthUser() || {};
    const phone = user.phoneNumber || user.phone || user.phone_number
                  || storedUser.phoneNumber || storedUser.phone || storedUser.phone_number || '-';
    const gender = user.gender || storedUser.gender || '-';
    const dob = user.dateOfBirth || user.dob || storedUser.dateOfBirth || storedUser.dob || '';
    const userId = user.userId || user.id || storedUser.userId || storedUser.id || '-';
    const displayName = MedicaresAPI.sanitizeText(user.fullName || user.name || storedUser.fullName || storedUser.name || 'User');
    const displayEmail = MedicaresAPI.sanitizeText(user.email || storedUser.email || '-');

    profileCard.innerHTML = `
      <div class="profile-row">
        <div class="avatar-xl">${MedicaresAPI.initials(displayName)}</div>
        <div>
          <h3 style="margin:0;">${displayName}</h3>
          <p class="muted" style="margin:0;">${displayEmail}</p>
        </div>
      </div>
      <div class="stack" style="margin-top:1rem;">
        <div class="dashboard-badge">Patient ID #${MedicaresAPI.sanitizeText(String(userId))}</div>
        <p class="muted" style="margin:0;">📞 Phone: <strong>${MedicaresAPI.sanitizeText(phone)}</strong></p>
        <p class="muted" style="margin:0;">⚧ Gender: <strong>${MedicaresAPI.sanitizeText(gender)}</strong></p>
        ${dob ? `<p class="muted" style="margin:0;">🎂 DOB: <strong>${MedicaresAPI.sanitizeText(dob)}</strong></p>` : ''}
      </div>
    `;
  }

  function renderPatientCalendar(upcoming) {
    const calendar = document.querySelector('[data-calendar]');
    if (!calendar) return;

    const next = upcoming[0];
    calendar.innerHTML = `
      <div class="month-head">
        <div>
          <h3 style="margin:0;">Next Appointment</h3>
          <p class="muted" style="margin:0;">Upcoming booking window</p>
        </div>
        <span class="badge badge--info">${next ? 'Scheduled' : 'None'}</span>
      </div>
      <div style="margin-top:1rem;">
        ${next ? `<strong>${appointmentLabel(next)}</strong>` : '<p class="muted">No upcoming appointments.</p>'}
      </div>
    `;
  }

  function renderPatientUpcoming(upcoming, doctors) {
    const container = document.querySelector('[data-patient-appointments]');
    if (!container) return;

    if (!upcoming.length) {
      container.innerHTML = '<div class="dashboard-empty"><h3>No upcoming appointments</h3><p class="muted">Book your next consultation from the appointments page.</p></div>';
      return;
    }

    container.innerHTML = upcoming.slice(0, 6).map((appointment) => {
      const doctor = doctors.find((item) => Number(item.id) === Number(appointment.doctorId));
      const docName = doctor?.name || appointment.doctorName || `Doctor #${appointment.doctorId}`;
      return `
        <div class="schedule-item" style="padding: 1rem; border-bottom: 1px solid var(--border);">
          <strong>Doctor: ${MedicaresAPI.sanitizeText(docName)}</strong>
          <div class="meta" style="margin-top:0.25rem;">
            ${MedicaresAPI.sanitizeText(doctor?.specialization || 'General')} • ${appointmentLabel(appointment)}
          </div>
          <div style="font-size: 0.85rem; color: var(--text); margin-top: 0.5rem; margin-bottom: 0.5rem;">
            <strong>Patient Name:</strong> ${MedicaresAPI.sanitizeText(appointment.patientName || 'N/A')}
            ${appointment.patientPhone ? `• <strong>Phone:</strong> ${MedicaresAPI.sanitizeText(appointment.patientPhone)}` : ''}
            • <strong>Type:</strong> ${MedicaresAPI.sanitizeText(appointment.appointmentType || 'Consultation')}
          </div>
          <div class="badge badge--info">${MedicaresAPI.sanitizeText(appointment.status)}</div>
        </div>
      `;
    }).join('');
  }

  function renderPatientSummary(upcomingCount, historyCount, total) {
    const summary = document.querySelector('[data-health-summary]');
    if (!summary) return;

    summary.innerHTML = `
      <h3>Booking Summary</h3>
      <p class="muted">Total appointments: ${total}. Upcoming: ${upcomingCount}. History: ${historyCount}.</p>
      <div class="stack" style="margin-top:1rem;">
        <div class="progress-row">
          <div class="flex justify-between"><span>Upcoming ratio</span><strong>${total ? Math.round((upcomingCount / total) * 100) : 0}%</strong></div>
          <div class="progress-bar"><span style="width:${total ? Math.round((upcomingCount / total) * 100) : 0}%"></span></div>
        </div>
        <div class="progress-row">
          <div class="flex justify-between"><span>History ratio</span><strong>${total ? Math.round((historyCount / total) * 100) : 0}%</strong></div>
          <div class="progress-bar"><span style="width:${total ? Math.round((historyCount / total) * 100) : 0}%"></span></div>
        </div>
      </div>
    `;
  }

  function renderPatientHistory(history, doctors) {
    const notifications = document.querySelector('[data-patient-notifications]');
    if (!notifications) return;

    if (!history.length) {
      notifications.innerHTML = '<div class="dashboard-empty"><h3>No booking history</h3><p class="muted">Completed appointments will appear here.</p></div>';
      return;
    }

    notifications.innerHTML = history.slice(-8).reverse().map((appointment) => {
      const doctor = doctors.find((item) => Number(item.id) === Number(appointment.doctorId));
      const docName = doctor?.name || appointment.doctorName || `Doctor #${appointment.doctorId}`;
      return `
        <div class="notification-item" style="padding: 1rem; border-bottom: 1px solid var(--border);">
          <strong>Doctor: ${MedicaresAPI.sanitizeText(docName)}</strong>
          <div class="meta" style="margin-top:0.25rem;">
            ${appointmentLabel(appointment)}
          </div>
          <div style="font-size: 0.85rem; color: var(--text); margin-top: 0.5rem; margin-bottom: 0.5rem;">
            <strong>Patient Name:</strong> ${MedicaresAPI.sanitizeText(appointment.patientName || 'N/A')}
            ${appointment.patientPhone ? `• <strong>Phone:</strong> ${MedicaresAPI.sanitizeText(appointment.patientPhone)}` : ''}
            • <strong>Type:</strong> ${MedicaresAPI.sanitizeText(appointment.appointmentType || 'Consultation')}
          </div>
          <div class="badge badge--warning" style="display:inline-block;">${MedicaresAPI.sanitizeText(appointment.status)}</div>
        </div>
      `;
    }).join('');
  }

  function renderPatientReminders() {
    const reminders = document.querySelector('[data-patient-reminders]');
    if (!reminders) return;
    reminders.innerHTML = '<div class="dashboard-empty"><h3>No reminders configured</h3><p class="muted">Medicine reminder APIs are not connected in this module.</p></div>';
  }

  function renderDoctorDashboard(user, appointments, doctors) {
    renderDoctorProfile(user, doctors);

    // The API already returns only this doctor's appointments
    // via the ?doctorEmail= query parameter, so no client-side filter needed.
    const relevantAppointments = appointments;

    const now = Date.now();
    const upcoming = relevantAppointments.filter((item) => item.dateTimeMs >= now);
    const pending = relevantAppointments.filter((item) => item.status === 'PENDING');

    renderDoctorStats(relevantAppointments.length, upcoming.length, pending.length);
    renderDoctorSchedule(upcoming, doctors);
    renderDoctorTable(relevantAppointments, doctors, user);
  }

  function renderDoctorProfile(user, doctors) {
    const profileCard = document.querySelector('[data-profile-card]');
    if (!profileCard) return;

    const userEmail = String(user.email || '').toLowerCase();
    const doctorRecord = doctors.find((d) => String(d.email || '').toLowerCase() === userEmail);
    const specialization = doctorRecord?.specialization || 'Clinical Generalist';
    const hospital = doctorRecord?.hospital || 'Medicares Clinic';

    profileCard.innerHTML = `
      <div class="profile-row">
        <div class="avatar-xl">${MedicaresAPI.initials(user.fullName || user.name || 'D')}</div>
        <div>
          <h3 style="margin:0;">${MedicaresAPI.sanitizeText(user.fullName || user.name || 'Doctor')}</h3>
          <p class="muted" style="margin:0;">${MedicaresAPI.sanitizeText(user.email || '-')}</p>
        </div>
      </div>
      <div class="stack" style="margin-top:1rem;">
        <div class="dashboard-badge">Doctor ID #${MedicaresAPI.sanitizeText(user.userId || user.id || '-')}</div>
        <p class="muted" style="margin:0;">Specialization: ${MedicaresAPI.sanitizeText(specialization)}</p>
        <p class="muted" style="margin:0;">Hospital: ${MedicaresAPI.sanitizeText(hospital)}</p>
      </div>
    `;
  }

  function getDoctorIdentityCandidates(user) {
    const ids = [];
    const values = [user.id, user.userId, user.doctorId, user.doctor_id];

    values.forEach((value) => {
      if (value !== undefined && value !== null && value !== '') {
        ids.push(String(value));
      }
    });

    const numericFromUserId = String(user.userId || '').match(/\d+/)?.[0];
    if (numericFromUserId) ids.push(String(Number(numericFromUserId)));

    return Array.from(new Set(ids));
  }

  function renderDoctorStats(total, upcoming, pending) {
    const container = document.querySelector('[data-doctor-stats]');
    if (!container) return;

    const completed = Math.max(total - upcoming, 0);
    container.innerHTML = [
      ['Total Appointments', String(total), 'Live appointment count'],
      ['Upcoming', String(upcoming), 'Future consultations'],
      ['Pending', String(pending), 'Awaiting confirmation'],
      ['Completed', String(completed), 'Past consultations']
    ].map(([label, value, note]) => `
      <div class="stat-card">
        <p class="kpi-label">${label}</p>
        <p class="kpi-value">${value}</p>
        <p class="kpi-note">${note}</p>
      </div>
    `).join('');
  }

  function renderDoctorSchedule(upcoming, doctors) {
    const container = document.querySelector('[data-doctor-schedule]');
    if (!container) return;

    if (!upcoming.length) {
      container.innerHTML = '<div class="dashboard-empty"><h3>No upcoming consultations</h3><p class="muted">New bookings will appear here automatically.</p></div>';
      return;
    }

    container.innerHTML = upcoming.slice(0, 8).map((appointment) => {
      const doctor = doctors.find((item) => Number(item.id) === Number(appointment.doctorId));
      const docName = doctor?.name || appointment.doctorName || `Doctor #${appointment.doctorId}`;
      return `
        <div class="schedule-item" style="padding: 1rem; border-bottom: 1px solid var(--border);">
          <strong>Patient: ${MedicaresAPI.sanitizeText(appointment.patientName || `Patient #${appointment.patientId || '-'}`)}</strong>
          <div class="meta" style="margin-top:0.25rem;">
            Email: ${MedicaresAPI.sanitizeText(appointment.patientEmail || 'N/A')}
            ${appointment.patientPhone ? `• Phone: ${MedicaresAPI.sanitizeText(appointment.patientPhone)}` : ''}
            <br>
            Doctor: ${MedicaresAPI.sanitizeText(docName)} (${MedicaresAPI.sanitizeText(doctor?.specialization || 'General')}) • ${appointmentLabel(appointment)}
            <br>
            Type: ${MedicaresAPI.sanitizeText(appointment.appointmentType || 'Consultation')}
          </div>
          <div class="badge badge--${appointment.status === 'BOOKED' ? 'success' : 'warning'}" style="margin-top:0.6rem;">${MedicaresAPI.sanitizeText(appointment.status)}</div>
        </div>
      `;
    }).join('');
  }

  function renderDoctorTable(appointments, doctors, user) {
    const table = document.querySelector('[data-doctor-patients]');
    const searchInput = document.querySelector('[data-patient-search]');
    const downloadBtn = document.getElementById('download-pdf-btn');
    const paginationContainer = document.getElementById('doctor-pagination');
    if (!table) return;

    const rows = appointments.map((appointment) => {
      const doctor = doctors.find((item) => Number(item.id) === Number(appointment.doctorId));
      return {
        patientName: appointment.patientName || 'Patient',
        patientEmail: appointment.patientEmail || 'N/A',
        patientPhone: appointment.patientPhone || 'N/A',
        patientId: appointment.patientId || '-',
        appointmentType: appointment.appointmentType || 'Consultation',
        dateTime: appointmentLabel(appointment),
        status: appointment.status,
        rawAppointment: appointment
      };
    });

    let currentFilteredRows = [...rows];
    const PAGE_SIZE = 10;
    let currentPage = 1;

    const draw = (query = '') => {
      const lowered = query.toLowerCase().trim();
      const filtered = lowered
        ? rows.filter((item) => `${item.patientName} ${item.patientEmail} ${item.patientPhone} ${item.patientId} ${item.appointmentType} ${item.dateTime}`.toLowerCase().includes(lowered))
        : rows;

      currentFilteredRows = filtered;

      const totalItems = filtered.length;
      const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;

      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;

      const startIdx = (currentPage - 1) * PAGE_SIZE;
      const endIdx = Math.min(startIdx + PAGE_SIZE, totalItems);
      const pageRows = filtered.slice(startIdx, endIdx);

      if (!filtered.length) {
        table.innerHTML = '<tr><td colspan="6" class="muted" style="text-align: center; padding: 2.5rem 1rem;">No matching appointments found.</td></tr>';
        if (paginationContainer) paginationContainer.style.display = 'none';
        return;
      } else {
        if (paginationContainer) paginationContainer.style.display = 'flex';
      }

      table.innerHTML = pageRows.map((item) => `
        <tr>
          <td>
            <div style="font-weight: 600; color: var(--text); font-size: 0.95rem;">${MedicaresAPI.sanitizeText(item.patientName)}</div>
            <div class="meta" style="font-size: 0.8rem; margin-top: 0.15rem;">ID: ${MedicaresAPI.sanitizeText(item.patientId)}</div>
          </td>
          <td>
            <div style="font-size: 0.9rem; color: var(--text);">${MedicaresAPI.sanitizeText(item.patientEmail)}</div>
            <div class="meta" style="font-size: 0.8rem; margin-top: 0.15rem;">${MedicaresAPI.sanitizeText(item.patientPhone)}</div>
          </td>
          <td>
            <div style="font-weight: 500; color: var(--text); font-size: 0.9rem;">${MedicaresAPI.sanitizeText(item.dateTime)}</div>
          </td>
          <td>
            <span class="badge badge--info" style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; padding: 0.2rem 0.5rem;">
              ${MedicaresAPI.sanitizeText(item.appointmentType)}
            </span>
          </td>
          <td>
            <span class="badge badge--${item.status === 'BOOKED' ? 'success' : 'warning'}" style="font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.5rem;">
              ${MedicaresAPI.sanitizeText(item.status)}
            </span>
          </td>
          <td>
            <button class="button button--ghost" type="button" onclick="showAppointmentDetailsModal('${item.rawAppointment.id || ''}')" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; min-height: auto; border-radius: 8px;">Review</button>
          </td>
        </tr>
      `).join('');

      renderPaginationControls(totalItems, totalPages);
    };

    const renderPaginationControls = (totalItems, totalPages) => {
      if (!paginationContainer) return;

      const startItem = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
      const endItem = Math.min(currentPage * PAGE_SIZE, totalItems);

      let buttonsHtml = '';
      
      buttonsHtml += `
        <button class="button button--ghost" type="button" ${currentPage === 1 ? 'disabled' : ''} data-page-action="prev" style="min-height: 36px; padding: 0.25rem 0.75rem; font-size: 0.85rem; border-radius: 8px; margin: 0 0.15rem;">
          Previous
        </button>
      `;

      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
          buttonsHtml += `
            <button class="button ${currentPage === i ? 'button--primary' : 'button--ghost'}" type="button" data-page-num="${i}" style="min-height: 36px; width: 36px; padding: 0; font-size: 0.85rem; border-radius: 8px; margin: 0 0.15rem; ${currentPage === i ? 'color: white; pointer-events: none;' : ''}">
              ${i}
            </button>
          `;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
          buttonsHtml += `<span style="padding: 0 0.25rem; color: var(--muted); font-size: 0.9rem;">...</span>`;
        }
      }

      buttonsHtml += `
        <button class="button button--ghost" type="button" ${currentPage === totalPages ? 'disabled' : ''} data-page-action="next" style="min-height: 36px; padding: 0.25rem 0.75rem; font-size: 0.85rem; border-radius: 8px; margin: 0 0.15rem;">
          Next
        </button>
      `;

      paginationContainer.innerHTML = `
        <div class="pagination-info" style="font-size: 0.9rem; color: var(--muted);">
          Showing <strong style="color: var(--text);">${startItem}</strong> to <strong style="color: var(--text);">${endItem}</strong> of <strong style="color: var(--text);">${totalItems}</strong> appointments
        </div>
        <div class="pagination-buttons" style="display: flex; align-items: center;">
          ${buttonsHtml}
        </div>
      `;

      paginationContainer.querySelectorAll('[data-page-action="prev"]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (currentPage > 1) {
            currentPage--;
            draw(searchInput?.value || '');
          }
        });
      });

      paginationContainer.querySelectorAll('[data-page-action="next"]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (currentPage < totalPages) {
            currentPage++;
            draw(searchInput?.value || '');
          }
        });
      });

      paginationContainer.querySelectorAll('[data-page-num]').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = parseInt(btn.dataset.pageNum, 10);
          if (page && page !== currentPage) {
            currentPage = page;
            draw(searchInput?.value || '');
          }
        });
      });
    };

    draw();
    
    searchInput?.addEventListener('input', () => {
      currentPage = 1;
      draw(searchInput.value);
    });

    // Handle PDF Download
    if (downloadBtn) {
      const newBtn = downloadBtn.cloneNode(true);
      downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);

      newBtn.addEventListener('click', () => {
        try {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF();
          
          const docName = user?.fullName || user?.name || 'Doctor';
          const email = user?.email || 'N/A';
          const totalCount = currentFilteredRows.length;
          
          // Header banner
          doc.setFillColor(37, 99, 235);
          doc.rect(0, 0, 210, 40, 'F');
          
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(22);
          doc.setFont('helvetica', 'bold');
          doc.text("MEDICARES CLINICAL PORTAL", 14, 18);
          
          doc.setFontSize(11);
          doc.setFont('helvetica', 'normal');
          doc.text("Official Patient Booking History Report", 14, 25);
          doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32);
          
          // Provider Details
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text("Provider Information", 14, 50);
          
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text(`Doctor Name:  ${docName}`, 14, 56);
          doc.text(`Email Address: ${email}`, 14, 62);
          doc.text(`Status:        Authorized Medical Staff`, 14, 68);
          
          // Summary block
          doc.setFillColor(248, 250, 252);
          doc.rect(130, 45, 66, 25, 'F');
          doc.rect(130, 45, 66, 25, 'S');
          doc.setFont('helvetica', 'bold');
          doc.text("Report Summary", 134, 51);
          doc.setFont('helvetica', 'normal');
          doc.text(`Filtered Bookings: ${totalCount}`, 134, 58);
          doc.text(`Source: Live Database`, 134, 64);
          
          // Data Table
          doc.autoTable({
            head: [['Patient Name', 'Patient ID', 'Email', 'Phone', 'Date & Time', 'Type', 'Status']],
            body: currentFilteredRows.map(item => [
              item.patientName,
              item.patientId,
              item.patientEmail,
              item.patientPhone,
              item.dateTime,
              item.appointmentType,
              item.status
            ]),
            startY: 78,
            theme: 'striped',
            headStyles: {
              fillColor: [15, 23, 42],
              textColor: [255, 255, 255],
              fontSize: 9,
              fontStyle: 'bold'
            },
            bodyStyles: {
              fontSize: 9,
              textColor: [30, 41, 59]
            },
            columnStyles: {
              0: { cellWidth: 32 },
              1: { cellWidth: 15 },
              2: { cellWidth: 40 },
              3: { cellWidth: 28 },
              4: { cellWidth: 40 },
              5: { cellWidth: 25 },
              6: { cellWidth: 20 }
            },
            alternateRowStyles: {
              fillColor: [248, 250, 252]
            },
            margin: { top: 78 }
          });
          
          // Footer
          const pageCount = doc.internal.getNumberOfPages();
          for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(`Page ${i} of ${pageCount}`, 196, 285, null, null, "right");
            doc.text("CONFIDENTIAL - FOR INTERNAL MEDICAL USE ONLY. Generated via Medicares Clinic API.", 14, 285);
          }
          
          doc.save(`Booking_History_Report_${docName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
          
          if (typeof MedicaresAPI.showToast === 'function') {
            MedicaresAPI.showToast("Report Downloaded", "PDF has been generated and saved successfully.", "success");
          } else {
            alert("PDF Downloaded successfully!");
          }
        } catch (err) {
          console.error("PDF generation failed:", err);
          alert("Error generating PDF. Please check console for details.");
        }
      });
    }

    // Modal popup helper methods
    window.showAppointmentDetailsModal = function(id) {
      let modal = document.getElementById('doctorReviewModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'doctorReviewModal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-card" style="padding: 0; max-width: 650px;">
            <div class="modal-header" style="background: linear-gradient(135deg, var(--surface) 30%, var(--background) 100%); border-bottom: 1px solid var(--border); padding: 1.5rem 1.8rem;">
              <h3 style="margin: 0; font-family: 'Poppins', sans-serif; font-size: 1.35rem; color: var(--text); font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Appointment Review
              </h3>
              <button class="button button--ghost" type="button" onclick="closeDoctorReviewModal()" style="min-height: auto; width: 32px; height: 32px; padding: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; line-height: 1;">✕</button>
            </div>
            <div class="modal-body" id="doctorReviewModalBody" style="padding: 1.8rem; background: var(--surface-strong);">
              <!-- Dynamically populated -->
            </div>
            <div class="modal-footer" style="padding: 1.2rem 1.8rem; background: linear-gradient(180deg, var(--surface-strong) 0%, var(--background) 100%); border-top: 1px solid var(--border);">
              <button class="button button--ghost" type="button" onclick="closeDoctorReviewModal()" style="min-height: 40px; padding: 0.5rem 1.5rem; font-size: 0.9rem;">Close</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeDoctorReviewModal();
        });
      }

      const row = rows.find(r => String(r.rawAppointment.id) === String(id));
      if (!row) return;

      const appt = row.rawAppointment;
      const body = document.getElementById('doctorReviewModalBody');
      body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          
          <div style="display: flex; gap: 1rem; align-items: center; padding-bottom: 1rem; border-bottom: 1px dashed var(--border);">
            <div class="avatar-xl" style="width: 54px; height: 54px; font-size: 1.25rem;">${MedicaresAPI.initials(appt.patientName)}</div>
            <div>
              <h4 style="margin: 0; font-size: 1.15rem; color: var(--text); font-weight: 700;">${MedicaresAPI.sanitizeText(appt.patientName)}</h4>
              <p class="muted" style="margin: 0.15rem 0 0 0; font-size: 0.85rem;">Patient ID: ${MedicaresAPI.sanitizeText(appt.patientId || 'N/A')}</p>
            </div>
          </div>

          <div style="display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));">
            <div>
              <h5 style="margin: 0 0 0.75rem 0; color: var(--primary); font-size: 0.95rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Contact Information</h5>
              <div style="display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.9rem;">
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--muted);">Email:</span> <strong style="color: var(--text); text-align: right;">${MedicaresAPI.sanitizeText(appt.patientEmail || 'N/A')}</strong></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--muted);">Phone:</span> <strong style="color: var(--text); text-align: right;">${MedicaresAPI.sanitizeText(appt.patientPhone || 'N/A')}</strong></div>
              </div>
            </div>
            
            <div>
              <h5 style="margin: 0 0 0.75rem 0; color: var(--primary); font-size: 0.95rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Consultation Details</h5>
              <div style="display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.9rem;">
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--muted);">Date & Time:</span> <strong style="color: var(--text); text-align: right;">${MedicaresAPI.sanitizeText(row.dateTime)}</strong></div>
                <div style="display: flex; justify-content: space-between; align-items: center;"><span style="color: var(--muted);">Type:</span> <span class="badge badge--info" style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; padding: 0.2rem 0.5rem;">${MedicaresAPI.sanitizeText(appt.appointmentType || 'Consultation')}</span></div>
                <div style="display: flex; justify-content: space-between; align-items: center;"><span style="color: var(--muted);">Status:</span> <span class="badge badge--${appt.status === 'BOOKED' ? 'success' : 'warning'}" style="font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.5rem;">${MedicaresAPI.sanitizeText(appt.status)}</span></div>
              </div>
            </div>
          </div>

          <div style="background: var(--background); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border); margin-top: 0.5rem;">
            <h5 style="margin: 0 0 0.5rem 0; color: var(--text); font-size: 0.9rem; font-weight: 700;">Consultation Reason & Symptoms</h5>
            <p style="margin: 0; font-size: 0.9rem; color: var(--muted); line-height: 1.5; font-style: italic;">
              "${MedicaresAPI.sanitizeText(appt.reason || 'No description provided by patient.')}"
            </p>
          </div>
        </div>
      `;

      modal.classList.add('open');
    };

    window.closeDoctorReviewModal = function() {
      const modal = document.getElementById('doctorReviewModal');
      if (modal) modal.classList.remove('open');
    };
  }

  function normalizeIdentity(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getPatientIdentityCandidates(user) {
    return Array.from(new Set([
      user.userId,
      user.id,
      user.email,
      user.fullName,
      user.name
    ].map(normalizeIdentity).filter(Boolean)));
  }

  function renderAdminDashboard(user, appointments, doctors, users) {
    renderAdminStats(user, appointments, doctors, users);
    renderAdminAnalytics(appointments, doctors, users);
    renderAdminUsers(users);
    renderAdminDoctors(doctors);
    renderAdminAppointments(appointments, doctors);
    renderHospitalsPlaceholder();
    bindUserCrud(users);
    bindDoctorCrud();
  }

  function renderAdminStats(user, appointments, doctors, users = []) {
    const container = document.querySelector('[data-admin-stats]');
    if (!container) return;

    const uniquePatients = new Set(appointments.map((item) => item.patientId).filter(Boolean));
    const userCount = Array.isArray(users) && users.length ? users.length : uniquePatients.size;
    const booked = appointments.filter((item) => item.status === 'BOOKED').length;
    const pending = appointments.filter((item) => item.status === 'PENDING').length;

    container.innerHTML = [
      ['Doctors', String(doctors.length), 'Registered in platform'],
      ['Users', String(userCount), 'Loaded from users or appointments API'],
      ['Appointments', String(appointments.length), `${booked} booked / ${pending} pending`],
      ['Active User', MedicaresAPI.sanitizeText(user.fullName || user.email || 'Admin'), 'Profile from /profile']
    ].map(([label, value, note]) => `
      <div class="stat-card">
        <p class="kpi-label">${label}</p>
        <p class="kpi-value">${value}</p>
        <p class="kpi-note">${note}</p>
      </div>
    `).join('');
  }

  function renderAdminAnalytics(appointments, doctors, users = []) {
    const panel = document.querySelector('[data-admin-analytics]');
    if (!panel) return;

    const upcoming = appointments.filter((item) => item.dateTimeMs >= Date.now()).length;
    panel.innerHTML = `
      <h3>Platform Analytics</h3>
      <p class="muted">Live overview generated from doctor and appointment APIs.</p>
      <div class="stack" style="margin-top:1rem;">
        <div class="badge badge--success">Users loaded: ${Array.isArray(users) ? users.length : 0}</div>
        <div class="badge badge--info">Upcoming appointments: ${upcoming}</div>
        <div class="badge badge--success">Doctors available: ${doctors.length}</div>
      </div>
    `;
  }

  function renderAdminUsers(users) {
    const table = document.querySelector('[data-admin-users]');
    if (!table) return;

    if (!users.length) {
      table.innerHTML = '<tr><td colspan="3" class="muted">No users found from /users or /admin/users.</td></tr>';
      return;
    }

    table.innerHTML = users.slice(0, 50).map((user) => {
      const normalized = normalizeUserRecord(user);
      return `
      <tr>
        <td>${MedicaresAPI.sanitizeText(normalized.name)}<div class="meta">${MedicaresAPI.sanitizeText(normalized.email || '-')}</div></td>
        <td>${MedicaresAPI.sanitizeText(normalized.role)}</td>
        <td><span class="badge badge--success">${MedicaresAPI.sanitizeText(normalized.status)}</span></td>
        <td>
          <button class="button button--ghost" type="button" data-admin-edit-user="${MedicaresAPI.sanitizeText(normalized.id)}" data-admin-user-name="${MedicaresAPI.sanitizeText(normalized.name)}" data-admin-user-email="${MedicaresAPI.sanitizeText(normalized.email)}" data-admin-user-role="${MedicaresAPI.sanitizeText(normalized.role)}" data-admin-user-status="${MedicaresAPI.sanitizeText(normalized.status)}">Edit</button>
          <button class="button button--primary" type="button" data-admin-delete-user="${MedicaresAPI.sanitizeText(normalized.id)}">Delete</button>
        </td>
      </tr>
      `;
    }).join('');
  }

  function renderAdminDoctors(doctors) {
    const table = document.querySelector('[data-admin-doctors]');
    if (!table) return;

    if (!doctors.length) {
      table.innerHTML = '<tr><td colspan="5" class="muted">No doctors found.</td></tr>';
      return;
    }

    table.innerHTML = doctors.map((doctor) => `
      <tr>
        <td>${MedicaresAPI.sanitizeText(doctor.name)}</td>
        <td>${MedicaresAPI.sanitizeText(doctor.specialization)}</td>
        <td>${MedicaresAPI.sanitizeText(doctor.hospital || 'N/A')}</td>
        <td>${MedicaresAPI.sanitizeText(doctor.id)}</td>
        <td>
          <button class="button button--ghost" type="button" data-admin-edit-doctor="${doctor.id}" data-admin-doctor-email="${MedicaresAPI.sanitizeText(doctor.email || '')}" data-admin-doctor-address="${MedicaresAPI.sanitizeText(doctor.address || '')}" data-admin-doctor-hospital="${MedicaresAPI.sanitizeText(doctor.hospital || '')}">Edit</button>
          <button class="button button--primary" type="button" data-admin-delete-doctor="${doctor.id}">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  function renderAdminAppointments(appointments, doctors) {
    const table = document.querySelector('[data-admin-appointments]');
    if (!table) return;

    if (!appointments.length) {
      table.innerHTML = '<tr><td colspan="5" class="muted">No appointments available.</td></tr>';
      return;
    }

    table.innerHTML = appointments.slice(0, 100).map((appointment) => {
      const doctor = doctors.find((item) => Number(item.id) === Number(appointment.doctorId));
      return `
        <tr>
          <td>${MedicaresAPI.sanitizeText(String(appointment.id))}</td>
          <td>${MedicaresAPI.sanitizeText(doctor?.name || appointment.doctorName || `Doctor #${appointment.doctorId}`)}</td>
          <td>
            ${MedicaresAPI.sanitizeText(appointment.patientName || 'N/A')}
            <div class="meta">ID: ${MedicaresAPI.sanitizeText(appointment.patientId || '-')}</div>
            <div class="meta">Phone: ${MedicaresAPI.sanitizeText(appointment.patientPhone || '-')}</div>
            <div class="meta">Type: ${MedicaresAPI.sanitizeText(appointment.appointmentType || 'Consultation')}</div>
          </td>
          <td>${MedicaresAPI.sanitizeText(appointmentLabel(appointment))}</td>
          <td><span class="badge badge--${appointment.status === 'BOOKED' ? 'success' : 'warning'}">${MedicaresAPI.sanitizeText(appointment.status)}</span></td>
        </tr>
      `;
    }).join('');
  }

  function renderHospitalsPlaceholder() {
    const table = document.querySelector('[data-admin-hospitals]');
    if (!table) return;
    table.innerHTML = '<tr><td colspan="3" class="muted">Hospital endpoints are not exposed in current API routes.</td></tr>';
  }

  function bindDoctorCrud() {
    const form = document.querySelector('[data-admin-doctor-form]');
    const idField = document.querySelector('[data-admin-doctor-id]');
    const nameField = document.querySelector('[data-admin-doctor-name]');
    const specializationField = document.querySelector('[data-admin-doctor-specialization]');
    const emailField = document.querySelector('[data-admin-doctor-email]');
    const addressField = document.querySelector('[data-admin-doctor-address]');
    const hospitalField = document.querySelector('[data-admin-doctor-hospital]');
    const cancelButton = document.querySelector('[data-admin-doctor-cancel]');

    document.querySelectorAll('[data-admin-edit-doctor]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = button.closest('tr');
        if (!row || !idField || !nameField || !specializationField || !emailField || !addressField || !hospitalField) return;
        idField.value = button.dataset.adminEditDoctor || '';
        nameField.value = row.children[0]?.textContent?.trim() || '';
        specializationField.value = row.children[1]?.textContent?.trim() || '';
        emailField.value = button.dataset.adminDoctorEmail || '';
        addressField.value = button.dataset.adminDoctorAddress || '';
        hospitalField.value = button.dataset.adminDoctorHospital || '';
      });
    });

    document.querySelectorAll('[data-admin-delete-doctor]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = String(button.dataset.adminDeleteDoctor || '').trim();
        if (!id) return;

        if (!confirm('Are you sure you want to delete this doctor?')) return;

        try {
          await MedicaresAPI.doctors.delete({ id });
          notify('Doctor deleted', 'Doctor removed successfully.', 'success');
          setTimeout(() => window.location.reload(), 800);
        } catch (error) {
          notify('Delete failed', error.message || 'Unable to delete doctor.', 'error');
        }
      });
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const id = String(idField?.value || '').trim();
      const name = String(nameField?.value || '').trim();
      const specialization = String(specializationField?.value || '').trim();
      const email = String(emailField?.value || '').trim();
      const address = String(addressField?.value || '').trim();
      const hospital = String(hospitalField?.value || '').trim();

      if (name.length < 3 || specialization.length < 3 || address.length < 3 || hospital.length < 3) {
        notify('Validation failed', 'Name, specialization, address, and hospital must be at least 3 characters.', 'error');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        notify('Validation failed', 'Enter a valid doctor email.', 'error');
        return;
      }

      const payload = { hospital, hospital_name: hospital, name, specialization, email, address };
      if (id) payload.id = id;

      try {
        if (id) {
          await MedicaresAPI.doctors.update(payload);
          notify('Doctor updated', 'Doctor updated successfully.', 'success');
        } else {
          await MedicaresAPI.doctors.create(payload);
          notify('Doctor added', 'Doctor added successfully.', 'success');
        }
        window.location.reload();
      } catch (error) {
        notify('Operation failed', error.message || 'Unable to save doctor.', 'error');
      }
    });

    cancelButton?.addEventListener('click', () => {
      if (idField) idField.value = '';
      if (nameField) nameField.value = '';
      if (specializationField) specializationField.value = '';
      if (emailField) emailField.value = '';
      if (addressField) addressField.value = '';
      if (hospitalField) hospitalField.value = '';
    });
  }

  function bindUserCrud(users) {
    const form = document.querySelector('[data-admin-user-form]');
    const idField = document.querySelector('[data-admin-user-id]');
    const nameField = document.querySelector('[data-admin-user-name]');
    const emailField = document.querySelector('[data-admin-user-email]');
    const roleField = document.querySelector('[data-admin-user-role]');
    const statusField = document.querySelector('[data-admin-user-status]');
    const cancelButton = document.querySelector('[data-admin-user-cancel]');

    document.querySelectorAll('[data-admin-edit-user]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!idField || !nameField || !emailField || !roleField || !statusField) return;
        idField.value = button.dataset.adminEditUser || '';
        nameField.value = button.dataset.adminUserName || '';
        emailField.value = button.dataset.adminUserEmail || '';
        roleField.value = button.dataset.adminUserRole || 'patient';
        statusField.value = button.dataset.adminUserStatus || 'Active';
      });
    });

    document.querySelectorAll('[data-admin-delete-user]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = String(button.dataset.adminDeleteUser || '').trim();
        if (!id) return;

        if (!confirm('Delete this user?')) return;

        try {
          await MedicaresAPI.users.delete({ id });
          notify('User deleted', 'User removed successfully.', 'success');
          window.location.reload();
        } catch (error) {
          notify('Delete failed', error.message || 'Unable to delete user.', 'error');
        }
      });
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const id = String(idField?.value || '').trim();
      const name = String(nameField?.value || '').trim();
      const email = String(emailField?.value || '').trim();
      const role = String(roleField?.value || 'patient').trim().toLowerCase();
      const status = String(statusField?.value || 'Active').trim();

      if (name.length < 3) {
        notify('Validation failed', 'User name must be at least 3 characters.', 'error');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        notify('Validation failed', 'Enter a valid email.', 'error');
        return;
      }

      const payload = { name, email, role, status };
      if (id) payload.id = id;

      try {
        if (id) {
          await MedicaresAPI.users.update(payload);
          notify('User updated', 'User updated successfully.', 'success');
        } else {
          await MedicaresAPI.users.create(payload);
          notify('User added', 'User created successfully.', 'success');
        }
        window.location.reload();
      } catch (error) {
        notify('Save failed', error.message || 'Unable to save user.', 'error');
      }
    });

    cancelButton?.addEventListener('click', () => {
      if (idField) idField.value = '';
      if (nameField) nameField.value = '';
      if (emailField) emailField.value = '';
      if (roleField) roleField.value = 'patient';
      if (statusField) statusField.value = 'Active';
    });
  }

  function showLoadingState(currentRole) {
    if (currentRole === 'patient') {
      const profile = document.querySelector('[data-profile-card]');
      const appointments = document.querySelector('[data-patient-appointments]');
      if (profile) profile.innerHTML = '<p class="muted">Loading profile...</p>';
      if (appointments) appointments.innerHTML = '<p class="muted">Loading appointments...</p>';
      return;
    }

    if (currentRole === 'doctor') {
      const stats = document.querySelector('[data-doctor-stats]');
      const table = document.querySelector('[data-doctor-patients]');
      if (stats) stats.innerHTML = '<p class="muted">Loading dashboard stats...</p>';
      if (table) table.innerHTML = '<tr><td colspan="4" class="muted">Loading appointments...</td></tr>';
      return;
    }

    const stats = document.querySelector('[data-admin-stats]');
    const doctors = document.querySelector('[data-admin-doctors]');
    if (stats) stats.innerHTML = '<p class="muted">Loading platform metrics...</p>';
    if (doctors) doctors.innerHTML = '<tr><td colspan="5" class="muted">Loading doctors...</td></tr>';
  }

  function showErrorState(currentRole, message) {
    notify('Dashboard error', message, 'error');

    if (currentRole === 'patient') {
      const appointments = document.querySelector('[data-patient-appointments]');
      if (appointments) appointments.innerHTML = `<div class="dashboard-empty"><h3>Unable to load</h3><p class="muted">${MedicaresAPI.sanitizeText(message)}</p></div>`;
    }

    if (currentRole === 'doctor') {
      const table = document.querySelector('[data-doctor-patients]');
      if (table) table.innerHTML = `<tr><td colspan="4" class="muted">${MedicaresAPI.sanitizeText(message)}</td></tr>`;
    }

    if (currentRole === 'admin') {
      const doctors = document.querySelector('[data-admin-doctors]');
      if (doctors) doctors.innerHTML = `<tr><td colspan="5" class="muted">${MedicaresAPI.sanitizeText(message)}</td></tr>`;
    }
  }
});
