document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page !== 'reminders') return;

  const reminderForm = document.getElementById('reminderForm');
  const reminderList = document.getElementById('reminderList');
  const historyList = document.getElementById('reminderHistory');
  const nextReminder = document.getElementById('nextReminder');
  const frequencyLabel = document.getElementById('frequencyLabel');

  const user = MedicaresAPI.getAuthUser();
  const userId = user ? (user.userId || user.id) : 'guest';
  const reminderStorageKey = `${MedicaresAPI.STORAGE_KEYS.reminders}_${userId}`;

  if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }

  let reminders = MedicaresAPI.loadLocalList(reminderStorageKey, []);
  renderReminders();
  startReminderMonitor();

  reminderForm?.addEventListener('submit', addReminder);
  reminderForm?.querySelector('[name="frequency"]')?.addEventListener('change', updateFrequencyCopy);
  updateFrequencyCopy();

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
    MedicaresUI.notify('Reminder saved', 'Medicine reminders are synced and ready for you.', 'success');
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
    MedicaresAPI.storeLocalList(reminderStorageKey, reminders);
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
              <div style="display:flex; gap:0.5rem;">
                <button class="button button--ghost" style="color:var(--danger, #ef4444); padding:0.4rem 0.8rem;" type="button" data-delete-reminder="${reminder.id}">Delete</button>
                <button class="button button--primary" type="button" data-mark-taken="${reminder.id}">Mark taken</button>
              </div>
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

    reminderList?.querySelectorAll('[data-delete-reminder]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.deleteReminder;
        reminders = reminders.filter((item) => String(item.id) !== id);
        persistAndRender();
        MedicaresUI.notify('Reminder deleted', 'The medicine reminder has been removed.', 'success');
      });
    });
  }

  function sendSystemNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }

  function startReminderMonitor() {
    window.setInterval(() => {
      const now = new Date();
      reminders.forEach((reminder) => {
        if (reminder.status === 'completed') return;
        // If not completed, checking time
        const reminderDate = new Date(`${now.toISOString().split('T')[0]}T${reminder.time}:00`);
        const diff = now.getTime() - reminderDate.getTime();
        
        // Notify if within a 1-minute window around the reminder time, and only if not notified yet
        if (Math.abs(diff) < 60000 && !reminder.notifiedAt) {
          reminder.notifiedAt = new Date().toISOString();
          const title = 'Medicine due';
          const body = `It is time to take ${reminder.medicine}.`;
          MedicaresUI.notify(title, body, 'warning');
          sendSystemNotification(title, body);
          persistAndRender();
        } else if (diff > 60000 && reminder.status === 'upcoming' && !reminder.notifiedAt) {
          // If the time has passed and they didn't mark taken, send a missed notification
          // We can notify them if they missed it (just once)
          reminder.notifiedAt = new Date().toISOString();
          const title = 'Missed Medicine';
          const body = `You missed taking ${reminder.medicine} at ${reminder.time}.`;
          MedicaresUI.notify(title, body, 'error');
          sendSystemNotification(title, body);
          persistAndRender();
        }
      });
    }, 30000);
  }
});
