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

  const reconsultBookingForm = document.getElementById('reconsultBookingForm');
  const reconsultBookingSection = document.getElementById('reconsultBookingSection');
  const reconsultDateInput = document.getElementById('reconsultDate');
  const reconsultTimeInput = document.getElementById('reconsultTime');
  const reconsultSlotGrid = document.getElementById('reconsultSlotGrid');
  const reconsultSlotStatusMsg = document.getElementById('reconsultSlotStatusMsg');

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
  renderHospitalBanner();
  if (profile) {
    ensureAppointmentsSection();
  }
  bindEvents();
  initReconsultationFeature();

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
    const phoneInput = bookingForm.querySelector('[name="patientPhone"]');
    const doctorInput = bookingForm.querySelector('[name="doctor"]');
    const doctorHospitalInput = bookingForm.querySelector('[name="doctorHospital"]');

    if (nameInput && !nameInput.value) nameInput.value = user?.fullName || user?.name || '';
    if (emailInput && !emailInput.value) emailInput.value = user?.email || '';
    if (phoneInput && !phoneInput.value) phoneInput.value = user?.phoneNumber || user?.phone || user?.phone_number || user?.patientPhone || '';
    if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];
    if (reconsultDateInput) reconsultDateInput.min = new Date().toISOString().split('T')[0];
    if (doctorInput) doctorInput.value = '';
    if (doctorHospitalInput) doctorHospitalInput.value = '';
    if (timeInput) timeInput.value = '';
    state.selectedSlot = null;
  }

  function updateHospitalBanner(hospitalName, label = 'Selected Hospital') {
    const bannerContainer = document.getElementById('hospitalBannerContainer');
    if (!bannerContainer) return;

    if (hospitalName && hospitalName !== 'N/A') {
      bannerContainer.innerHTML = `
        <div class="hospital-banner" style="margin-bottom: 2.5rem; padding: 1.25rem 1.5rem; border: 1px solid rgba(37, 99, 235, 0.2); border-left: 5px solid var(--primary); background: var(--surface); border-radius: var(--radius-md); box-shadow: var(--shadow-soft); display: flex; align-items: center; gap: 1.25rem; transition: all 0.3s ease-in-out;">
          <span style="font-size: 1.8rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));">🏥</span>
          <div>
            <span class="muted" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; display: block; margin-bottom: 0.25rem;">${label}</span>
            <strong style="font-size: 1.25rem; color: var(--text); font-family: 'Poppins', sans-serif;">${MedicaresAPI.sanitizeText(hospitalName)}</strong>
          </div>
        </div>
      `;
    } else {
      bannerContainer.innerHTML = '';
    }
  }

  function renderHospitalBanner() {
    const urlParams = new URLSearchParams(window.location.search);
    const hospitalName = urlParams.get('hospitalName') || urlParams.get('hospital') || '';

    if (hospitalName) {
      updateHospitalBanner(hospitalName, 'Partner Hospital');
    }
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

  function timeToMinutes(timeStr) {
    if (!timeStr) return -1;
    timeStr = String(timeStr).trim().toUpperCase();
    
    // Check if it has AM/PM
    const hasAmPm = timeStr.includes('AM') || timeStr.includes('PM');
    if (hasAmPm) {
      const match = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const ampm = match[3];
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      }
    }
    
    // Check if it's 24h format e.g. "09:30" or "09:30:00" or "9:30"
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      if (!isNaN(hours) && !isNaN(minutes)) {
        return hours * 60 + minutes;
      }
    }
    
    return -1;
  }

  /* ── Fetch booked slots from API ─────────────── */

  async function fetchBookedSlots(doctorId, date) {
    try {
      const doctor = state.doctors.find(d => Number(d.id) === Number(doctorId)) || state.selectedDoctor;
      const doctorEmail = doctor?.email || '';

      const response = await MedicaresAPI.appointments.list({
        doctorEmail: doctorEmail,
        date: date
      });

      const rawCollection = Array.isArray(response)
        ? response
        : (response?.bookedSlots || response?.appointments || []);

      const bookedTimes = rawCollection
        .filter((apt) => {
          if (typeof apt === 'string') return true;

          // Status check: only BOOKED status
          const status = String(apt.status || '').toUpperCase();
          if (status !== 'BOOKED') return false;

          // Date check: Ignore appointments from other dates
          const aptDate = String(apt.appointment_date || apt.date || '');
          if (aptDate && aptDate !== date) return false;

          // Doctor check: Ignore appointments from other doctors
          const aptDoctorId = String(apt.doctor_id || apt.doctorId || '');
          const aptDoctorEmail = String(apt.doctor_email || apt.doctorEmail || '').toLowerCase();
          
          if (doctorId && aptDoctorId && aptDoctorId !== String(doctorId)) return false;
          if (doctorEmail && aptDoctorEmail && aptDoctorEmail !== String(doctorEmail).toLowerCase()) return false;

          return true;
        })
        .map((apt) => {
          if (typeof apt === 'string') return apt;
          return apt.appointment_time || apt.time || '';
        })
        .filter(Boolean);

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

  function renderSlotGridLoading(targetGrid = slotGrid, statusNode = slotStatusMsg) {
    if (!targetGrid) return;
    const skeletons = Array.from({ length: 12 }, () => '<div class="slot-skeleton"></div>').join('');
    targetGrid.className = 'slot-grid-loading';
    targetGrid.innerHTML = skeletons;
    if (statusNode) {
      statusNode.style.display = 'block';
      statusNode.textContent = 'Checking slot availability...';
      statusNode.className = 'slot-status-msg slot-status-msg--info';
    }
  }

  async function renderSlotGrid(targetGrid = slotGrid, dateNode = dateInput, timeNode = timeInput, statusNode = slotStatusMsg) {
    if (!targetGrid) return;

    const selectedDate = dateNode?.value || '';
    const doctorId = state.selectedDoctor?.id;

    // Reset time
    if (timeNode) timeNode.value = '';
    if (targetGrid === slotGrid) {
      state.selectedSlot = null;
    }

    if (!doctorId) {
      targetGrid.className = 'slot-grid';
      targetGrid.innerHTML = '<p class="muted">Please select a doctor and date first to view available slots.</p>';
      if (statusNode) {
        statusNode.style.display = 'none';
        statusNode.textContent = '';
      }
      return;
    }

    renderSlotGridLoading(targetGrid, statusNode);

    // Fetch booked slots from API
    const bookedSlots = await fetchBookedSlots(doctorId, selectedDate);
    if (targetGrid === slotGrid) {
      state.bookedSlots = bookedSlots;
    }

    const allSlots = generateTimeSlots();
    const now = new Date();
    const selectedDateStr = selectedDate;
    const todayStr = now.toISOString().split('T')[0];
    const isToday = selectedDateStr === todayStr;

    targetGrid.className = 'slot-grid';
    targetGrid.innerHTML = allSlots.map((slot) => {
      const slotMin = timeToMinutes(slot);
      const isBooked = bookedSlots.some((bTime) => timeToMinutes(bTime) === slotMin);

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
        return `<button type="button" class="slot-btn slot-btn--booked" disabled style="opacity: 0.5; cursor: not-allowed;" data-slot="${slot}" data-reason="booked" title="Already booked">Booked</button>`;
      }

      if (isPast) {
        return `<button type="button" class="slot-btn slot-btn--past" data-slot="${slot}" data-reason="past" title="Time has passed">${label}</button>`;
      }

      return `<button type="button" class="slot-btn slot-btn--available" data-slot="${slot}">${label}</button>`;
    }).join('');

    const bookedCount = allSlots.filter((slot) => {
      const slotMin = timeToMinutes(slot);
      return bookedSlots.some((bTime) => timeToMinutes(bTime) === slotMin);
    }).length;

    const pastCount = allSlots.filter((slot) => {
      if (!isToday) return false;
      const [sh, sm] = slot.split(':').map(Number);
      const slotDate = new Date(now);
      slotDate.setHours(sh, sm, 0, 0);
      return slotDate <= now;
    }).length;

    const unavailableCount = bookedCount + pastCount;
    const availableCount = allSlots.length - unavailableCount;

    const setStatus = (msg, type) => {
      if (!statusNode) return;
      statusNode.textContent = msg;
      statusNode.className = `slot-status-msg slot-status-msg--${type}`;
      statusNode.style.display = 'block';
    };

    if (availableCount === 0) {
      if (pastCount > 0 && bookedCount === 0) {
        setStatus('All slots have passed for today. Please choose a future date.', 'error');
      } else {
        setStatus('No slots available for this date. Please choose a different date.', 'error');
      }
    } else {
      setStatus(`${availableCount} of ${allSlots.length} slots available`, 'info');
    }

    // Use event delegation on targetGrid for all slot clicks
    targetGrid.onclick = (e) => {
      const btn = e.target.closest('.slot-btn');
      if (!btn) return;

      if (btn.classList.contains('slot-btn--booked')) {
        setStatus('⚠ This slot is already booked. Please choose a different time slot.', 'error');
        return;
      }

      if (btn.classList.contains('slot-btn--past')) {
        setStatus('⚠ This time has already passed. Please choose a later slot or future date.', 'error');
        return;
      }

      if (btn.classList.contains('slot-btn--available')) {
        // Select slot
        targetGrid.querySelectorAll('.slot-btn--selected').forEach((el) => {
          el.classList.remove('slot-btn--selected');
        });

        btn.classList.add('slot-btn--selected');
        const selectedTime = btn.dataset.slot;
        if (targetGrid === slotGrid) {
          state.selectedSlot = selectedTime;
        }
        if (timeNode) timeNode.value = selectedTime;

        setStatus(`✓ Selected: ${formatSlotLabel(selectedTime)}`, 'success');
      }
    };
  }

  /* ── Events ──────────────────────────────────── */

  function bindEvents() {
    // Tab switching logic
    const tabBtns = document.querySelectorAll('.tab-nav .tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        tabBtns.forEach((b) => b.classList.remove('active'));
        tabPanes.forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${tabId}`)?.classList.add('active');

        // Reset forms when switching tabs to avoid state bleed
        if (tabId === 'new-booking') {
          reconsultBookingForm?.reset();
          if (reconsultBookingSection) reconsultBookingSection.style.display = 'none';
        } else {
          bookingForm?.reset();
          prefillPatientForm(profile);
          state.selectedDoctor = null;
          if (slotGrid) {
            slotGrid.className = 'slot-grid';
            slotGrid.innerHTML = '<p class="muted">Please select a doctor and date first to view available slots.</p>';
          }
          if (slotStatusMsg) {
            slotStatusMsg.style.display = 'none';
          }
        }
      });
    });

    [doctorSearch, specializationFilter, hospitalFilter].forEach((node) => {
      node?.addEventListener('input', renderDoctors);
      node?.addEventListener('change', renderDoctors);
    });

    // Re-render slots when date changes (New Booking form)
    dateInput?.addEventListener('change', () => {
      renderSlotGrid(slotGrid, dateInput, timeInput, slotStatusMsg);
    });

    // Re-render slots when date changes (Reconsultation form)
    reconsultDateInput?.addEventListener('change', () => {
      renderSlotGrid(reconsultSlotGrid, reconsultDateInput, reconsultTimeInput, reconsultSlotStatusMsg);
    });

    bookingForm.addEventListener('submit', openReviewModal);
    reconsultBookingForm?.addEventListener('submit', openReconsultReviewModal);

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
      state.doctors = MedicaresAPI.normalizeDoctorsList(source);

      hydrateFilterOptions();
      renderDoctors();
      handleUrlDoctorSelection();
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
      return data;
    } catch (error) {
      const fallbackResponse = await MedicaresAPI.doctors.list().catch(() => null);
      return fallbackResponse;
    }
  }

  /* ── Appointments loading ────────────────────── */

  async function loadAppointments() {
    renderAppointmentsListLoading();

    try {
      const response = await MedicaresAPI.appointments.list({ patientEmail: profile.email });
      const source = Array.isArray(response) ? response : (response?.appointments || []);
      const userEmail = String(profile.email || '').toLowerCase();

      state.appointments = source
        .map((item) => ({
          id: item.id || item.appointmentId,
          doctorId: Number(item.doctor_id || item.doctorId || 0),
          doctorName: String(item.doctorName || item.doctor_name || ''),
          doctorEmail: String(item.doctorEmail || item.doctor_email || ''),
          patientId: String(item.patient_id || item.patientId || ''),
          patientEmail: String(item.patient_email || item.patientEmail || item.email || ''),
          patientName: String(item.patientName || item.patient_name || ''),
          patientPhone: String(item.patientPhone || item.phoneNumber || item.phone || item.patient_phone || ''),
          appointmentType: String(item.appointmentType || item.type || item.bookingType || 'Consultation'),
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

    const urlParams = new URLSearchParams(window.location.search);
    const hospitalParam = urlParams.get('hospitalName') || urlParams.get('hospital') || '';
    if (hospitalParam) {
      const matched = hospitals.find((h) => h.toLowerCase() === hospitalParam.toLowerCase());
      if (matched) {
        hospitalFilter.value = matched;
      }
    }
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

  function selectDoctor(selectedDoctor, isAutoSelect = false) {
    if (!selectedDoctor) return;

    state.selectedDoctor = selectedDoctor;
    const doctorInput = bookingForm.querySelector('[name="doctor"]');
    const doctorHospitalInput = bookingForm.querySelector('[name="doctorHospital"]');
    if (doctorInput) doctorInput.value = `${selectedDoctor.name} - ${selectedDoctor.specialization}`;
    if (doctorHospitalInput) doctorHospitalInput.value = selectedDoctor.hospital || '';

    if (isAutoSelect) {
      notify('Doctor selected', `${selectedDoctor.name} has been pre-selected.`, 'success');
    } else {
      notify('Doctor selected', `${selectedDoctor.name} selected for booking.`, 'success');
    }

    // Dynamically update or display the hospital banner at the top
    if (selectedDoctor.hospital && selectedDoctor.hospital !== 'N/A') {
      updateHospitalBanner(selectedDoctor.hospital, 'Selected Hospital');
    }

    // Refresh the doctors list to show visual selection
    renderDoctors();

    // Re-render the slot grid since doctor changed
    renderSlotGrid();
  }

  function handleUrlDoctorSelection() {
    const urlParams = new URLSearchParams(window.location.search);
    const doctorIdParam = urlParams.get('doctorId');
    if (!doctorIdParam) return;

    // Try to find exact match by ID string or number
    let matchedDoctor = state.doctors.find(
      (d) => String(d.id) === doctorIdParam || Number(d.id) === Number(doctorIdParam)
    );

    // If not found, try extracting digits from the parameter (e.g. "doctor-001" -> 1)
    if (!matchedDoctor) {
      const digits = doctorIdParam.match(/\d+/);
      if (digits) {
        const numericId = Number(digits[0]);
        matchedDoctor = state.doctors.find((d) => Number(d.id) === numericId);
      }
    }

    if (matchedDoctor) {
      selectDoctor(matchedDoctor, true);

      // Scroll the booking form into view
      const formSection = bookingForm.closest('section');
      if (formSection) {
        formSection.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }

  function renderDoctors() {
    const doctors = getFilteredDoctors();

    if (!doctors.length) {
      doctorResults.innerHTML = '<div class="dashboard-empty"><h3>No doctors found</h3><p class="muted">Try another filter or search term.</p></div>';
      return;
    }

    doctorResults.innerHTML = doctors.map((doctor) => {
      const isSelected = state.selectedDoctor && Number(state.selectedDoctor.id) === Number(doctor.id);
      const cardClass = isSelected ? 'doctor-card card doctor-card--selected' : 'doctor-card card';
      const buttonText = isSelected ? 'Selected' : 'Book Now';
      const buttonClass = isSelected ? 'button button--success' : 'button button--primary';

      return `
      <article class="${cardClass}" data-doctor-card-id="${doctor.id}">
        <div class="flex justify-between align-center">
          <div class="doctor-avatar">${MedicaresAPI.initials(doctor.name)}</div>
          <span class="badge badge--info">ID ${MedicaresAPI.sanitizeText(doctor.id)}</span>
        </div>
        <h3>${MedicaresAPI.sanitizeText(doctor.name)}</h3>
        <p style="font-weight: 600; color: var(--primary); margin: 0.3rem 0; display: flex; align-items: center; gap: 0.35rem;">
          <span>🏥</span> ${MedicaresAPI.sanitizeText(doctor.hospital)}
        </p>
        <p class="muted" style="font-size: 0.9rem; margin-bottom: 0.3rem;">${MedicaresAPI.sanitizeText(doctor.specialization)}</p>
        <p class="muted" style="font-size: 0.85rem; display: flex; align-items: center; gap: 0.35rem;">
          <span>📍</span> ${MedicaresAPI.sanitizeText(doctor.location)}
        </p>
        <div class="flex justify-between align-center" style="margin-top:1rem;">
          <div>
            <div class="muted" style="font-size:0.9rem;">Availability</div>
            <strong>Check slots below</strong>
          </div>
          <button class="${buttonClass}" type="button" data-select-doctor="${doctor.id}">${buttonText}</button>
        </div>
      </article>
      `;
    }).join('');

    document.querySelectorAll('[data-select-doctor]').forEach((button) => {
      button.addEventListener('click', () => {
        const doctorId = Number(button.dataset.selectDoctor || 0);
        const selectedDoctor = state.doctors.find((item) => item.id === doctorId);
        if (!selectedDoctor) return;
        selectDoctor(selectedDoctor);
      });
    });
  }

  /* ── Form validation ─────────────────────────── */

  function validateFormData(formData) {
    const patientName = String(formData.patientName || '').trim();
    const patientEmail = String(formData.patientEmail || '').trim();
    const patientPhone = String(formData.patientPhone || '').trim();
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

    if (!patientPhone) {
      return 'Patient phone number is required.';
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
        <div><strong>Type:</strong> New Appointment</div>
        <div><strong>Doctor:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.name)}</div>
        <div><strong>Doctor ID:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.id)}</div>
        <div><strong>Specialization:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.specialization)}</div>
        <div><strong>Hospital:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.hospital)}</div>
        <div><strong>Location:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.location)}</div>
        <div><strong>Patient:</strong> ${MedicaresAPI.sanitizeText(formData.patientName)}</div>
        <div><strong>Email:</strong> ${MedicaresAPI.sanitizeText(formData.patientEmail)}</div>
        <div><strong>Phone:</strong> ${MedicaresAPI.sanitizeText(formData.patientPhone)}</div>
        <div><strong>Date:</strong> ${MedicaresAPI.sanitizeText(formData.date)}</div>
        <div><strong>Time:</strong> ${MedicaresAPI.sanitizeText(formatSlotLabel(formData.time))}</div>
        <div><strong>Notes:</strong> ${MedicaresAPI.sanitizeText(formData.notes || 'None')}</div>
      </div>
    `;

    confirmButton.onclick = confirmNewBooking;
    modal.classList.add('open');
  }

  async function confirmNewBooking() {
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
      patientPhone: String(formData.patientPhone || '').trim(),
      phoneNumber: String(formData.patientPhone || '').trim(),
      phone: String(formData.patientPhone || '').trim(),
      doctorId: String(state.selectedDoctor.id || ''),
      doctorName: String(state.selectedDoctor.name || ''),
      doctorEmail: String(state.selectedDoctor.email || '').trim(),
      hospital: String(state.selectedDoctor.hospital || '').trim(),
      hospital_name: String(state.selectedDoctor.hospital || '').trim(),
      date: String(formData.date || '').trim(),
      time: String(formData.time || '').trim(),
      notes: String(formData.notes || '').trim()
    };

    try {
      // Real-time GET double check before POST request
      const latestBooked = await fetchBookedSlots(state.selectedDoctor.id, payload.date);
      if (latestBooked.includes(normalizeTimeForCompare(payload.time))) {
        confirmButton.disabled = false;
        confirmButton.textContent = originalText;
        closeModal();
        notify('Slot Unavailable', 'This time slot has just been booked by another user. Please select a different slot.', 'error');
        renderSlotGrid();
        return;
      }

      await MedicaresAPI.appointments.create(payload);
      closeModal();
      bookingForm.reset();
      prefillPatientForm(profile);
      state.selectedDoctor = null;
      const doctorInput = bookingForm.querySelector('[name="doctor"]');
      const doctorHospitalInput = bookingForm.querySelector('[name="doctorHospital"]');
      if (doctorInput) doctorInput.value = '';
      if (doctorHospitalInput) doctorHospitalInput.value = '';

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

  /* ── Reconsultation flow ──────────────────────── */

  function validateReconsultFormData(formData) {
    const patientName = String(formData.patientName || '').trim();
    const patientEmail = String(formData.patientEmail || '').trim();
    const patientPhone = String(formData.patientPhone || '').trim();
    const date = String(formData.date || '').trim();
    const time = String(formData.time || '').trim();

    if (!state.selectedDoctor) {
      return 'Selected doctor details are missing.';
    }

    if (patientName.length < 2) {
      return 'Enter a valid patient name.';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) {
      return 'Enter a valid patient email.';
    }

    if (!patientPhone) {
      return 'Patient phone number is required.';
    }

    if (!date) return 'Select an appointment date.';
    if (!time) return 'Please select a time slot from the available slots.';

    const appointmentMs = new Date(`${date}T${time}`).getTime();
    if (Number.isNaN(appointmentMs) || appointmentMs < Date.now() - 60 * 1000) {
      return 'Appointment date and time must be in the future.';
    }

    return '';
  }

  function openReconsultReviewModal(event) {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(reconsultBookingForm).entries());
    const validationMessage = validateReconsultFormData(formData);

    if (validationMessage) {
      notify('Validation failed', validationMessage, 'error');
      return;
    }

    modalSummary.innerHTML = `
      <div class="stack">
        <div><strong>Type:</strong> Reconsultation (Follow-up)</div>
        <div><strong>Doctor:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.name)}</div>
        <div><strong>Doctor ID:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.id)}</div>
        <div><strong>Specialization:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.specialization)}</div>
        <div><strong>Hospital:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.hospital)}</div>
        <div><strong>Location:</strong> ${MedicaresAPI.sanitizeText(state.selectedDoctor.location)}</div>
        <div><strong>Patient:</strong> ${MedicaresAPI.sanitizeText(formData.patientName)}</div>
        <div><strong>Email:</strong> ${MedicaresAPI.sanitizeText(formData.patientEmail)}</div>
        <div><strong>Phone:</strong> ${MedicaresAPI.sanitizeText(formData.patientPhone)}</div>
        <div><strong>Date:</strong> ${MedicaresAPI.sanitizeText(formData.date)}</div>
        <div><strong>Time:</strong> ${MedicaresAPI.sanitizeText(formatSlotLabel(formData.time))}</div>
        <div><strong>Notes:</strong> ${MedicaresAPI.sanitizeText(formData.notes || 'None')}</div>
      </div>
    `;

    confirmButton.onclick = () => confirmReconsultBooking(formData);
    modal.classList.add('open');
  }

  async function confirmReconsultBooking(formData) {
    confirmButton.disabled = true;
    const originalText = confirmButton.textContent;
    confirmButton.textContent = 'Booking...';

    const payload = {
      patientName: String(formData.patientName || '').trim(),
      patientEmail: String(formData.patientEmail || '').trim(),
      patientPhone: String(formData.patientPhone || '').trim(),
      phoneNumber: String(formData.patientPhone || '').trim(),
      phone: String(formData.patientPhone || '').trim(),
      doctorId: String(state.selectedDoctor.id || ''),
      doctorName: String(state.selectedDoctor.name || ''),
      doctorEmail: String(state.selectedDoctor.email || '').trim(),
      hospital: String(state.selectedDoctor.hospital || '').trim(),
      hospital_name: String(state.selectedDoctor.hospital || '').trim(),
      date: String(formData.date || '').trim(),
      time: String(formData.time || '').trim(),
      notes: String(formData.notes || '').trim()
    };

    try {
      await MedicaresAPI.appointments.create(payload);
      closeModal();
      reconsultBookingForm.reset();
      resetReconsultationForm();
      if (reconsultBookingSection) reconsultBookingSection.style.display = 'none';
      state.selectedDoctor = null;

      notify('Appointment booked', 'Your follow-up appointment has been booked successfully. Redirecting...', 'success');
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

  function resetReconsultationForm() {
    if (reconsultBookingForm) reconsultBookingForm.reset();
    if (reconsultDateInput) reconsultDateInput.min = new Date().toISOString().split('T')[0];
    if (reconsultSlotGrid) {
      reconsultSlotGrid.className = 'slot-grid';
      reconsultSlotGrid.innerHTML = '<p class="muted">Please select a date first to view available slots.</p>';
    }
    if (reconsultSlotStatusMsg) {
      reconsultSlotStatusMsg.style.display = 'none';
      reconsultSlotStatusMsg.textContent = '';
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
      const docName = doctor?.name || appointment.doctorName || `Doctor #${appointment.doctorId}`;
      const dateTime = `${MedicaresAPI.formatDate(appointment.date)} • ${MedicaresAPI.formatTime(appointment.time)}`;
      const isUpcoming = new Date(`${appointment.date}T${appointment.time || '00:00:00'}`).getTime() >= Date.now();

      return `
        <article class="card" style="padding:1.25rem;margin-bottom:0.9rem;">
          <div class="flex justify-between align-center" style="gap:1rem;flex-wrap:wrap;">
            <div>
              <strong style="font-size: 1.1rem; display: block; margin-bottom: 0.25rem;">Doctor: ${MedicaresAPI.sanitizeText(docName)}</strong>
              <div class="meta" style="margin-bottom: 0.5rem;">
                ${MedicaresAPI.sanitizeText(doctor?.specialization || 'General')} • ${MedicaresAPI.sanitizeText(dateTime)}
              </div>
              <div style="font-size: 0.85rem; color: var(--text); margin-bottom: 0.5rem;">
                <strong>Patient Name:</strong> ${MedicaresAPI.sanitizeText(appointment.patientName || 'N/A')}
                ${appointment.patientPhone ? `• <strong>Phone:</strong> ${MedicaresAPI.sanitizeText(appointment.patientPhone)}` : ''}
                • <strong>Type:</strong> ${MedicaresAPI.sanitizeText(appointment.appointmentType || 'Consultation')}
              </div>
              <div class="badge badge--${isUpcoming ? 'info' : 'warning'}">${MedicaresAPI.sanitizeText(appointment.status)}</div>
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

  function initReconsultationFeature() {
    const searchNumberInput = document.getElementById('reconsultSearchNumber');
    const findBtn = document.getElementById('findAppointmentsBtn');
    const resultsContainer = document.getElementById('reconsultResults');

    if (!searchNumberInput || !findBtn || !resultsContainer) return;

    findBtn.addEventListener('click', async () => {
      const term = String(searchNumberInput.value || '').trim().toLowerCase();
      if (!term) {
        notify('Search error', 'Please enter a phone number or appointment ID.', 'error');
        return;
      }

      resultsContainer.style.display = 'block';
      resultsContainer.innerHTML = '<p class="muted">Searching appointments...</p>';

      try {
        const term = String(searchNumberInput.value || '').trim();
        let allAppointments = [];

        if (term.includes('@')) {
          // Try patientEmail first
          console.log("Request URL (patientEmail)", `${MedicaresAPI.API_BASE_URL}/appointments?patientEmail=${encodeURIComponent(term)}`);
          const patientResponse = await MedicaresAPI.appointments.list({ patientEmail: term });
          console.log("API Response (patientEmail)", patientResponse);
          allAppointments = Array.isArray(patientResponse) ? patientResponse : (patientResponse?.appointments || []);
          
          // If no appointments found, try doctorEmail
          if (allAppointments.length === 0) {
            console.log("Request URL (doctorEmail)", `${MedicaresAPI.API_BASE_URL}/appointments?doctorEmail=${encodeURIComponent(term)}`);
            const doctorResponse = await MedicaresAPI.appointments.list({ doctorEmail: term });
            console.log("API Response (doctorEmail)", doctorResponse);
            allAppointments = Array.isArray(doctorResponse) ? doctorResponse : (doctorResponse?.appointments || []);
          }
        } else if (/^\+?[0-9\s\-()]{7,}$/.test(term) || /^\d+$/.test(term)) {
          console.log("Request URL (patientPhone)", `${MedicaresAPI.API_BASE_URL}/appointments?patientPhone=${encodeURIComponent(term)}`);
          const phoneResponse = await MedicaresAPI.appointments.list({ patientPhone: term });
          console.log("API Response (patientPhone)", phoneResponse);
          allAppointments = Array.isArray(phoneResponse) ? phoneResponse : (phoneResponse?.appointments || []);
        } else {
          console.log("Request URL (appointmentId)", `${MedicaresAPI.API_BASE_URL}/appointments?appointmentId=${encodeURIComponent(term)}`);
          const idResponse = await MedicaresAPI.appointments.list({ appointmentId: term });
          console.log("API Response (appointmentId)", idResponse);
          allAppointments = Array.isArray(idResponse) ? idResponse : (idResponse?.appointments || []);
        }

        const matches = allAppointments.filter((apt) => {
          const aptPhone = String(apt.patientPhone || apt.phoneNumber || apt.phone || '').toLowerCase();
          const aptId = String(apt.id || apt.appointmentId || '').toLowerCase();
          const aptPatientEmail = String(apt.patientEmail || apt.email || '').toLowerCase();
          const aptDoctorEmail = String(apt.doctorEmail || apt.doctor_email || '').toLowerCase();
          const lowerTerm = term.toLowerCase();
          return aptPhone.includes(lowerTerm) || 
                 aptId.includes(lowerTerm) || 
                 aptPatientEmail.includes(lowerTerm) ||
                 aptDoctorEmail.includes(lowerTerm);
        });

        if (matches.length === 0) {
          resultsContainer.innerHTML = '<div class="dashboard-empty"><h3>No appointments found</h3><p class="muted">Try another search term or ID.</p></div>';
          return;
        }

        const eligibleAppointments = matches.filter((apt) => {
          const type = apt.appointmentType || apt.type || apt.bookingType;
          return !type || String(type).toUpperCase() === 'NEW';
        });

        if (eligibleAppointments.length === 0) {
          resultsContainer.innerHTML = '<div class="dashboard-empty"><h3>No eligible appointments</h3><p class="muted">No eligible consultation appointments found for reconsultation.</p></div>';
          return;
        }

        eligibleAppointments.sort((a, b) => {
          const left = new Date(`${a.date || a.appointment_date}T${a.time || a.appointment_time || '00:00:00'}`).getTime();
          const right = new Date(`${b.date || b.appointment_date}T${b.time || b.appointment_time || '00:00:00'}`).getTime();
          return right - left;
        });

        resultsContainer.innerHTML = `
          <div class="stack" style="gap: 1rem; margin-top: 1rem;">
            ${eligibleAppointments.map((apt) => {
              const docId = Number(apt.doctorId || apt.doctor_id || 0);
              const doctor = state.doctors.find((item) => Number(item.id) === docId);
              const docName = doctor?.name || apt.doctorName || `Doctor #${docId}`;
              const docSpecialty = doctor?.specialization || 'General';
              
              const dateVal = apt.date || apt.appointment_date;
              const timeVal = apt.time || apt.appointment_time;
              const dateTime = `${MedicaresAPI.formatDate(dateVal)} • ${MedicaresAPI.formatTime(timeVal)}`;
              
              const patientNameVal = apt.patientName || '';
              const patientPhoneVal = apt.patientPhone || apt.phoneNumber || apt.phone || '';
              const aptIdVal = apt.id || apt.appointmentId || '';
              const typeVal = apt.appointmentType || apt.type || apt.bookingType || 'Consultation';
              const statusVal = apt.status || 'BOOKED';

              return `
                <article class="card" style="padding: 1.2rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
                  <div>
                    <h3 style="margin: 0; font-size: 1.1rem; font-family: 'Poppins', sans-serif;">Doctor: ${MedicaresAPI.sanitizeText(docName)}</h3>
                    <p class="muted" style="font-size: 0.85rem; margin: 0.25rem 0;">${MedicaresAPI.sanitizeText(docSpecialty)} • ${MedicaresAPI.sanitizeText(dateTime)}</p>
                    <div style="font-size: 0.85rem; color: var(--text); margin-bottom: 0.5rem;">
                      <strong>Patient:</strong> ${MedicaresAPI.sanitizeText(patientNameVal)} 
                      ${patientPhoneVal ? `• <strong>Phone:</strong> ${MedicaresAPI.sanitizeText(patientPhoneVal)}` : ''}
                      • <strong>Type:</strong> ${MedicaresAPI.sanitizeText(typeVal)}
                      • <strong>ID:</strong> ${MedicaresAPI.sanitizeText(aptIdVal)}
                    </div>
                    <div class="badge badge--info">${MedicaresAPI.sanitizeText(statusVal)}</div>
                  </div>
                  <button
                    class="button button--primary"
                    type="button"
                    data-reconsult-apt-id="${aptIdVal}"
                  >
                    Reconsult
                  </button>
                </article>
              `;
            }).join('')}
          </div>
        `;

        resultsContainer.querySelectorAll('[data-reconsult-apt-id]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const aptId = btn.dataset.reconsultAptId;
            const selectedApt = matches.find((apt) => String(apt.id || apt.appointmentId) === String(aptId));
            if (!selectedApt) return;

            const docId = Number(selectedApt.doctorId || selectedApt.doctor_id || 0);
            let doctor = state.doctors.find((item) => Number(item.id) === docId);

            if (!doctor) {
              const emailToMatch = String(selectedApt.doctorEmail || '').trim().toLowerCase();
              const nameToMatch = String(selectedApt.doctorName || '').trim().toLowerCase();
              if (emailToMatch) {
                doctor = state.doctors.find((item) => String(item.email || '').trim().toLowerCase() === emailToMatch);
              }
              if (!doctor && nameToMatch) {
                doctor = state.doctors.find((item) => String(item.name || '').trim().toLowerCase() === nameToMatch);
              }
            }

            if (!doctor) {
              doctor = {
                id: selectedApt.doctorId || '0',
                name: selectedApt.doctorName || 'Doctor',
                specialization: selectedApt.doctorSpecialization || 'General',
                email: selectedApt.doctorEmail || '',
                hospital: selectedApt.hospital || selectedApt.hospital_name || 'General Hospital',
                location: selectedApt.location || 'N/A'
              };
            }

            // Set selected doctor in state
            state.selectedDoctor = doctor;

            // Prefill reconsult form inputs
            const reconsultDoctorInput = document.getElementById('reconsultDoctor');
            const reconsultHospitalInput = document.getElementById('reconsultDoctorHospital');
            if (reconsultDoctorInput) reconsultDoctorInput.value = `${doctor.name} - ${doctor.specialization}`;
            if (reconsultHospitalInput) reconsultHospitalInput.value = doctor.hospital || '';

            const nameInput = document.getElementById('reconsultPatientName');
            const emailInput = document.getElementById('reconsultPatientEmail');
            const phoneInput = document.getElementById('reconsultPatientPhone');

            if (nameInput) nameInput.value = selectedApt.patientName || '';
            if (emailInput) emailInput.value = selectedApt.patientEmail || '';
            
            const selectedPhone = selectedApt.patientPhone || selectedApt.phoneNumber || selectedApt.phone || '';
            if (phoneInput) phoneInput.value = selectedPhone;

            // Reset date and time values for the reconsult form
            const reconsultDateNode = document.getElementById('reconsultDate');
            if (reconsultDateNode) reconsultDateNode.value = '';
            const reconsultTimeNode = document.getElementById('reconsultTime');
            if (reconsultTimeNode) reconsultTimeNode.value = '';

            if (reconsultSlotGrid) {
              reconsultSlotGrid.className = 'slot-grid';
              reconsultSlotGrid.innerHTML = '<p class="muted">Please select a date first to view available slots.</p>';
            }
            if (reconsultSlotStatusMsg) {
              reconsultSlotStatusMsg.style.display = 'none';
            }

            // Show reconsult booking section card
            if (reconsultBookingSection) {
              reconsultBookingSection.style.display = 'block';
              reconsultBookingSection.scrollIntoView({ behavior: 'smooth' });
            }

            notify('Details pre-filled', `Follow-up for ${doctor.name} pre-filled. Please choose date and time.`, 'success');
          });
        });

      } catch (error) {
        resultsContainer.innerHTML = `<div class="dashboard-empty"><h3>No appointments found</h3><p class="muted">${MedicaresAPI.sanitizeText(error.message || 'Unable to load appointments.')}</p></div>`;
      }
    });
  }
});
