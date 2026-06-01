document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page !== 'reminders') return;

  const reminderForm = document.getElementById('reminderForm');
  const reminderList = document.getElementById('reminderList');
  const historyList = document.getElementById('reminderHistory');
  const nextReminder = document.getElementById('nextReminder');
  const frequencyLabel = document.getElementById('frequencyLabel');

  const saved = MedicaresAPI.loadLocalList(MedicaresAPI.STORAGE_KEYS.reminders, []);
  let reminders = saved.length ? saved : seedReminders();
  MedicaresAPI.storeLocalList(MedicaresAPI.STORAGE_KEYS.reminders, reminders);
  renderReminders();
  startReminderMonitor();

  reminderForm?.addEventListener('submit', addReminder);
  reminderForm?.querySelector('[name="frequency"]')?.addEventListener('change', updateFrequencyCopy);
  updateFrequencyCopy();

  function seedReminders() {
    return [
      { id: 1, medicine: 'Amlodipine', dosage: '1 tablet', time: '08:00', frequency: 'daily', type: 'Tablet', status: 'upcoming', notifiedAt: null },
      { id: 2, medicine: 'Vitamin D', dosage: '1 capsule', time: '20:00', frequency: 'daily', type: 'Vitamin', status: 'upcoming', notifiedAt: null }
    ];
  }

  function updateFrequencyCopy() {
    const value = reminderForm?.querySelector('[name="frequency"]')?.value || 'daily';
    if (!frequencyLabel) return;
    const labelMap = {
      daily: 'Every day at the selected time',
      weekly: 'Every week on the selected schedule',
      monthly: 'Every month on the selected date'
    };
    frequencyLabel.textContent = labelMap[value] || labelMap.daily;
  }

  function addReminder(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(reminderForm).entries());

    if (!payload.medicine || !payload.time || !payload.dosage) {
      MedicaresUI.notify('Missing reminder details', 'Fill in medicine, dosage, and reminder time.', 'error');
      return;
    }

    const reminder = {
      id: Date.now(),
      medicine: payload.medicine,
      dosage: payload.dosage,
      time: payload.time,
      frequency: payload.frequency,
      type: payload.type,
      status: 'upcoming',
      notifiedAt: null,
      nextDose: nextDoseTimestamp(payload.time)
    };

    reminders.unshift(reminder);
    persistAndRender();
    reminderForm.reset();
    updateFrequencyCopy();
    MedicaresUI.notify('Reminder saved', 'Medicine reminders are synced locally and ready for API persistence.', 'success');
  }

  function nextDoseTimestamp(timeValue) {
    const [hours, minutes] = timeValue.split(':').map(Number);
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);
    if (next <= new Date()) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }

  function persistAndRender() {
    MedicaresAPI.storeLocalList(MedicaresAPI.STORAGE_KEYS.reminders, reminders);
    renderReminders();
  }

  function renderReminders() {
    const upcoming = reminders.filter((item) => item.status !== 'completed');
    const history = reminders.filter((item) => item.status === 'completed');

    if (reminderList) {
      reminderList.innerHTML = upcoming.length
        ? upcoming.map((reminder) => `
          <div class="reminder-card card">
            <div class="flex justify-between align-center">
              <div>
                <h3 style="margin-bottom:0.3rem;">${reminder.medicine}</h3>
                <p class="muted">${reminder.dosage} • ${reminder.type}</p>
              </div>
              <span class="badge badge--info">${reminder.frequency}</span>
            </div>
            <div class="flex justify-between align-center" style="margin-top:1rem;">
              <div>
                <div class="muted" style="font-size:0.9rem;">Reminder time</div>
                <strong>${reminder.time}</strong>
              </div>
              <button class="button button--ghost" type="button" data-mark-taken="${reminder.id}">Mark taken</button>
            </div>
          </div>
        `).join('')
        : `<div class="dashboard-empty">No upcoming reminders. Add your first medicine plan.</div>`;
    }

    if (historyList) {
      historyList.innerHTML = history.length
        ? history.map((reminder) => `
          <div class="history-item">
            <strong>${reminder.medicine}</strong>
            <div class="meta">Completed at ${reminder.notifiedAt ? MedicaresAPI.formatDateTime(reminder.notifiedAt) : 'recently'}</div>
          </div>
        `).join('')
        : `<div class="dashboard-empty">Your reminder history will appear here.</div>`;
    }

    if (nextReminder) {
      const nextUpcoming = upcoming[0];
      nextReminder.textContent = nextUpcoming ? `${nextUpcoming.medicine} at ${nextUpcoming.time}` : 'No upcoming reminders';
    }

    reminderList?.querySelectorAll('[data-mark-taken]').forEach((button) => {
      button.addEventListener('click', () => {
        const reminder = reminders.find((item) => String(item.id) === button.dataset.markTaken);
        if (!reminder) return;
        reminder.status = 'completed';
        reminder.notifiedAt = new Date().toISOString();
        persistAndRender();
        MedicaresUI.notify('Reminder completed', `${reminder.medicine} marked as taken.`, 'success');
      });
    });
  }

  function startReminderMonitor() {
    window.setInterval(() => {
      const now = new Date();
      reminders.forEach((reminder) => {
        if (reminder.status === 'completed' || reminder.notifiedAt) return;
        const reminderDate = new Date(`${now.toISOString().split('T')[0]}T${reminder.time}:00`);
        const diff = Math.abs(reminderDate.getTime() - now.getTime());
        if (diff < 60000) {
          reminder.notifiedAt = new Date().toISOString();
          MedicaresUI.notify('Medicine due', `${reminder.medicine} is scheduled now.`, 'warning');
          persistAndRender();
        }
      });
    }, 30000);
  }
});
