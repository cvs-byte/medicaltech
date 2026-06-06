document.addEventListener('DOMContentLoaded', async () => {
  const doctorSearch = document.getElementById('doctorSearch');
  const specializationFilter = document.getElementById('specializationFilter');
  const hospitalFilter = document.getElementById('hospitalFilter');
  const doctorResults = document.getElementById('doctorResults');
  const bookingForm = document.getElementById('bookingForm');
  const modal = document.getElementById('appointmentModal');
  const modalSummary = document.getElementById('appointmentSummary');
  const confirmButton = document.getElementById('confirmBooking');
  const slotGrid = document.getElementById('slotGrid');
  const slotStatusMsg = document.getElementById('slotStatusMsg');
  const timeInput = document.getElementById('time');
  const dateInput = document.getElementById('date');

  if (!doctorResults || !bookingForm || !modal || !modalSummary || !confirmButton) return;

  let profile = null;
  const token = MedicaresAPI.getAuthToken();
  if (token) {
    try {
      profile = await MedicaresAPI.getProfile().catch(() => null) || MedicaresAPI.getAuthUser();
      if (profile && String(profile.role || '').toLowerCase() !== 'patient') {
        profile = null;
      }
    } catch (e) {
      console.warn('Failed to load profile for booking page:', e);
    }
  }

  const state = {
    selectedDoctor: null,
    doctors: [],
    appointments: [],
    bookedSlots: [],
    selectedSlot: null
  };

  /* ── Slot constants ──────────────────────────── */
  const SLOT_START_HOUR = 9;   // 9:00 AM
  const SLOT_END_HOUR = 17;    // 5:00 PM
  const SLOT_INTERVAL = 15;    // 15-minute intervals

  prefillPatientForm(profile);
  if (profile) {
    ensureAppointmentsSection();
  }
  bindEvents();

  await loadDoctors();
  if (profile) {
    await loadAppointments();
  }

  /* ── Helpers ─────────────────────────────────── */

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
    const doctorInput = bookingForm.querySelector('[name="doctor"]');
    const doctorIdInput = bookingForm.querySelector('[name="doctorId"]');
    const doctorEmailInput = bookingForm.querySelector('[name="doctorEmail"]');

    if (nameInput && !nameInput.value) nameInput.value = user?.fullName || user?.name || '';
    if (emailInput && !emailInput.value) emailInput.value = user?.email || '';
    if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];
    if (doctorInput) doctorInput.value = '';
    if (doctorIdInput) doctorIdInput.value = '';
    if (doctorEmailInput) doctorEmailInput.value = '';
    if (timeInput) timeInput.value = '';
    state.selectedSlot = null;
  }

  /* ── Slot generation ─────────────────────────── */

  function generateTimeSlots() {
    const slots = [];
    for (let h = SLOT_START_HOUR; h < SLOT_END_HOUR; h++) {
      for (let m = 0; m < 60; m += SLOT_INTERVAL) {
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        slots.push(`${hh}:${mm}`);
      }
    }
    return slots;
  }

  function formatSlotLabel(time24) {
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const suffix = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${mStr} ${suffix}`;
  }

  function normalizeTimeForCompare(t) {
    if (!t) return '';
    // Accept HH:MM, HH:MM:SS, or partial
    const parts = t.split(':');
    if (parts.length >= 2) {
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }
    return t;
  }

  /* ── Fetch booked slots from API ─────────────── */

  async function fetchBookedSlots(doctorId, date) {
    try {
      const response = await MedicaresAPI.appointments.list();
      const allAppointments = Array.isArray(response) ? response : [];

      // Filter appointments for the selected doctor on the selected date
      const bookedTimes = allAppointments
        .filter((apt) => {
          const aptDoctorId = String(apt.doctor_id || apt.doctorId || '');
          const aptDate = String(apt.appointment_date || apt.date || '');
          return aptDoctorId === String(doctorId) && aptDate === date;
        })
        .map((apt) => normalizeTimeForCompare(apt.appointment_time || apt.time || ''));

      return bookedTimes;
    } catch (error) {
      console.warn('Failed to fetch appointments for slot availability:', error);
      return [];
    }
  }

  /* ── Render slot grid ────────────────────────── */

  function showSlotStatus(message, type = 'error') {
    if (!slotStatusMsg) return;
    slotStatusMsg.textContent = message;
    slotStatusMsg.className = `slot-status-msg slot-status-msg--${type}`;
    slotStatusMsg.style.display = 'block';
  }

  function hideSlotStatus() {
    if (!slotStatusMsg) return;
    slotStatusMsg.style.display = 'none';
    slotStatusMsg.textContent = '';
  }

  function renderSlotGridLoading() {
    if (!slotGrid) return;
    const skeletons = Array.from({ length: 12 }, () => '<div class="slot-skeleton"></div>').join('');
    slotGrid.className = 'slot-grid-loading';
    slotGrid.innerHTML = skeletons;
    hideSlotStatus();
  }

  async function renderSlotGrid() {
    if (!slotGrid) return;

    const selectedDate = dateInput?.value || '';
    const doctorId = state.selectedDoctor?.id;

    // Reset time
    if (timeInput) timeInput.value = '';
    state.selectedSlot = null;

    if (!doctorId) {
      slotGrid.className = 'slot-grid';
      slotGrid.innerHTML = '<p class="muted">Please select a doctor to view available slots.</p>';
      hideSlotStatus();
      return;
    }

    renderSlotGridLoading();

    // Fetch booked slots from API
    const bookedSlots = await fetchBookedSlots(doctorId, selectedDate);
    state.bookedSlots = bookedSlots;

    const allSlots = generateTimeSlots();
    const now = new Date();
    const selectedDateStr = selectedDate;
    const todayStr = now.toISOString().split('T')[0];
    const isToday = selectedDateStr === todayStr;

    slotGrid.className = 'slot-grid';
    slotGrid.innerHTML = allSlots.map((slot) => {
      const isBooked = bookedSlots.includes(slot);

      // If today, disable past slots
      let isPast = false;
      if (isToday) {
        const [sh, sm] = slot.split(':').map(Number);
        const slotDate = new Date(now);
        slotDate.setHours(sh, sm, 0, 0);
        if (slotDate <= now) isPast = true;
      }

      const label = formatSlotLabel(slot);

      if (isBooked) {
        return `<button type="button" class="slot-btn slot-btn--booked" data-slot="${slot}" data-reason="booked" title="Already booked">${label}</button>`;
      }

      if (isPast) {
        return `<button type="button" class="slot-btn slot-btn--past" data-slot="${slot}" data-reason="past" title="Time has passed">${label}</button>`;
      }

      return `<button type="button" class="slot-btn slot-btn--available" data-slot="${slot}">${label}</button>`;
    }).join('');

    const bookedCount = allSlots.filter((s) => bookedSlots.includes(s)).length;
    const pastCount = allSlots.filter((slot) => {
      if (!isToday) return false;
      const [sh, sm] = slot.split(':').map(Number);
      const slotDate = new Date(now);
      slotDate.setHours(sh, sm, 0, 0);
      return slotDate <= now;
    }).length;
    const unavailableCount = bookedCount + pastCount;
    const availableCount = allSlots.length - unavailableCount;

    if (availableCount === 0) {
      if (pastCount > 0 && bookedCount === 0) {
        showSlotStatus('All slots have passed for today. Please choose a future date.', 'error');
      } else {
        showSlotStatus('No slots available for this date. Please choose a different date.', 'error');
      }
    } else {
      showSlotStatus(`${availableCount} of ${allSlots.length} slots available`, 'info');
    }

    // Use event delegation on slotGrid for all slot clicks
    // (disabled buttons don't fire click events, so we avoid using 'disabled' attr)
    slotGrid.onclick = (e) => {
      const btn = e.target.closest('.slot-btn');
      if (!btn) return;

      if (btn.classList.contains('slot-btn--booked')) {
        showSlotStatus('⚠ This slot is already booked. Please choose a different time slot.', 'error');
        return;
      }

      if (btn.classList.contains('slot-btn--past')) {
        showSlotStatus('⚠ This time has already passed. Please choose a later slot or future date.', 'error');
        return;
      }

      if (btn.classList.contains('slot-btn--available')) {
        selectSlot(btn);
      }
    };
  }

  function selectSlot(btn) {
    // Remove previous selection
    slotGrid.querySelectorAll('.slot-btn--selected').forEach((el) => {
      el.classList.remove('slot-btn--selected');
    });

    btn.classList.add('slot-btn--selected');
    const selectedTime = btn.dataset.slot;
    state.selectedSlot = selectedTime;
    if (timeInput) timeInput.value = selectedTime;

    showSlotStatus(`✓ Selected: ${formatSlotLabel(selectedTime)}`, 'success');
  }

  /* ── Events ──────────────────────────────────── */

  function bindEvents() {
    [doctorSearch, specializationFilter, hospitalFilter].forEach((node) => {
      node?.addEventListener('input', renderDoctors);
      node?.addEventListener('change', renderDoctors);
    });

    // Re-render slots when date changes
    dateInput?.addEventListener('change', () => {
      renderSlotGrid();
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

  /* ── Doctor loading ──────────────────────────── */

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

  /* ── Appointments loading ────────────────────── */

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

  /* ── Filter options ──────────────────────────── */

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

  /* ── Render doctors ──────────────────────────── */

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

        // Re-render the slot grid since doctor changed
        renderSlotGrid();
      });
    });
  }

  /* ── Form validation ─────────────────────────── */

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

    if (!time) return 'Please select a time slot from the available slots.';

    // Validate the time is within 9 AM - 5 PM
    const [h, m] = time.split(':').map(Number);
    if (h < SLOT_START_HOUR || h >= SLOT_END_HOUR || (h === SLOT_END_HOUR && m > 0)) {
      return 'Appointments can only be booked between 9:00 AM and 5:00 PM.';
    }

    const appointmentMs = new Date(`${date}T${time}`).getTime();
    if (Number.isNaN(appointmentMs) || appointmentMs < Date.now() - 60 * 1000) {
      return 'Appointment date and time must be in the future.';
    }

    // Check if the selected slot is booked
    if (state.bookedSlots.includes(normalizeTimeForCompare(time))) {
      return 'This slot is already booked. Please choose a different time slot.';
    }

    return '';
  }

  /* ── Booking flow ────────────────────────────── */

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
        <div><strong>Time:</strong> ${MedicaresAPI.sanitizeText(formatSlotLabel(formData.time))}</div>
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

      // Reset slot grid
      if (slotGrid) {
        slotGrid.className = 'slot-grid';
        slotGrid.innerHTML = '<p class="muted">Please select a doctor and date first to view available slots.</p>';
      }
      hideSlotStatus();

      notify('Appointment booked', 'Your appointment has been booked successfully. Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1500);
    } catch (error) {
      notify('Booking failed', error.message || 'Unable to book appointment.', 'error');
    } finally {
      confirmButton.disabled = false;
      confirmButton.textContent = originalText;
    }
  }

  /* ── Appointment management ──────────────────── */

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

  /* ── My Appointments section ─────────────────── */

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
