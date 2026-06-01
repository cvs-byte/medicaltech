document.addEventListener('DOMContentLoaded', async () => {
  const doctorSearch = document.getElementById('doctorSearch');
  const specializationFilter = document.getElementById('specializationFilter');
  const hospitalFilter = document.getElementById('hospitalFilter');
  const doctorResults = document.getElementById('doctorResults');
  const bookingForm = document.getElementById('bookingForm');
  const modal = document.getElementById('appointmentModal');
  const modalSummary = document.getElementById('appointmentSummary');
  const confirmButton = document.getElementById('confirmBooking');

  if (!doctorResults || !bookingForm || !modal || !modalSummary || !confirmButton) return;

  const profile = await MedicaresAPI.requireAuth({ role: 'patient', redirectTo: 'login.html', validateProfile: true });
  if (!profile) return;

  const state = {
    selectedDoctor: null,
    doctors: [],
    appointments: []
  };

  prefillPatientForm(profile);
  ensureAppointmentsSection();
  bindEvents();

  await loadDoctors();
  await loadAppointments();

  function notify(title, message, type = 'error') {
    if (window.MedicaresUI?.notify) {
      window.MedicaresUI.notify(title, message, type);
      return;
    }
    alert(`${title}: ${message}`);
  }

  function prefillPatientForm(user) {
    const nameInput = bookingForm.querySelector('[name="patientName"]');
    const emailInput = bookingForm.querySelector('[name="patientEmail"]');
    const dateInput = bookingForm.querySelector('[name="date"]');
    const doctorInput = bookingForm.querySelector('[name="doctor"]');
    const doctorIdInput = bookingForm.querySelector('[name="doctorId"]');
    const doctorEmailInput = bookingForm.querySelector('[name="doctorEmail"]');

    if (nameInput && !nameInput.value) nameInput.value = user.fullName || user.name || '';
    if (emailInput && !emailInput.value) emailInput.value = user.email || '';
    if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];
    if (doctorInput) doctorInput.value = '';
    if (doctorIdInput) doctorIdInput.value = '';
    if (doctorEmailInput) doctorEmailInput.value = '';
  }

  function bindEvents() {
    [doctorSearch, specializationFilter, hospitalFilter].forEach((node) => {
      node?.addEventListener('input', renderDoctors);
      node?.addEventListener('change', renderDoctors);
    });

    bookingForm.addEventListener('submit', openReviewModal);
    confirmButton.addEventListener('click', confirmBooking);

    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
  }

  async function loadDoctors() {
    doctorResults.innerHTML = '<p class="muted">Loading doctors...</p>';

    try {
      const source = await fetchDoctors();

      state.doctors = source.map((doctor) => ({
        id: Number(doctor.id),
        name: String(doctor.name || doctor.fullName || 'Doctor'),
        specialization: String(doctor.specialization || doctor.specialty || 'General'),
        hospital: String(doctor.hospital || doctor.location || doctor.address || 'N/A'),
        location: String(doctor.location || doctor.address || doctor.hospital || 'N/A'),
        email: String(doctor.email || doctor.doctorEmail || doctor.contactEmail || '')
      }));

      hydrateFilterOptions();
      renderDoctors();
    } catch (error) {
      doctorResults.innerHTML = `<div class="dashboard-empty"><h3>Unable to load doctors</h3><p class="muted">${MedicaresAPI.sanitizeText(error.message || 'Please try again later.')}</p></div>`;
    }
  }

  async function fetchDoctors() {
    const baseUrl = window.API_URL || MedicaresAPI.API_BASE_URL;
    const token = MedicaresAPI.getAuthToken();

    try {
      const response = await fetch(`${baseUrl}/doctors`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json().catch(() => null);
      return Array.isArray(data) ? data : (data?.items || []);
    } catch (error) {
      const fallbackResponse = await MedicaresAPI.doctors.list();
      return Array.isArray(fallbackResponse) ? fallbackResponse : [];
    }
  }

  async function loadAppointments() {
    renderAppointmentsListLoading();

    try {
      const response = await MedicaresAPI.appointments.list({ patientEmail: profile.email });
      const source = Array.isArray(response) ? response : [];
      const userEmail = String(profile.email || '').toLowerCase();

      state.appointments = source
        .map((item) => ({
          id: item.id || item.appointmentId,
          doctorId: Number(item.doctor_id || item.doctorId || 0),
          patientId: String(item.patient_id || item.patientId || ''),
          patientEmail: String(item.patient_email || item.patientEmail || item.email || ''),
          date: item.appointment_date || item.date || '',
          time: item.appointment_time || item.time || '',
          status: String(item.status || 'BOOKED').toUpperCase()
        }))
        .filter((item) => !userEmail || String(item.patientEmail || '').toLowerCase() === userEmail)
        .sort((a, b) => {
          const left = new Date(`${a.date}T${a.time || '00:00:00'}`).getTime();
          const right = new Date(`${b.date}T${b.time || '00:00:00'}`).getTime();
          return right - left;
        });

      renderAppointmentsList();
    } catch (error) {
      renderAppointmentsListError(error.message || 'Unable to load appointments.');
    }
  }

  function hydrateFilterOptions() {
    if (!specializationFilter || !hospitalFilter) return;

    const specializations = Array.from(new Set(state.doctors.map((item) => item.specialization).filter(Boolean)));
    const hospitals = Array.from(new Set(state.doctors.map((item) => item.hospital).filter(Boolean)));

    specializationFilter.innerHTML = ['<option value="all">All</option>', ...specializations.map((item) => `<option value="${MedicaresAPI.sanitizeText(item)}">${MedicaresAPI.sanitizeText(item)}</option>`)].join('');
    hospitalFilter.innerHTML = ['<option value="all">All Hospitals</option>', ...hospitals.map((item) => `<option value="${MedicaresAPI.sanitizeText(item)}">${MedicaresAPI.sanitizeText(item)}</option>`)].join('');
  }

  function getFilteredDoctors() {
    const query = String(doctorSearch?.value || '').toLowerCase().trim();
    const specialization = String(specializationFilter?.value || 'all');
    const hospital = String(hospitalFilter?.value || 'all');

    return state.doctors.filter((doctor) => {
      const matchesQuery = `${doctor.name} ${doctor.specialization} ${doctor.hospital} ${doctor.location} ${doctor.email}`.toLowerCase().includes(query);
      const matchesSpecialization = specialization === 'all' || doctor.specialization === specialization;
      const matchesHospital = hospital === 'all' || doctor.hospital === hospital;
      return matchesQuery && matchesSpecialization && matchesHospital;
    });
  }

  function renderDoctors() {
    const doctors = getFilteredDoctors();

    if (!doctors.length) {
      doctorResults.innerHTML = '<div class="dashboard-empty"><h3>No doctors found</h3><p class="muted">Try another filter or search term.</p></div>';
      return;
    }

    doctorResults.innerHTML = doctors.map((doctor) => `
      <article class="doctor-card card">
        <div class="flex justify-between align-center">
          <div class="doctor-avatar">${MedicaresAPI.initials(doctor.name)}</div>
          <span class="badge badge--info">ID ${MedicaresAPI.sanitizeText(doctor.id)}</span>
        </div>
        <h3>${MedicaresAPI.sanitizeText(doctor.name)}</h3>
        <p>${MedicaresAPI.sanitizeText(doctor.specialization)} • ${MedicaresAPI.sanitizeText(doctor.location)}</p>
        <div class="flex justify-between align-center" style="margin-top:1rem;">
          <div>
            <div class="muted" style="font-size:0.9rem;">Availability</div>
            <strong>Check slots below</strong>
          </div>
          <button class="button button--primary" type="button" data-select-doctor="${doctor.id}">Book Now</button>
        </div>
      </article>
    `).join('');

    document.querySelectorAll('[data-select-doctor]').forEach((button) => {
      button.addEventListener('click', () => {
        const doctorId = Number(button.dataset.selectDoctor || 0);
        const selectedDoctor = state.doctors.find((item) => item.id === doctorId);
        if (!selectedDoctor) return;

        state.selectedDoctor = selectedDoctor;
        const doctorInput = bookingForm.querySelector('[name="doctor"]');
        const doctorIdInput = bookingForm.querySelector('[name="doctorId"]');
        const doctorEmailInput = bookingForm.querySelector('[name="doctorEmail"]');
        if (doctorInput) doctorInput.value = `${selectedDoctor.name} - ${selectedDoctor.specialization}`;
        if (doctorIdInput) doctorIdInput.value = String(selectedDoctor.id);
        if (doctorEmailInput) doctorEmailInput.value = selectedDoctor.email || '';
        notify('Doctor selected', `${selectedDoctor.name} selected for booking.`, 'success');
      });
    });
  }

  function validateFormData(formData) {
    const patientName = String(formData.patientName || '').trim();
    const patientEmail = String(formData.patientEmail || '').trim();
    const date = String(formData.date || '').trim();
    const time = String(formData.time || '').trim();

    if (!state.selectedDoctor) {
      return 'Please select a doctor before booking.';
    }

    if (patientName.length < 2) {
      return 'Enter a valid patient name.';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) {
      return 'Enter a valid patient email.';
    }

    if (!date) return 'Select an appointment date.';
    if (!time) return 'Select an appointment time.';

    const appointmentMs = new Date(`${date}T${time}`).getTime();
    if (Number.isNaN(appointmentMs) || appointmentMs < Date.now() - 60 * 1000) {
      return 'Appointment date and time must be in the future.';
    }

    return '';
  }

  function openReviewModal(event) {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(bookingForm).entries());
    const validationMessage = validateFormData(formData);

    if (validationMessage) {
      notify('Validation failed', validationMessage, 'error');
      return;
    }

    modalSummary.innerHTML = `
      <div class="stack">
        <div><strong>Doctor:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.name)}</div>
        <div><strong>Doctor ID:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.id)}</div>
        <div><strong>Specialization:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.specialization)}</div>
        <div><strong>Location:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.location)}</div>
        <div><strong>Patient:</strong> ${MedicaresAPI.sanitizeText(formData.patientName)}</div>
        <div><strong>Email:</strong> ${MedicaresAPI.sanitizeText(formData.patientEmail)}</div>
        <div><strong>Doctor Email:</strong> ${MedicaresAPI.sanitizeText(formData.doctorEmail || state.selectedDoctor.email || 'Email not available')}</div>
        <div><strong>Date:</strong> ${MedicaresAPI.sanitizeText(formData.date)}</div>
        <div><strong>Time:</strong> ${MedicaresAPI.sanitizeText(formData.time)}</div>
        <div><strong>Notes:</strong> ${MedicaresAPI.sanitizeText(formData.notes || 'None')}</div>
      </div>
    `;

    modal.classList.add('open');
  }

  async function confirmBooking() {
    const formData = Object.fromEntries(new FormData(bookingForm).entries());
    const validationMessage = validateFormData(formData);

    if (validationMessage) {
      notify('Validation failed', validationMessage, 'error');
      return;
    }

    confirmButton.disabled = true;
    const originalText = confirmButton.textContent;
    confirmButton.textContent = 'Booking...';

    const payload = {
      patientName: String(formData.patientName || '').trim(),
      patientEmail: String(formData.patientEmail || '').trim(),
      doctorId: String(state.selectedDoctor.id || ''),
      doctorName: String(state.selectedDoctor.name || ''),
      doctorEmail: String(formData.doctorEmail || state.selectedDoctor.email || '').trim(),
      date: String(formData.date || '').trim(),
      time: String(formData.time || '').trim(),
      notes: String(formData.notes || '').trim()
    };

    try {
      await MedicaresAPI.appointments.create(payload);
      closeModal();
      bookingForm.reset();
      prefillPatientForm(profile);
      state.selectedDoctor = null;
      const doctorInput = bookingForm.querySelector('[name="doctor"]');
      const doctorIdInput = bookingForm.querySelector('[name="doctorId"]');
      const doctorEmailInput = bookingForm.querySelector('[name="doctorEmail"]');
      if (doctorInput) doctorInput.value = '';
      if (doctorIdInput) doctorIdInput.value = '';
      if (doctorEmailInput) doctorEmailInput.value = '';

      notify('Appointment booked', 'Your appointment has been booked successfully.', 'success');
      await loadAppointments();
    } catch (error) {
      notify('Booking failed', error.message || 'Unable to book appointment.', 'error');
    } finally {
      confirmButton.disabled = false;
      confirmButton.textContent = originalText;
    }
  }

  function normalizeTime(value) {
    if (!value) return '';
    return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  }

  async function deleteAppointment(appointmentId) {
    if (!confirm('Delete this appointment?')) return;

    try {
      await MedicaresAPI.appointments.delete({ id: appointmentId });
      notify('Appointment deleted', 'Appointment deleted successfully.', 'success');
      await loadAppointments();
    } catch (error) {
      notify('Delete failed', error.message || 'Unable to delete appointment.', 'error');
    }
  }

  function closeModal() {
    modal.classList.remove('open');
  }

  function ensureAppointmentsSection() {
    const container = document.querySelector('.container');
    if (!container || document.getElementById('myAppointmentsSection')) return;

    const section = document.createElement('section');
    section.id = 'myAppointmentsSection';
    section.className = 'glass-panel';
    section.style.marginTop = '2rem';
    section.style.padding = '1.5rem';
    section.innerHTML = `
      <span class="eyebrow">My Appointments</span>
      <h2 class="section-title" style="font-size:1.7rem;">Upcoming and History</h2>
      <div id="appointmentsList" style="margin-top:1rem;"></div>
    `;

    container.appendChild(section);
  }

  function renderAppointmentsListLoading() {
    const target = document.getElementById('appointmentsList');
    if (target) target.innerHTML = '<p class="muted">Loading appointments...</p>';
  }

  function renderAppointmentsListError(message) {
    const target = document.getElementById('appointmentsList');
    if (!target) return;
    target.innerHTML = `<div class="dashboard-empty"><h3>Unable to load appointments</h3><p class="muted">${MedicaresAPI.sanitizeText(message)}</p></div>`;
  }

  function renderAppointmentsList() {
    const target = document.getElementById('appointmentsList');
    if (!target) return;

    if (!state.appointments.length) {
      target.innerHTML = '<div class="dashboard-empty"><h3>No appointments found</h3><p class="muted">Book an appointment to see it here.</p></div>';
      return;
    }

    target.innerHTML = state.appointments.map((appointment) => {
      const doctor = state.doctors.find((item) => Number(item.id) === Number(appointment.doctorId));
      const dateTime = `${MedicaresAPI.formatDate(appointment.date)} • ${MedicaresAPI.formatTime(appointment.time)}`;
      const isUpcoming = new Date(`${appointment.date}T${appointment.time || '00:00:00'}`).getTime() >= Date.now();

      return `
        <article class="card" style="padding:1rem;margin-bottom:0.9rem;">
          <div class="flex justify-between align-center" style="gap:1rem;flex-wrap:wrap;">
            <div>
              <strong>${MedicaresAPI.sanitizeText(doctor?.name || `Doctor #${appointment.doctorId}`)}</strong>
              <div class="meta">${MedicaresAPI.sanitizeText(doctor?.specialization || 'General')} • ${MedicaresAPI.sanitizeText(dateTime)}</div>
              <div class="badge badge--${isUpcoming ? 'info' : 'warning'}" style="margin-top:0.6rem;">${MedicaresAPI.sanitizeText(appointment.status)}</div>
            </div>
            <button class="button button--ghost" type="button" data-delete-appointment="${appointment.id}">Delete</button>
          </div>
        </article>
      `;
    }).join('');

    target.querySelectorAll('[data-delete-appointment]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = Number(button.dataset.deleteAppointment || 0);
        if (id) deleteAppointment(id);
      });
    });
  }
});
