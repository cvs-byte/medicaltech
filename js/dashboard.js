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
    if (!Array.isArray(items)) return [];
    return items.map((doctor) => ({
      id: doctor.id,
      name: doctor.name || doctor.fullName || 'Doctor',
      specialization: doctor.specialization || doctor.specialty || 'General',
      email: doctor.email || doctor.doctorEmail || doctor.contactEmail || '',
      address: doctor.address || doctor.location || doctor.hospital || '',
      hospital: doctor.hospital_name || doctor.hospital || doctor.location || doctor.address || 'N/A',
      location: doctor.location || doctor.address || doctor.hospital_name || doctor.hospital || 'N/A',
    }));
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

    profileCard.innerHTML = `
      <div class="profile-row">
        <div class="avatar-xl">${MedicaresAPI.initials(user.fullName || user.name || 'U')}</div>
        <div>
          <h3 style="margin:0;">${MedicaresAPI.sanitizeText(user.fullName || user.name || 'User')}</h3>
          <p class="muted" style="margin:0;">${MedicaresAPI.sanitizeText(user.email || '-')}</p>
        </div>
      </div>
      <div class="stack" style="margin-top:1rem;">
        <div class="dashboard-badge">Patient ID #${MedicaresAPI.sanitizeText(user.userId || '-')}</div>
        <p class="muted" style="margin:0;">Phone: ${MedicaresAPI.sanitizeText(user.phoneNumber || user.phone || user.phone_number || '-')}</p>
        <p class="muted" style="margin:0;">Gender: ${MedicaresAPI.sanitizeText(user.gender || '-')}</p>
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
      return `
        <div class="schedule-item">
          <strong>${MedicaresAPI.sanitizeText(doctor?.name || `Doctor #${appointment.doctorId}`)}</strong>
          <div class="meta">${MedicaresAPI.sanitizeText(doctor?.specialization || 'General')} • ${appointmentLabel(appointment)}</div>
          <div class="badge badge--info" style="margin-top:0.6rem;">${MedicaresAPI.sanitizeText(appointment.status)}</div>
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
      return `
        <div class="notification-item">
          <strong>${MedicaresAPI.sanitizeText(doctor?.name || `Doctor #${appointment.doctorId}`)}</strong>
          <div class="meta">${appointmentLabel(appointment)} • ${MedicaresAPI.sanitizeText(appointment.status)}</div>
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
    renderDoctorTable(relevantAppointments, doctors);
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
      return `
        <div class="schedule-item">
          <strong>${MedicaresAPI.sanitizeText(appointment.patientName || `Patient #${appointment.patientId || '-'}`)}</strong>
          <div class="meta">
            Email: ${MedicaresAPI.sanitizeText(appointment.patientEmail || 'N/A')}
            <br>
            Doctor: ${MedicaresAPI.sanitizeText(doctor?.name || appointment.doctorName || `Doctor #${appointment.doctorId}`)} (${MedicaresAPI.sanitizeText(doctor?.specialization || 'General')}) • ${appointmentLabel(appointment)}
          </div>
          <div class="badge badge--${appointment.status === 'BOOKED' ? 'success' : 'warning'}" style="margin-top:0.6rem;">${MedicaresAPI.sanitizeText(appointment.status)}</div>
        </div>
      `;
    }).join('');
  }

  function renderDoctorTable(appointments, doctors) {
    const table = document.querySelector('[data-doctor-patients]');
    const searchInput = document.querySelector('[data-patient-search]');
    if (!table) return;

    const rows = appointments.map((appointment) => {
      const doctor = doctors.find((item) => Number(item.id) === Number(appointment.doctorId));
      return {
        patientName: appointment.patientName || 'Patient',
        patientEmail: appointment.patientEmail || 'N/A',
        patientId: appointment.patientId || '-',
        detail: `Doctor: ${doctor?.name || appointment.doctorName || `Doctor #${appointment.doctorId}`} (${doctor?.specialization || 'General'}) • ${appointmentLabel(appointment)}`,
        time: MedicaresAPI.formatTime(appointment.time),
        status: appointment.status
      };
    });

    const draw = (query = '') => {
      const lowered = query.toLowerCase().trim();
      const filtered = lowered
        ? rows.filter((item) => `${item.patientName} ${item.patientEmail} ${item.patientId} ${item.detail}`.toLowerCase().includes(lowered))
        : rows;

      if (!filtered.length) {
        table.innerHTML = '<tr><td colspan="4" class="muted">No matching appointments found.</td></tr>';
        return;
      }

      table.innerHTML = filtered.map((item) => `
        <tr>
          <td>
            <strong>${MedicaresAPI.sanitizeText(item.patientName)}</strong>
            <div class="meta">Email: ${MedicaresAPI.sanitizeText(item.patientEmail)}</div>
            <div class="meta">ID: ${MedicaresAPI.sanitizeText(item.patientId)}</div>
            <div class="meta" style="margin-top:0.2rem;font-size:0.85rem;">${MedicaresAPI.sanitizeText(item.detail)}</div>
          </td>
          <td>${MedicaresAPI.sanitizeText(item.time)}</td>
          <td><span class="badge badge--${item.status === 'BOOKED' ? 'success' : 'warning'}">${MedicaresAPI.sanitizeText(item.status)}</span></td>
          <td>
            <button class="button button--ghost" type="button" disabled>Review</button>
            <button class="button button--primary" type="button" disabled>Accept</button>
          </td>
        </tr>
      `).join('');
    };

    draw();
    searchInput?.addEventListener('input', () => draw(searchInput.value));
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
          <td>${MedicaresAPI.sanitizeText(doctor?.name || `Doctor #${appointment.doctorId}`)}</td>
          <td>${MedicaresAPI.sanitizeText(appointment.patientId || '-')}</td>
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
        const id = Number(button.dataset.adminDeleteDoctor || 0);
        if (!id) return;

        if (!confirm('Delete this doctor?')) return;

        try {
          await MedicaresAPI.doctors.delete({ id });
          notify('Doctor deleted', 'Doctor removed successfully.', 'success');
          window.location.reload();
        } catch (error) {
          notify('Delete failed', error.message || 'Unable to delete doctor.', 'error');
        }
      });
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const id = Number(idField?.value || 0);
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
          notify('Doctor added', 'Doctor created successfully.', 'success');
        }
        window.location.reload();
      } catch (error) {
        notify('Save failed', error.message || 'Unable to save doctor.', 'error');
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
