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
    renderPatientReports(user, doctors);
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
          <div class="badge badge--${(appointment.status === 'COMPLETED' || appointment.prescriptionStatus === 'COMPLETED') ? 'success' : 'info'}">${(appointment.status === 'COMPLETED' || appointment.prescriptionStatus === 'COMPLETED') ? '✓ Prescription Completed' : MedicaresAPI.sanitizeText(appointment.status)}</div>
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
      const isDone = appointment.status === 'COMPLETED' || appointment.prescriptionStatus === 'COMPLETED';
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
          <div class="badge badge--${isDone ? 'success' : 'warning'}" style="display:inline-block;">${isDone ? '✓ Prescription Completed' : MedicaresAPI.sanitizeText(appointment.status)}</div>
        </div>
      `;
    }).join('');
  }

  function renderPatientReminders() {
    const reminders = document.querySelector('[data-patient-reminders]');
    if (!reminders) return;
    reminders.innerHTML = '<div class="dashboard-empty"><h3>No reminders configured</h3><p class="muted">Medicine reminder APIs are not connected in this module.</p></div>';
  }

  async function renderPatientReports(user, doctors) {
    const container = document.querySelector('[data-patient-reports]');
    const badge = document.querySelector('[data-reports-badge]');
    if (!container) return;

    const patientId = user.userId || user.id || '';
    const patientEmail = user.email || '';

    // Remove any stale/mock reports from localStorage so nothing is hardcoded on frontend
    try {
      localStorage.removeItem(MedicaresAPI.STORAGE_KEYS.medicalReports);
    } catch (e) {}

    try {
      const reports = await MedicaresAPI.medicalReports.listForPatient(patientId, patientEmail);
      if (badge) badge.textContent = `${reports.length} ${reports.length === 1 ? 'Report' : 'Reports'}`;

      if (!reports.length) {
        container.innerHTML = `
          <div class="dashboard-empty" style="padding: 2.2rem 1rem; text-align: center;">
            <h3 style="margin-bottom: 0.35rem; color: var(--text);">No medical reports available</h3>
            <p class="muted" style="margin: 0; font-size: 0.92rem;">After completing your consultations, your doctors will issue digital prescriptions and clinical reports here.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = reports.map((report) => {
        const docName = report.doctorName || 'Doctor';
        const consultDate = report.consultationDate || report.createdAt;
        const medicineCount = Array.isArray(report.medicines) ? report.medicines.length : 0;
        const isViewed = report.status === 'VIEWED';

        return `
          <div class="report-item" style="padding: 1.25rem 1.4rem; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); margin-bottom: 0.85rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; transition: transform 0.15s ease;">
            <div style="flex: 1; min-width: 260px;">
              <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
                <span class="badge badge--${isViewed ? 'success' : 'info'}" style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; padding: 0.2rem 0.5rem;">
                  ${MedicaresAPI.sanitizeText(report.status)}
                </span>
                <strong style="font-size: 1.05rem; color: var(--text);">${MedicaresAPI.sanitizeText(docName)}</strong>
              </div>
              <div class="meta" style="font-size: 0.86rem; margin-bottom: 0.35rem; color: var(--muted);">
                Consultation: <strong>${MedicaresAPI.formatDate(consultDate)}</strong> • Appt ID: ${MedicaresAPI.sanitizeText(report.appointmentId || '-')}
              </div>
              <div style="font-size: 0.92rem; color: var(--text);">
                <span style="color: var(--muted);">Diagnosis:</span> <strong>${MedicaresAPI.sanitizeText(report.diagnosis || 'General Consultation')}</strong>
              </div>
              ${medicineCount > 0 ? `<div style="margin-top: 0.35rem; font-size: 0.82rem; color: var(--primary); font-weight: 600;">💊 ${medicineCount} Medication${medicineCount > 1 ? 's' : ''} Prescribed</div>` : ''}
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
              <button class="button button--primary" type="button" onclick="openPatientReportModal('${report.reportId || report.id}')" style="min-height: 38px; padding: 0.45rem 1.2rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; border-radius: 8px;">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                View Report
              </button>
              <button class="button button--ghost" type="button" onclick="downloadPatientReportPdf('${report.reportId || report.id}')" style="min-height: 38px; padding: 0.45rem 0.9rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.35rem; border-radius: 8px;" title="Download PDF">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                PDF
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div class="dashboard-empty"><p class="muted">Unable to load medical reports at this time.</p></div>`;
    }
  }

  window.openPatientReportModal = async function(reportId) {
    let modal = document.getElementById('patientReportModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'patientReportModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-card modal-card--lg" style="padding: 0; max-width: 820px;">
          <div class="modal-header" style="background: linear-gradient(135deg, var(--surface) 30%, var(--background) 100%); border-bottom: 1px solid var(--border); padding: 1.4rem 1.8rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-size: 1.4rem;">🩺</span>
              <div>
                <h3 style="margin: 0; font-family: 'Poppins', sans-serif; font-size: 1.25rem; color: var(--text); font-weight: 700;">Medical Prescription &amp; Report</h3>
                <p class="muted" style="margin: 0.15rem 0 0 0; font-size: 0.82rem;">Official Clinical Consultation Record</p>
              </div>
            </div>
            <button class="button button--ghost" type="button" onclick="closePatientReportModal()" style="min-height: auto; width: 32px; height: 32px; padding: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; line-height: 1;">✕</button>
          </div>
          <div class="modal-body" id="patientReportModalBody" style="padding: 1.8rem; background: var(--surface-strong);">
            <p class="muted">Loading medical report...</p>
          </div>
          <div class="modal-footer" id="patientReportModalFooter" style="padding: 1.2rem 1.8rem; background: linear-gradient(180deg, var(--surface-strong) 0%, var(--background) 100%); border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <button class="button button--primary" type="button" id="patientReportDownloadPdfBtn" style="min-height: 40px; padding: 0.5rem 1.3rem; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 0.45rem;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download PDF Prescription
            </button>
            <button class="button button--ghost" type="button" onclick="closePatientReportModal()" style="min-height: 40px; padding: 0.5rem 1.5rem; font-size: 0.88rem;">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closePatientReportModal();
      });
    }

    const body = document.getElementById('patientReportModalBody');
    const downloadBtn = document.getElementById('patientReportDownloadPdfBtn');
    modal.classList.add('open');

    try {
      const report = await MedicaresAPI.medicalReports.getById(reportId);
      if (!report) {
        body.innerHTML = '<p class="muted">Report not found.</p>';
        return;
      }

      // Mark as VIEWED if previously SENT
      if (report.status === 'SENT') {
        await MedicaresAPI.medicalReports.markViewed(reportId);
        report.status = 'VIEWED';
        const user = MedicaresAPI.getAuthUser() || {};
        renderPatientReports(user, []);
      }

      if (downloadBtn) {
        downloadBtn.onclick = () => downloadPatientReportPdf(reportId);
      }

      // Format health metrics - show ONLY fields that were entered
      const metrics = report.healthMetrics || {};
      const activeMetrics = [];
      if (metrics.bloodPressure) activeMetrics.push(['Blood Pressure', `${metrics.bloodPressure} mmHg`]);
      if (metrics.bloodSugar) activeMetrics.push(['Blood Sugar', `${metrics.bloodSugar} mg/dL`]);
      if (metrics.temperature) activeMetrics.push(['Temperature', `${metrics.temperature} °F`]);
      if (metrics.pulseRate) activeMetrics.push(['Pulse Rate', `${metrics.pulseRate} bpm`]);
      if (metrics.spo2) activeMetrics.push(['Oxygen Saturation (SpO2)', `${metrics.spo2} %`]);
      if (metrics.weight) activeMetrics.push(['Weight', `${metrics.weight} kg`]);
      if (metrics.height) activeMetrics.push(['Height', `${metrics.height} cm`]);

      const medicines = Array.isArray(report.medicines) ? report.medicines : [];

      body.innerHTML = `
        <div class="prescription-sheet" style="border: 1px solid var(--border); background: var(--surface); border-radius: 18px; padding: 1.6rem;">
          
          <!-- Clinic & Consultation Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 1.25rem; border-bottom: 2px solid var(--border); flex-wrap: wrap; gap: 1rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span class="brand-mark" style="width: 26px; height: 26px; background: var(--primary); color: white; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem;">+</span>
                <strong style="font-size: 1.2rem; font-family: 'Poppins', sans-serif; color: var(--text);">MEDICARES HEALTH CLINIC</strong>
              </div>
              <p class="muted" style="margin: 0; font-size: 0.85rem;">Clinical Consultation &amp; Prescription Record</p>
            </div>
            <div style="text-align: right;">
              <span class="badge badge--success" style="font-weight: 700; text-transform: uppercase; font-size: 0.75rem;">Verified Medical Report</span>
              <p class="muted" style="margin: 0.35rem 0 0 0; font-size: 0.82rem;">Date: <strong>${MedicaresAPI.formatDate(report.consultationDate || report.createdAt)}</strong></p>
            </div>
          </div>

          <!-- Doctor & Patient Meta Details -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; padding: 1.25rem 0; border-bottom: 1px solid var(--border);">
            <div>
              <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: var(--primary);">Doctor Details</span>
              <h4 style="margin: 0.25rem 0 0.15rem 0; color: var(--text); font-size: 1.05rem;">${MedicaresAPI.sanitizeText(report.doctorName || 'Doctor')}</h4>
              <p class="muted" style="margin: 0; font-size: 0.85rem;">Doctor ID: #${MedicaresAPI.sanitizeText(report.doctorId || '-')}</p>
            </div>
            <div>
              <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: var(--primary);">Patient Information</span>
              <h4 style="margin: 0.25rem 0 0.15rem 0; color: var(--text); font-size: 1.05rem;">${MedicaresAPI.sanitizeText(report.patientName || 'Patient')}</h4>
              <p class="muted" style="margin: 0; font-size: 0.85rem;">Patient ID: #${MedicaresAPI.sanitizeText(report.patientId || '-')} • Appt #${MedicaresAPI.sanitizeText(report.appointmentId || '-')}</p>
            </div>
          </div>

          <!-- Diagnosis & Symptoms -->
          <div style="padding: 1.25rem 0; border-bottom: 1px solid var(--border);">
            <div style="background: rgba(37, 99, 235, 0.07); border-left: 4px solid var(--primary); padding: 1rem 1.2rem; border-radius: 12px; margin-bottom: 0.85rem;">
              <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: var(--primary); display: block; margin-bottom: 0.2rem;">Primary Clinical Diagnosis</span>
              <h3 style="margin: 0; font-size: 1.15rem; color: var(--text); font-weight: 700;">${MedicaresAPI.sanitizeText(report.diagnosis || 'General Consultation')}</h3>
            </div>
            
            ${report.symptoms ? `
              <div style="margin-bottom: 0.6rem; font-size: 0.9rem;">
                <strong style="color: var(--text);">Chief Complaint / Symptoms:</strong>
                <p style="margin: 0.2rem 0 0 0; color: var(--muted); line-height: 1.5;">${MedicaresAPI.sanitizeText(report.symptoms)}</p>
              </div>
            ` : ''}

            ${report.observations ? `
              <div style="margin-bottom: 0.6rem; font-size: 0.9rem;">
                <strong style="color: var(--text);">Health Observations:</strong>
                <p style="margin: 0.2rem 0 0 0; color: var(--muted); line-height: 1.5;">${MedicaresAPI.sanitizeText(report.observations)}</p>
              </div>
            ` : ''}

            ${report.clinicalNotes ? `
              <div style="font-size: 0.9rem;">
                <strong style="color: var(--text);">Clinical Notes:</strong>
                <p style="margin: 0.2rem 0 0 0; color: var(--muted); line-height: 1.5;">${MedicaresAPI.sanitizeText(report.clinicalNotes)}</p>
              </div>
            ` : ''}
          </div>

          <!-- Medicines / Prescriptions Table -->
          <div style="padding: 1.25rem 0; border-bottom: 1px solid var(--border);">
            <h4 style="margin: 0 0 0.85rem 0; font-size: 1rem; color: var(--primary); font-family: 'Poppins', sans-serif; display: flex; align-items: center; gap: 0.4rem;">
              <span>💊</span> Prescribed Medicines &amp; Tablets
            </h4>

            ${medicines.length ? `
              <div style="overflow-x: auto;">
                <table class="table" style="width: 100%; border-collapse: collapse; font-size: 0.88rem;">
                  <thead>
                    <tr style="background: var(--surface-strong); border-bottom: 2px solid var(--border);">
                      <th style="padding: 0.65rem 0.85rem; text-align: left; font-size: 0.8rem; text-transform: uppercase;">Medicine</th>
                      <th style="padding: 0.65rem 0.85rem; text-align: left; font-size: 0.8rem; text-transform: uppercase;">Type</th>
                      <th style="padding: 0.65rem 0.85rem; text-align: left; font-size: 0.8rem; text-transform: uppercase;">Dosage</th>
                      <th style="padding: 0.65rem 0.85rem; text-align: left; font-size: 0.8rem; text-transform: uppercase;">Frequency</th>
                      <th style="padding: 0.65rem 0.85rem; text-align: left; font-size: 0.8rem; text-transform: uppercase;">Timing</th>
                      <th style="padding: 0.65rem 0.85rem; text-align: left; font-size: 0.8rem; text-transform: uppercase;">Duration</th>
                      <th style="padding: 0.65rem 0.85rem; text-align: left; font-size: 0.8rem; text-transform: uppercase;">Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${medicines.map(m => `
                      <tr style="border-bottom: 1px solid var(--border);">
                        <td style="padding: 0.75rem 0.85rem; font-weight: 600; color: var(--text);">
                          ${MedicaresAPI.sanitizeText(m.medicineName)}
                          ${m.quantity ? `<div style="font-size: 0.78rem; color: var(--muted); font-weight: normal;">Qty: ${MedicaresAPI.sanitizeText(m.quantity)}</div>` : ''}
                        </td>
                        <td style="padding: 0.75rem 0.85rem;"><span class="badge badge--info" style="font-size: 0.75rem;">${MedicaresAPI.sanitizeText(m.type || 'Tablet')}</span></td>
                        <td style="padding: 0.75rem 0.85rem;">${MedicaresAPI.sanitizeText(m.dosage || '-')}</td>
                        <td style="padding: 0.75rem 0.85rem;">${MedicaresAPI.sanitizeText(m.frequency || '-')}</td>
                        <td style="padding: 0.75rem 0.85rem;">${MedicaresAPI.sanitizeText(m.timing || '-')}</td>
                        <td style="padding: 0.75rem 0.85rem;">${MedicaresAPI.sanitizeText(m.duration || '-')}</td>
                        <td style="padding: 0.75rem 0.85rem;">
                          ${m.foodInstruction ? `<strong>${MedicaresAPI.sanitizeText(m.foodInstruction)}</strong>` : ''}
                          ${m.instructions ? `<div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.15rem;">${MedicaresAPI.sanitizeText(m.instructions)}</div>` : ''}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <p class="muted" style="margin: 0; font-size: 0.9rem; font-style: italic;">No medications prescribed. Please follow clinical observations and advice below.</p>
            `}
          </div>

          <!-- Health Metrics (Optional - Only Rendered If Entered) -->
          ${activeMetrics.length ? `
            <div style="padding: 1.25rem 0; border-bottom: 1px solid var(--border);">
              <h4 style="margin: 0 0 0.85rem 0; font-size: 1rem; color: var(--primary); font-family: 'Poppins', sans-serif; display: flex; align-items: center; gap: 0.4rem;">
                <span>📊</span> Recorded Health Metrics &amp; Vitals
              </h4>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.85rem;">
                ${activeMetrics.map(([lbl, val]) => `
                  <div style="background: var(--background); border: 1px solid var(--border); border-radius: 12px; padding: 0.75rem 0.95rem;">
                    <span class="muted" style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 0.2rem;">${lbl}</span>
                    <strong style="font-size: 1.05rem; color: var(--text);">${MedicaresAPI.sanitizeText(val)}</strong>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Allergies & Existing Conditions -->
          ${report.allergies || report.existingConditions ? `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; padding: 1.25rem 0; border-bottom: 1px solid var(--border);">
              ${report.allergies ? `
                <div style="background: rgba(239, 68, 68, 0.08); border-left: 3px solid #ef4444; border-radius: 10px; padding: 0.75rem 1rem;">
                  <strong style="color: #ef4444; font-size: 0.85rem; text-transform: uppercase; display: block; margin-bottom: 0.2rem;">Allergies</strong>
                  <div style="font-size: 0.9rem; color: var(--text);">${MedicaresAPI.sanitizeText(report.allergies)}</div>
                </div>
              ` : ''}
              ${report.existingConditions ? `
                <div style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; border-radius: 10px; padding: 0.75rem 1rem;">
                  <strong style="color: #f59e0b; font-size: 0.85rem; text-transform: uppercase; display: block; margin-bottom: 0.2rem;">Existing Conditions</strong>
                  <div style="font-size: 0.9rem; color: var(--text);">${MedicaresAPI.sanitizeText(report.existingConditions)}</div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Doctor's Advice & Follow-Up -->
          <div style="padding: 1.25rem 0;">
            ${report.advice ? `
              <div style="margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.4rem 0; font-size: 0.95rem; color: var(--text); font-weight: 700;">Doctor's Health Advice &amp; Instructions:</h4>
                <div style="background: var(--background); border: 1px solid var(--border); border-radius: 12px; padding: 0.95rem 1.15rem; font-size: 0.92rem; color: var(--text); line-height: 1.55;">
                  ${MedicaresAPI.sanitizeText(report.advice)}
                </div>
              </div>
            ` : ''}

            ${report.followUpDate ? `
              <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.92rem; color: var(--text); margin-top: 0.75rem;">
                <span>📅</span> <strong>Next Follow-up Consultation:</strong>
                <span class="badge badge--warning" style="font-size: 0.85rem; font-weight: 700;">${MedicaresAPI.formatDate(report.followUpDate)}</span>
              </div>
            ` : ''}
          </div>

          <!-- Doctor Digital Sign-off -->
          <div style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 2px dashed var(--border); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
            <div>
              <p class="muted" style="margin: 0; font-size: 0.78rem;">Generated electronically via Medicares Clinical Healthcare Portal</p>
              <p class="muted" style="margin: 0.15rem 0 0 0; font-size: 0.78rem;">Report ID: ${MedicaresAPI.sanitizeText(report.reportId || report.id)}</p>
            </div>
            <div style="text-align: right;">
              <div style="font-family: 'Poppins', sans-serif; font-size: 1.05rem; font-weight: 700; color: var(--primary);">${MedicaresAPI.sanitizeText(report.doctorName || 'Authorized Physician')}</div>
              <p class="muted" style="margin: 0.15rem 0 0 0; font-size: 0.78rem;">Authorized Medical Staff Digital Sign-off</p>
            </div>
          </div>

        </div>
      `;
    } catch (err) {
      body.innerHTML = `<div class="dashboard-empty"><p class="muted">${MedicaresAPI.sanitizeText(err.message || 'Error loading report.')}</p></div>`;
    }
  };

  window.closePatientReportModal = function() {
    const modal = document.getElementById('patientReportModal');
    if (modal) modal.classList.remove('open');
  };

  window.downloadPatientReportPdf = async function(reportId) {
    try {
      const report = await MedicaresAPI.medicalReports.getById(reportId);
      if (!report) {
        alert('Unable to locate report for download.');
        return;
      }

      if (!window.jspdf) {
        window.print();
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      const docName = report.doctorName || 'Doctor';
      const patientName = report.patientName || 'Patient';
      const dateStr = report.consultationDate || new Date().toISOString().split('T')[0];

      // Header Banner
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, 210, 42, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text("MEDICARES HEALTHCARE CLINIC", 14, 18);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text("OFFICIAL MEDICAL PRESCRIPTION & CONSULTATION REPORT", 14, 26);
      doc.text(`Consultation Date: ${dateStr}   |   Report ID: ${report.reportId || report.id}`, 14, 34);

      // Meta Block
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text("Physician Details", 14, 52);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Doctor Name: ${docName}`, 14, 58);
      doc.text(`Doctor ID:   #${report.doctorId || '-'}`, 14, 64);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text("Patient Details", 120, 52);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Patient Name: ${patientName}`, 120, 58);
      doc.text(`Patient ID:   #${report.patientId || '-'}`, 120, 64);
      doc.text(`Appt ID:      #${report.appointmentId || '-'}`, 120, 70);

      // Diagnosis Box
      doc.setFillColor(241, 245, 249);
      doc.rect(14, 76, 182, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(37, 99, 235);
      doc.text("CLINICAL DIAGNOSIS:", 18, 84);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(String(report.diagnosis || 'General Consultation'), 64, 84);

      let currentY = 100;

      // Medicines Table
      const medicines = Array.isArray(report.medicines) ? report.medicines : [];
      if (medicines.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text("Prescribed Medicines & Tablets (Rx)", 14, currentY);

        doc.autoTable({
          head: [['Medicine Name', 'Type', 'Dosage', 'Frequency', 'Timing', 'Duration', 'Instructions']],
          body: medicines.map(m => [
            m.medicineName,
            m.type || 'Tablet',
            m.dosage || '-',
            m.frequency || '-',
            m.timing || '-',
            m.duration || '-',
            `${m.foodInstruction || ''} ${m.instructions ? `(${m.instructions})` : ''}`.trim() || '-'
          ]),
          startY: currentY + 4,
          theme: 'striped',
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 }
        });

        currentY = doc.lastAutoTable.finalY + 12;
      }

      // Health Metrics
      const m = report.healthMetrics || {};
      const activeMetrics = [];
      if (m.bloodPressure) activeMetrics.push(`BP: ${m.bloodPressure} mmHg`);
      if (m.bloodSugar) activeMetrics.push(`Sugar: ${m.bloodSugar} mg/dL`);
      if (m.temperature) activeMetrics.push(`Temp: ${m.temperature} °F`);
      if (m.pulseRate) activeMetrics.push(`Pulse: ${m.pulseRate} bpm`);
      if (m.spo2) activeMetrics.push(`SpO2: ${m.spo2}%`);
      if (m.weight) activeMetrics.push(`Weight: ${m.weight} kg`);
      if (m.height) activeMetrics.push(`Height: ${m.height} cm`);

      if (activeMetrics.length) {
        if (currentY > 240) { doc.addPage(); currentY = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text("Recorded Vitals & Health Metrics:", 14, currentY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(activeMetrics.join('   |   '), 14, currentY + 6);
        currentY += 16;
      }

      // Advice & Follow Up
      if (report.advice || report.followUpDate) {
        if (currentY > 240) { doc.addPage(); currentY = 20; }
        if (report.advice) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text("Doctor's Health Advice:", 14, currentY);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          const splitAdvice = doc.splitTextToSize(report.advice, 180);
          doc.text(splitAdvice, 14, currentY + 6);
          currentY += (splitAdvice.length * 5) + 10;
        }

        if (report.followUpDate) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(217, 119, 6);
          doc.text(`Next Follow-up Date: ${report.followUpDate}`, 14, currentY);
          doc.setTextColor(15, 23, 42);
          currentY += 10;
        }
      }

      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${pageCount}`, 196, 285, null, null, "right");
        doc.text("CONFIDENTIAL MEDICAL PRESCRIPTION - ISSUED VIA MEDICARES HEALTH PORTAL", 14, 285);
      }

      doc.save(`Medical_Report_${patientName.replace(/\s+/g, '_')}_${dateStr}.pdf`);
    } catch (err) {
      console.error('PDF download error:', err);
      window.print();
    }
  };

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
          <div class="badge badge--${(appointment.status === 'COMPLETED' || appointment.prescriptionStatus === 'COMPLETED') ? 'success' : appointment.status === 'BOOKED' ? 'info' : 'warning'}" style="margin-top:0.6rem;">${(appointment.status === 'COMPLETED' || appointment.prescriptionStatus === 'COMPLETED') ? '✓ Prescription Completed' : MedicaresAPI.sanitizeText(appointment.status)}</div>
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

    const isAppointmentPrescriptionDone = (item) => {
      const status = String(item?.status || item?.rawAppointment?.status || '').toUpperCase();
      const prescriptionStatus = String(item?.prescriptionStatus || item?.rawAppointment?.prescriptionStatus || '').toUpperCase();
      if (status === 'COMPLETED' || status === 'PRESCRIPTION COMPLETED' || prescriptionStatus === 'COMPLETED') return true;
      try {
        const localReports = MedicaresAPI.loadLocalList(MedicaresAPI.STORAGE_KEYS.medicalReports, []);
        const apptId = String(item?.rawAppointment?.id || item?.id || '');
        return localReports.some(r =>
          String(r.appointmentId) === apptId &&
          (r.status === 'SENT' || r.status === 'VIEWED' || r.status === 'COMPLETED')
        );
      } catch {
        return false;
      }
    };

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

      table.innerHTML = pageRows.map((item) => {
        const isDone = isAppointmentPrescriptionDone(item);
        return `
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
            <span class="badge badge--${isDone ? 'success' : item.status === 'BOOKED' ? 'info' : 'warning'}" style="font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.55rem; display: inline-flex; align-items: center; gap: 0.25rem;">
              ${isDone ? '✓ Prescription Completed' : MedicaresAPI.sanitizeText(item.status)}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
              <button class="button button--ghost" type="button" onclick="showAppointmentDetailsModal('${item.rawAppointment.id || ''}')" style="padding: 0.35rem 0.65rem; font-size: 0.8rem; min-height: auto; border-radius: 8px;">Review</button>
              <button class="button ${isDone ? 'button--ghost' : 'button--primary'}" type="button" onclick="openDoctorReportModal('${item.rawAppointment.id || ''}')" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; min-height: auto; border-radius: 8px; display: inline-flex; align-items: center; gap: 0.35rem; ${isDone ? 'border-color: rgba(16, 185, 129, 0.4); color: #10b981;' : ''}">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                ${isDone ? '✓ Prescription Done' : 'Prescription / Report'}
              </button>
            </div>
          </td>
        </tr>
      `;
      }).join('');

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
            <div class="modal-footer" id="doctorReviewModalFooter" style="padding: 1.2rem 1.8rem; background: linear-gradient(180deg, var(--surface-strong) 0%, var(--background) 100%); border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
              <button class="button button--primary" type="button" id="doctorReviewReportActionBtn" style="min-height: 40px; padding: 0.5rem 1.2rem; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 0.45rem;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                Generate Medical Report
              </button>
              <button class="button button--ghost" type="button" onclick="closeDoctorReviewModal()" style="min-height: 40px; padding: 0.5rem 1.5rem; font-size: 0.88rem;">Close</button>
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
      const isDone = isAppointmentPrescriptionDone(row);
      const body = document.getElementById('doctorReviewModalBody');
      const actionBtn = document.getElementById('doctorReviewReportActionBtn');
      if (actionBtn) {
        actionBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          ${isDone ? 'View / Edit Prescription' : 'Generate Medical Report'}
        `;
        actionBtn.onclick = () => {
          closeDoctorReviewModal();
          openDoctorReportModal(appt.id);
        };
      }

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
                <div style="display: flex; justify-content: space-between; align-items: center;"><span style="color: var(--muted);">Status:</span> <span class="badge badge--${isDone ? 'success' : appt.status === 'BOOKED' ? 'info' : 'warning'}" style="font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.5rem;">${isDone ? '✓ Prescription Completed' : MedicaresAPI.sanitizeText(appt.status)}</span></div>
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

    // Doctor Medical Report Modal Implementation
    window.openDoctorReportModal = async function(appointmentId) {
      const apptRow = rows.find(r => String(r.rawAppointment.id) === String(appointmentId));
      const appt = apptRow ? apptRow.rawAppointment : null;
      if (!appt) {
        alert('Appointment details not found.');
        return;
      }

      let modal = document.getElementById('doctorReportModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'doctorReportModal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-card modal-card--lg" style="padding: 0; max-width: 860px;">
            <div class="modal-header" style="background: linear-gradient(135deg, var(--surface) 30%, var(--background) 100%); border-bottom: 1px solid var(--border); padding: 1.4rem 1.8rem;">
              <div style="display: flex; align-items: center; gap: 0.6rem;">
                <span style="font-size: 1.4rem;">📝</span>
                <div>
                  <h3 style="margin: 0; font-family: 'Poppins', sans-serif; font-size: 1.25rem; color: var(--text); font-weight: 700;" id="doctorReportModalTitle">Generate Medical Report &amp; Prescription</h3>
                  <p class="muted" style="margin: 0.15rem 0 0 0; font-size: 0.82rem;" id="doctorReportModalSubtitle">Patient Consultation Form</p>
                </div>
              </div>
              <button class="button button--ghost" type="button" onclick="closeDoctorReportModal()" style="min-height: auto; width: 32px; height: 32px; padding: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; line-height: 1;">✕</button>
            </div>
            <div class="modal-body" id="doctorReportModalBody" style="padding: 1.8rem; background: var(--surface-strong); max-height: calc(85vh - 140px); overflow-y: auto;">
              <!-- Dynamically populated report form -->
            </div>
            <div class="modal-footer" id="doctorReportModalFooter" style="padding: 1.2rem 1.8rem; background: linear-gradient(180deg, var(--surface-strong) 0%, var(--background) 100%); border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
              <div id="doctorReportStatusNote" style="font-size: 0.82rem; color: var(--muted);"></div>
              <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
                <button class="button button--ghost" type="button" id="doctorReportSaveDraftBtn" style="min-height: 40px; padding: 0.5rem 1.25rem; font-size: 0.88rem;">Save Report (Draft)</button>
                <button class="button button--primary" type="button" id="doctorReportSendPatientBtn" style="min-height: 40px; padding: 0.5rem 1.4rem; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 0.45rem;">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  Save &amp; Send to Patient
                </button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeDoctorReportModal();
        });
      }

      const body = document.getElementById('doctorReportModalBody');
      const saveDraftBtn = document.getElementById('doctorReportSaveDraftBtn');
      const sendPatientBtn = document.getElementById('doctorReportSendPatientBtn');
      const statusNote = document.getElementById('doctorReportStatusNote');

      body.innerHTML = '<p class="muted">Loading patient record...</p>';
      modal.classList.add('open');

      // Fetch any existing report for this appointment
      const existingReport = await MedicaresAPI.medicalReports.getByAppointmentId(appt.id);

      const doctorName = user?.fullName || user?.name || appt.doctorName || 'Doctor';
      const doctorId = user?.userId || user?.id || appt.doctorId || '';
      const doctorEmail = user?.email || appt.doctorEmail || '';

      const patientName = appt.patientName || 'Patient';
      const patientId = appt.patientId || appt.patientEmail || '';
      const patientEmail = appt.patientEmail || '';
      const consultationDate = appt.date || new Date().toISOString().split('T')[0];

      // In-memory medicines array
      let medicines = existingReport?.medicines && existingReport.medicines.length
        ? JSON.parse(JSON.stringify(existingReport.medicines))
        : [{
            medicineName: '',
            type: 'Tablet',
            dosage: '1 tablet',
            quantity: '10 tablets',
            frequency: '2 times daily',
            timing: 'Morning and Night',
            duration: '5 days',
            foodInstruction: 'After food',
            instructions: 'Take with water'
          }];

      const existingMetrics = existingReport?.healthMetrics || {};
      const isAlreadyCompleted = isAppointmentPrescriptionDone({ rawAppointment: appt, status: appt.status });

      if (statusNote) {
        if (isAlreadyCompleted || (existingReport && (existingReport.status === 'SENT' || existingReport.status === 'VIEWED'))) {
          statusNote.innerHTML = `Current Status: <strong class="badge badge--success">✓ Prescription Completed (${existingReport?.status || 'SENT'})</strong>`;
        } else if (existingReport) {
          statusNote.innerHTML = `Current Status: <strong class="badge badge--warning">${existingReport.status}</strong>`;
        } else {
          statusNote.innerHTML = `Creating fresh medical report for appointment #${MedicaresAPI.sanitizeText(appt.id)}`;
        }
      }

      if (sendPatientBtn && (isAlreadyCompleted || (existingReport && (existingReport.status === 'SENT' || existingReport.status === 'VIEWED')))) {
        sendPatientBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          Update &amp; Re-send Prescription
        `;
      }

      body.innerHTML = `
        <form id="doctorReportForm" onsubmit="return false;" style="display: flex; flex-direction: column; gap: 1.5rem;">
          
          <!-- Section 1: Patient Information -->
          <div class="form-section">
            <div class="form-section-title">
              <span>👤</span> Patient &amp; Consultation Information
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; background: var(--background); padding: 1.1rem; border-radius: 14px; border: 1px solid var(--border);">
              <div>
                <span class="muted" style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700;">Patient Name</span>
                <div style="font-weight: 600; color: var(--text); font-size: 0.95rem;">${MedicaresAPI.sanitizeText(patientName)}</div>
              </div>
              <div>
                <span class="muted" style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700;">Patient ID</span>
                <div style="font-weight: 600; color: var(--text); font-size: 0.95rem;">#${MedicaresAPI.sanitizeText(patientId || '-')}</div>
              </div>
              <div>
                <span class="muted" style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700;">Appointment ID</span>
                <div style="font-weight: 600; color: var(--text); font-size: 0.95rem;">#${MedicaresAPI.sanitizeText(appt.id)}</div>
              </div>
              <div>
                <span class="muted" style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700;">Doctor Name</span>
                <div style="font-weight: 600; color: var(--text); font-size: 0.95rem;">${MedicaresAPI.sanitizeText(doctorName)}</div>
              </div>
              <div>
                <span class="muted" style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700;">Consultation Date</span>
                <div style="font-weight: 600; color: var(--text); font-size: 0.95rem;">${MedicaresAPI.formatDate(consultationDate)}</div>
              </div>
            </div>
          </div>

          <!-- Section 2: Diagnosis / Health Information -->
          <div class="form-section">
            <div class="form-section-title">
              <span>🩺</span> Diagnosis &amp; Clinical Information
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
              <div>
                <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; color: var(--text);">
                  Diagnosis <span style="color: #ef4444;">*</span>
                </label>
                <input class="input" id="reportDiagnosis" type="text" placeholder="e.g. Acute Upper Respiratory Tract Infection" value="${MedicaresAPI.sanitizeText(existingReport?.diagnosis || '')}" style="margin: 0;" required />
              </div>
              <div>
                <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; color: var(--text);">
                  Chief Complaint / Symptoms
                </label>
                <input class="input" id="reportSymptoms" type="text" placeholder="e.g. High fever, productive cough, headache" value="${MedicaresAPI.sanitizeText(existingReport?.symptoms || appt.reason || '')}" style="margin: 0;" />
              </div>
              <div>
                <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; color: var(--text);">
                  Health Observations
                </label>
                <input class="input" id="reportObservations" type="text" placeholder="e.g. Throat congested, bilateral chest clear" value="${MedicaresAPI.sanitizeText(existingReport?.observations || '')}" style="margin: 0;" />
              </div>
              <div>
                <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; color: var(--text);">
                  Additional Clinical Notes
                </label>
                <input class="input" id="reportClinicalNotes" type="text" placeholder="e.g. Advised hydration and complete bed rest" value="${MedicaresAPI.sanitizeText(existingReport?.clinicalNotes || '')}" style="margin: 0;" />
              </div>
            </div>
          </div>

          <!-- Section 3: Dynamic Medicines / Tablets -->
          <div class="form-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem; flex-wrap: wrap; gap: 0.5rem;">
              <div class="form-section-title" style="margin: 0;">
                <span>💊</span> Prescribed Medicines &amp; Tablets
              </div>
              <button class="button button--ghost" type="button" id="addMedicineBtn" style="padding: 0.35rem 0.85rem; font-size: 0.82rem; min-height: auto; border-radius: 8px; display: inline-flex; align-items: center; gap: 0.35rem;">
                <span>+</span> Add Medicine
              </button>
            </div>
            
            <div id="doctorMedicinesList" style="display: flex; flex-direction: column; gap: 0.85rem;">
              <!-- Dynamically populated medicine items -->
            </div>
          </div>

          <!-- Section 4: Additional Optional Health Metrics -->
          <div class="form-section">
            <div class="form-section-title">
              <span>📊</span> Additional Health Metrics <span style="font-size: 0.8rem; font-weight: normal; color: var(--muted);">(Optional - enter only available readings)</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0.85rem;">
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--muted);">Blood Pressure</label>
                <input class="input" id="metricBp" type="text" placeholder="e.g. 120/80" value="${MedicaresAPI.sanitizeText(existingMetrics.bloodPressure || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--muted);">Blood Sugar (mg/dL)</label>
                <input class="input" id="metricSugar" type="text" placeholder="e.g. 98" value="${MedicaresAPI.sanitizeText(existingMetrics.bloodSugar || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--muted);">Temperature (°F)</label>
                <input class="input" id="metricTemp" type="text" placeholder="e.g. 98.6" value="${MedicaresAPI.sanitizeText(existingMetrics.temperature || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--muted);">Pulse Rate (bpm)</label>
                <input class="input" id="metricPulse" type="text" placeholder="e.g. 78" value="${MedicaresAPI.sanitizeText(existingMetrics.pulseRate || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--muted);">SpO2 Saturation (%)</label>
                <input class="input" id="metricSpo2" type="text" placeholder="e.g. 98" value="${MedicaresAPI.sanitizeText(existingMetrics.spo2 || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--muted);">Weight (kg)</label>
                <input class="input" id="metricWeight" type="text" placeholder="e.g. 68" value="${MedicaresAPI.sanitizeText(existingMetrics.weight || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--muted);">Height (cm)</label>
                <input class="input" id="metricHeight" type="text" placeholder="e.g. 172" value="${MedicaresAPI.sanitizeText(existingMetrics.height || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-top: 1rem;">
              <div>
                <label style="display: block; font-size: 0.82rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--muted);">Known Allergies (Optional)</label>
                <input class="input" id="reportAllergies" type="text" placeholder="e.g. Penicillin, Sulfa drugs, Peanuts" value="${MedicaresAPI.sanitizeText(existingReport?.allergies || '')}" style="margin: 0;" />
              </div>
              <div>
                <label style="display: block; font-size: 0.82rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--muted);">Existing Chronic Conditions (Optional)</label>
                <input class="input" id="reportExistingConditions" type="text" placeholder="e.g. Hypertension, Type-2 Diabetes" value="${MedicaresAPI.sanitizeText(existingReport?.existingConditions || '')}" style="margin: 0;" />
              </div>
            </div>
          </div>

          <!-- Section 5: Advice & Follow-Up -->
          <div class="form-section">
            <div class="form-section-title">
              <span>📋</span> Health Advice &amp; Follow-up
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
              <div>
                <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; color: var(--text);">Doctor's Health Advice &amp; Lifestyle Guidance</label>
                <textarea class="input" id="reportAdvice" rows="2" placeholder="e.g. Drink 3L warm water daily, avoid oily foods, finish antibiotic course" style="margin: 0; resize: vertical; min-height: 56px;">${MedicaresAPI.sanitizeText(existingReport?.advice || '')}</textarea>
              </div>
              <div>
                <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; color: var(--text);">Follow-up Consultation Date (Optional)</label>
                <input class="input" id="reportFollowUpDate" type="date" value="${MedicaresAPI.sanitizeText(existingReport?.followUpDate || '')}" style="margin: 0;" />
              </div>
            </div>
          </div>

        </form>
      `;

      // Helper to render medicines
      const medicinesListContainer = document.getElementById('doctorMedicinesList');
      const addMedBtn = document.getElementById('addMedicineBtn');

      function renderMedicinesUI() {
        if (!medicinesListContainer) return;

        if (!medicines.length) {
          medicinesListContainer.innerHTML = `
            <div style="text-align: center; padding: 1.25rem; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted);">
              No medicines added. Click "+ Add Medicine" if prescribing medication.
            </div>
          `;
          return;
        }

        medicinesListContainer.innerHTML = medicines.map((med, index) => `
          <div class="medicine-row-card" style="background: var(--background); border: 1px solid var(--border); border-radius: 14px; padding: 1rem; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span class="badge badge--info" style="font-size: 0.75rem; font-weight: 700;">Medicine #${index + 1}</span>
              <button type="button" class="button button--ghost" data-remove-med="${index}" style="min-height: auto; padding: 0.2rem 0.6rem; font-size: 0.75rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
                ✕ Remove
              </button>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem;">
              <div style="grid-column: span 1;">
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.2rem; color: var(--text);">
                  Medicine Name <span style="color: #ef4444;">*</span>
                </label>
                <input class="input" type="text" data-med-field="medicineName" data-med-index="${index}" placeholder="e.g. Paracetamol 500mg" value="${MedicaresAPI.sanitizeText(med.medicineName || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>

              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.2rem; color: var(--text);">Form / Type</label>
                <select class="input select" data-med-field="type" data-med-index="${index}" style="margin: 0; font-size: 0.88rem;">
                  ${['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Inhaler', 'Suspension', 'Other'].map(t => `
                    <option value="${t}" ${med.type === t ? 'selected' : ''}>${t}</option>
                  `).join('')}
                </select>
              </div>

              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.2rem; color: var(--text);">Dosage</label>
                <input class="input" type="text" data-med-field="dosage" data-med-index="${index}" placeholder="e.g. 1 tablet, 500mg, 5ml" value="${MedicaresAPI.sanitizeText(med.dosage || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>

              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.2rem; color: var(--text);">Quantity</label>
                <input class="input" type="text" data-med-field="quantity" data-med-index="${index}" placeholder="e.g. 10 tablets, 1 bottle" value="${MedicaresAPI.sanitizeText(med.quantity || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>

              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.2rem; color: var(--text);">Frequency</label>
                <select class="input select" data-med-field="frequency" data-med-index="${index}" style="margin: 0; font-size: 0.88rem;">
                  ${['1 time daily', '2 times daily', '3 times daily', '4 times daily', 'Every 4 hours', 'Every 6 hours', 'Every 8 hours', 'Once a week', 'As needed (SOS)'].map(f => `
                    <option value="${f}" ${med.frequency === f ? 'selected' : ''}>${f}</option>
                  `).join('')}
                </select>
              </div>

              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.2rem; color: var(--text);">Timing</label>
                <select class="input select" data-med-field="timing" data-med-index="${index}" style="margin: 0; font-size: 0.88rem;">
                  ${['Morning and Night', 'Morning', 'Afternoon', 'Night', 'Morning, Afternoon & Night', 'Before Bed'].map(tm => `
                    <option value="${tm}" ${med.timing === tm ? 'selected' : ''}>${tm}</option>
                  `).join('')}
                </select>
              </div>

              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.2rem; color: var(--text);">Duration</label>
                <input class="input" type="text" data-med-field="duration" data-med-index="${index}" placeholder="e.g. 5 days, 1 week" value="${MedicaresAPI.sanitizeText(med.duration || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>

              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.2rem; color: var(--text);">Food Instruction</label>
                <select class="input select" data-med-field="foodInstruction" data-med-index="${index}" style="margin: 0; font-size: 0.88rem;">
                  ${['After food', 'Before food', 'With food', 'Empty stomach', 'As directed'].map(fi => `
                    <option value="${fi}" ${med.foodInstruction === fi ? 'selected' : ''}>${fi}</option>
                  `).join('')}
                </select>
              </div>

              <div style="grid-column: span 2;">
                <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.2rem; color: var(--text);">Special Instructions</label>
                <input class="input" type="text" data-med-field="instructions" data-med-index="${index}" placeholder="e.g. Take with warm water, avoid cold beverages" value="${MedicaresAPI.sanitizeText(med.instructions || '')}" style="margin: 0; font-size: 0.88rem;" />
              </div>
            </div>
          </div>
        `).join('');

        // Bind removal
        medicinesListContainer.querySelectorAll('[data-remove-med]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.removeMed, 10);
            medicines.splice(idx, 1);
            renderMedicinesUI();
          });
        });

        // Bind input sync
        medicinesListContainer.querySelectorAll('[data-med-field]').forEach(input => {
          input.addEventListener('input', () => {
            const idx = parseInt(input.dataset.medIndex, 10);
            const field = input.dataset.medField;
            if (medicines[idx]) {
              medicines[idx][field] = input.value;
            }
          });
          input.addEventListener('change', () => {
            const idx = parseInt(input.dataset.medIndex, 10);
            const field = input.dataset.medField;
            if (medicines[idx]) {
              medicines[idx][field] = input.value;
            }
          });
        });
      }

      addMedBtn?.addEventListener('click', () => {
        medicines.push({
          medicineName: '',
          type: 'Tablet',
          dosage: '1 tablet',
          quantity: '10 tablets',
          frequency: '2 times daily',
          timing: 'Morning and Night',
          duration: '5 days',
          foodInstruction: 'After food',
          instructions: 'Take with water'
        });
        renderMedicinesUI();
      });

      renderMedicinesUI();

      // Action Handler: Save Draft or Send to Patient
      async function handleSaveReport(isSending = false) {
        const diagInput = document.getElementById('reportDiagnosis');
        const symptomsInput = document.getElementById('reportSymptoms');
        const observationsInput = document.getElementById('reportObservations');
        const clinicalNotesInput = document.getElementById('reportClinicalNotes');

        const bpInput = document.getElementById('metricBp');
        const sugarInput = document.getElementById('metricSugar');
        const tempInput = document.getElementById('metricTemp');
        const pulseInput = document.getElementById('metricPulse');
        const spo2Input = document.getElementById('metricSpo2');
        const weightInput = document.getElementById('metricWeight');
        const heightInput = document.getElementById('metricHeight');

        const allergiesInput = document.getElementById('reportAllergies');
        const conditionsInput = document.getElementById('reportExistingConditions');
        const adviceInput = document.getElementById('reportAdvice');
        const followUpInput = document.getElementById('reportFollowUpDate');

        // Clean medicines - filter out entirely blank rows
        const cleanedMedicines = medicines.filter(m => m.medicineName && m.medicineName.trim().length > 0);

        const reportPayload = {
          reportId: existingReport?.reportId || existingReport?.id,
          appointmentId: String(appt.id),
          patientId: String(patientId),
          patientEmail: String(patientEmail),
          patientName: String(patientName),
          doctorId: String(doctorId),
          doctorEmail: String(doctorEmail),
          doctorName: String(doctorName),
          consultationDate: consultationDate,
          diagnosis: diagInput?.value?.trim() || '',
          symptoms: symptomsInput?.value?.trim() || '',
          observations: observationsInput?.value?.trim() || '',
          clinicalNotes: clinicalNotesInput?.value?.trim() || '',
          healthMetrics: {
            bloodPressure: bpInput?.value?.trim() || '',
            bloodSugar: sugarInput?.value?.trim() || '',
            temperature: tempInput?.value?.trim() || '',
            pulseRate: pulseInput?.value?.trim() || '',
            spo2: spo2Input?.value?.trim() || '',
            weight: weightInput?.value?.trim() || '',
            height: heightInput?.value?.trim() || ''
          },
          medicines: cleanedMedicines,
          allergies: allergiesInput?.value?.trim() || '',
          existingConditions: conditionsInput?.value?.trim() || '',
          advice: adviceInput?.value?.trim() || '',
          followUpDate: followUpInput?.value?.trim() || '',
          status: isSending ? 'SENT' : 'DRAFT'
        };

        // Validate
        const errors = MedicaresAPI.medicalReports.validate(reportPayload, isSending);
        if (errors.length) {
          alert('Report Validation Error:\n• ' + errors.join('\n• '));
          return;
        }

        const targetBtn = isSending ? sendPatientBtn : saveDraftBtn;
        const origText = targetBtn.textContent;
        targetBtn.disabled = true;
        targetBtn.textContent = isSending ? 'Sending...' : 'Saving...';

        try {
          await MedicaresAPI.medicalReports.create(reportPayload);

          if (isSending) {
            // Just after prescription done, mark as prescription completed
            appt.status = 'COMPLETED';
            appt.prescriptionStatus = 'COMPLETED';
            if (apptRow) {
              apptRow.status = 'COMPLETED';
              apptRow.prescriptionStatus = 'COMPLETED';
              if (apptRow.rawAppointment) {
                apptRow.rawAppointment.status = 'COMPLETED';
                apptRow.rawAppointment.prescriptionStatus = 'COMPLETED';
              }
            }

            // Persist status change in storage & backend
            await MedicaresAPI.appointments.markPrescriptionCompleted(appt.id);

            // Dynamically redraw table so UI immediately shows '✓ Prescription Completed'
            if (typeof draw === 'function') {
              draw(searchInput?.value || '');
            }

            notify('Prescription Completed', `Prescription sent and marked as Prescription Completed for ${patientName}.`, 'success');
          } else {
            notify('Report Saved', 'Medical report saved as draft.', 'info');
          }

          closeDoctorReportModal();
        } catch (saveErr) {
          alert('Failed to save report: ' + (saveErr.message || 'Unknown error.'));
        } finally {
          targetBtn.disabled = false;
          targetBtn.textContent = origText;
        }
      }

      if (saveDraftBtn) {
        saveDraftBtn.onclick = () => handleSaveReport(false);
      }
      if (sendPatientBtn) {
        sendPatientBtn.onclick = () => handleSaveReport(true);
      }
    };

    window.closeDoctorReportModal = function() {
      const modal = document.getElementById('doctorReportModal');
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
