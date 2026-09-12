/**
 * Medical Reports Feature - Automated Test Suite
 * Validates all 14 core requirements and security boundaries.
 */

const assert = require('assert');

// Mock localStorage for headless Node environment
const store = {};
global.localStorage = {
  getItem: (key) => store[key] || null,
  setItem: (key, val) => { store[key] = String(val); },
  removeItem: (key) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};
global.window = { dispatchEvent: () => {} };

// Load Medicares API logic
require('../js/api.js');

const API = global.window.MedicaresAPI;

let testsRun = 0;
let testsPassed = 0;

function runTest(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  testsRun++;
  try {
    await fn();
    testsPassed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log('\n=== Starting Medicares Medical Reports Test Suite ===\n');

  localStorage.clear();

  // Test 1: Doctor creates report with one medicine
  await runAsyncTest('Doctor creates report with one medicine', async () => {
    const payload = {
      appointmentId: 'apt_101',
      patientId: 'pat_1',
      patientEmail: 'patient1@example.com',
      patientName: 'John Doe',
      doctorId: 'doc_1',
      doctorName: 'Dr. Sarah Connor',
      doctorEmail: 'sarah@medicares.me',
      diagnosis: 'Mild Viral Fever',
      medicines: [
        {
          medicineName: 'Paracetamol 500mg',
          type: 'Tablet',
          dosage: '1 tablet',
          quantity: '10 tablets',
          frequency: '2 times daily',
          timing: 'Morning and Night',
          duration: '5 days',
          foodInstruction: 'After food',
          instructions: 'Take with water'
        }
      ],
      status: 'DRAFT'
    };

    const created = await API.medicalReports.create(payload);
    assert.ok(created.reportId || created.id, 'Report must have an ID');
    assert.strictEqual(created.medicines.length, 1);
    assert.strictEqual(created.medicines[0].medicineName, 'Paracetamol 500mg');
    assert.strictEqual(created.status, 'DRAFT');
  });

  // Test 2: Doctor creates report with multiple medicines
  await runAsyncTest('Doctor creates report with multiple medicines', async () => {
    const payload = {
      appointmentId: 'apt_102',
      patientId: 'pat_2',
      patientEmail: 'patient2@example.com',
      patientName: 'Jane Smith',
      doctorId: 'doc_1',
      doctorName: 'Dr. Sarah Connor',
      doctorEmail: 'sarah@medicares.me',
      diagnosis: 'Bronchitis & Cough',
      medicines: [
        { medicineName: 'Amoxicillin 500mg', type: 'Capsule', dosage: '1 cap', frequency: '3 times daily' },
        { medicineName: 'Cough Syrup', type: 'Syrup', dosage: '10ml', frequency: 'Bedtime' },
        { medicineName: 'Vitamin C 500mg', type: 'Tablet', dosage: '1 tab', frequency: 'Once daily' }
      ],
      status: 'DRAFT'
    };

    const created = await API.medicalReports.create(payload);
    assert.strictEqual(created.medicines.length, 3);
    assert.strictEqual(created.medicines[1].medicineName, 'Cough Syrup');
  });

  // Test 3: Doctor saves draft
  await runAsyncTest('Doctor saves draft', async () => {
    const draftApptId = 'apt_draft_' + Date.now();
    const payload = {
      appointmentId: draftApptId,
      patientId: 'pat_3_draft',
      patientEmail: 'patient3_draft@example.com',
      patientName: 'Alice Green',
      doctorId: 'doc_1',
      diagnosis: 'Routine Checkup Observations',
      medicines: [],
      status: 'DRAFT'
    };

    const created = await API.medicalReports.create(payload);
    assert.strictEqual(created.status, 'DRAFT');
    assert.strictEqual(created.sentAt, null);

    // Patient must NOT see draft reports
    const patientReports = await API.medicalReports.listForPatient('pat_3_draft', 'patient3_draft@example.com');
    const hasDraft = patientReports.some(r => r.appointmentId === draftApptId);
    assert.strictEqual(hasDraft, false, 'Patient must not see DRAFT reports');
  });

  // Test 4: Doctor sends report
  await runAsyncTest('Doctor sends report', async () => {
    const payload = {
      appointmentId: 'apt_104',
      patientId: 'pat_4',
      patientEmail: 'patient4@example.com',
      patientName: 'Bob Vance',
      doctorId: 'doc_1',
      doctorEmail: 'sarah@medicares.me',
      diagnosis: 'Acute Gastritis',
      medicines: [{ medicineName: 'Omeprazole 20mg', type: 'Capsule', dosage: '1 cap' }],
      status: 'DRAFT'
    };

    const draft = await API.medicalReports.create(payload);
    const sent = await API.medicalReports.send(draft.reportId);
    assert.strictEqual(sent.status, 'SENT');
    assert.ok(sent.sentAt, 'sentAt timestamp must be recorded');
  });

  // Test 5: Patient sees report
  await runAsyncTest('Patient sees report', async () => {
    const patientReports = await API.medicalReports.listForPatient('pat_4', 'patient4@example.com');
    assert.ok(patientReports.length >= 1, 'Patient should see sent report');
    const rep = patientReports.find(r => r.appointmentId === 'apt_104');
    assert.ok(rep, 'Report apt_104 must be visible to pat_4');
    assert.strictEqual(rep.diagnosis, 'Acute Gastritis');
  });

  // Test 6: Patient cannot see another patient\'s report (Patient data isolation)
  await runAsyncTest("Patient cannot see another patient's report", async () => {
    // pat_1 queries their reports
    const pat1Reports = await API.medicalReports.listForPatient('pat_1', 'patient1@example.com');
    const containsPat4Report = pat1Reports.some(r => r.appointmentId === 'apt_104' || r.patientId === 'pat_4');
    assert.strictEqual(containsPat4Report, false, 'pat_1 must never receive pat_4 reports');
  });

  // Test 7: Doctor cannot access unrelated patient reports
  await runAsyncTest("Doctor access isolation by doctor credentials", async () => {
    const doc2Reports = await API.medicalReports.listForDoctor('doc_99', 'otherdoctor@medicares.me');
    const containsDoc1Reports = doc2Reports.some(r => r.doctorId === 'doc_1');
    assert.strictEqual(containsDoc1Reports, false, 'Doctor 99 must not see reports created by Doctor 1');
  });

  // Test 8: Report with no health metrics
  await runAsyncTest('Report with no health metrics', async () => {
    const payload = {
      appointmentId: 'apt_108',
      patientId: 'pat_8',
      patientEmail: 'pat8@example.com',
      patientName: 'Emma Watson',
      doctorId: 'doc_1',
      diagnosis: 'Seasonal Allergy',
      healthMetrics: {},
      status: 'SENT'
    };

    const created = await API.medicalReports.create(payload);
    assert.strictEqual(created.healthMetrics.bloodPressure, '');
    assert.strictEqual(created.healthMetrics.bloodSugar, '');
    assert.strictEqual(created.healthMetrics.temperature, '');
  });

  // Test 9: Report with all health metrics
  await runAsyncTest('Report with all health metrics', async () => {
    const payload = {
      appointmentId: 'apt_109',
      patientId: 'pat_9',
      patientEmail: 'pat9@example.com',
      patientName: 'Robert Downey',
      doctorId: 'doc_1',
      diagnosis: 'Hypertension Stage 1',
      healthMetrics: {
        bloodPressure: '138/88',
        bloodSugar: '105',
        temperature: '98.4',
        pulseRate: '76',
        spo2: '99',
        weight: '75',
        height: '178'
      },
      status: 'SENT'
    };

    const created = await API.medicalReports.create(payload);
    assert.strictEqual(created.healthMetrics.bloodPressure, '138/88');
    assert.strictEqual(created.healthMetrics.bloodSugar, '105');
    assert.strictEqual(created.healthMetrics.pulseRate, '76');
    assert.strictEqual(created.healthMetrics.spo2, '99');
    assert.strictEqual(created.healthMetrics.weight, '75');
    assert.strictEqual(created.healthMetrics.height, '178');
  });

  // Test 10: Report with no medicines
  await runAsyncTest('Report with no medicines (observations only)', async () => {
    const payload = {
      appointmentId: 'apt_110',
      patientId: 'pat_10',
      patientEmail: 'pat10@example.com',
      patientName: 'Chris Evans',
      doctorId: 'doc_1',
      diagnosis: 'Healthy annual physical',
      medicines: [],
      advice: 'Maintain current diet and exercise routine.',
      status: 'SENT'
    };

    const created = await API.medicalReports.create(payload);
    assert.strictEqual(created.medicines.length, 0);
    assert.strictEqual(created.diagnosis, 'Healthy annual physical');
  });

  // Test 11: Report with multiple medicines & food instructions
  await runAsyncTest('Report with multiple medicines and special instructions', async () => {
    const payload = {
      appointmentId: 'apt_111',
      patientId: 'pat_11',
      patientEmail: 'pat11@example.com',
      patientName: 'Scarlett Johansson',
      doctorId: 'doc_1',
      diagnosis: 'Sinusitis & Bacterial Infection',
      medicines: [
        { medicineName: 'Augmentin 625mg', type: 'Tablet', foodInstruction: 'After food', duration: '7 days' },
        { medicineName: 'Sinarest', type: 'Tablet', foodInstruction: 'After food', duration: '5 days' },
        { medicineName: 'Saline Nasal Spray', type: 'Drops', foodInstruction: 'As directed', duration: '10 days' }
      ],
      status: 'SENT'
    };

    const created = await API.medicalReports.create(payload);
    assert.strictEqual(created.medicines.length, 3);
    assert.strictEqual(created.medicines[2].type, 'Drops');
  });

  // Test 12: Existing appointment booking still works (MedicaresAPI.appointments API contract)
  runTest('Existing appointment booking APIs preserved', () => {
    assert.ok(API.appointments, 'appointments namespace must exist');
    assert.strictEqual(typeof API.appointments.list, 'function');
    assert.strictEqual(typeof API.appointments.create, 'function');
    assert.strictEqual(typeof API.appointments.delete, 'function');
  });

  // Test 13: Existing doctor dashboard APIs preserved
  runTest('Existing doctor dashboard APIs preserved', () => {
    assert.ok(API.doctors, 'doctors namespace must exist');
    assert.strictEqual(typeof API.doctors.list, 'function');
    assert.strictEqual(typeof API.normalizeDoctor, 'function');
    assert.strictEqual(typeof API.normalizeDoctorsList, 'function');
  });

  // Test 14: Existing patient dashboard authentication and profile APIs preserved
  runTest('Existing patient dashboard authentication and profile APIs preserved', () => {
    assert.strictEqual(typeof API.requireAuth, 'function');
    assert.strictEqual(typeof API.getProfile, 'function');
    assert.strictEqual(typeof API.getAuthUser, 'function');
    assert.strictEqual(typeof API.setAuthSession, 'function');
  });

  // Test 15: Status transition to VIEWED
  await runAsyncTest('Patient viewing report transitions status to VIEWED', async () => {
    const rep = await API.medicalReports.getByAppointmentId('apt_104');
    assert.ok(rep, 'Report apt_104 must exist');
    assert.strictEqual(rep.status, 'SENT');

    const viewed = await API.medicalReports.markViewed(rep.reportId);
    assert.strictEqual(viewed.status, 'VIEWED');
    assert.ok(viewed.viewedAt, 'viewedAt must be set');
  });

  // Test 16: Verify exact endpoint URLs (POST /medical-reports and GET /medical-reports)
  await runAsyncTest('Doctor sends POST to /medical-reports and patient sends GET to /medical-reports', async () => {
    let interceptedMethod = null;
    let interceptedUrl = null;
    const originalFetch = global.fetch;

    global.fetch = async (url, options = {}) => {
      interceptedUrl = url;
      interceptedMethod = options.method || 'GET';
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true, reportId: 'rep_verified_123', status: 'SENT' })
      };
    };

    try {
      // 1. Doctor sends report -> POST https://api.medicares.me/medical-reports
      await API.medicalReports.create({
        appointmentId: 'apt_verify_001',
        patientId: 'pat_verify',
        patientEmail: 'pat@example.com',
        doctorId: 'doc_1',
        diagnosis: 'Check',
        status: 'SENT'
      });
      assert.strictEqual(interceptedMethod, 'POST');
      assert.strictEqual(interceptedUrl, 'https://api.medicares.me/medical-reports');

      // 2. Patient dashboard retrieves -> GET https://api.medicares.me/medical-reports
      await API.medicalReports.listForPatient('pat_verify', 'pat@example.com');
      assert.strictEqual(interceptedMethod, 'GET');
      assert.strictEqual(interceptedUrl, 'https://api.medicares.me/medical-reports');
      assert.ok(!interceptedUrl.includes('?'), 'Must have no query parameters');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test 17: Mark appointment as Prescription Completed
  await runAsyncTest('Doctor completes prescription and marks appointment as Prescription Completed', async () => {
    // Seed an appointment in local storage
    const testAppts = [
      { id: 'apt_rx_99', patientName: 'John Doe', status: 'BOOKED', doctorId: 'doc_1' },
      { id: 'apt_rx_100', patientName: 'Jane Smith', status: 'BOOKED', doctorId: 'doc_1' }
    ];
    API.storeLocalList(API.STORAGE_KEYS.appointments, testAppts);

    // Call markPrescriptionCompleted
    const res = await API.appointments.markPrescriptionCompleted('apt_rx_99');
    assert.strictEqual(res.status, 'COMPLETED');
    assert.strictEqual(res.prescriptionStatus, 'COMPLETED');

    // Verify localStorage was updated
    const updated = API.loadLocalList(API.STORAGE_KEYS.appointments, []);
    const target = updated.find(a => a.id === 'apt_rx_99');
    assert.ok(target, 'Target appointment must exist');
    assert.strictEqual(target.status, 'COMPLETED');
    assert.strictEqual(target.prescriptionStatus, 'COMPLETED');

    // Untargeted appointment must remain unaffected
    const unaffected = updated.find(a => a.id === 'apt_rx_100');
    assert.strictEqual(unaffected.status, 'BOOKED');
  });

  // Test 18: Prescriptions marked completed reflect in report list status
  await runAsyncTest('Doctor sent report marks report status as SENT and links to appointment', async () => {
    const reportPayload = {
      appointmentId: 'apt_rx_99',
      patientId: 'pat_1',
      patientEmail: 'patient1@example.com',
      patientName: 'John Doe',
      doctorId: 'doc_1',
      diagnosis: 'Acute Bronchitis',
      medicines: [{ medicineName: 'Amoxicillin 500mg' }],
      status: 'SENT'
    };

    const saved = await API.medicalReports.create(reportPayload);
    assert.strictEqual(saved.status, 'SENT');
    assert.strictEqual(saved.appointmentId, 'apt_rx_99');

    const retrieved = await API.medicalReports.getByAppointmentId('apt_rx_99');
    assert.ok(retrieved);
    assert.strictEqual(retrieved.status, 'SENT');
  });

  console.log(`\n=== Test Results: ${testsPassed}/${testsRun} tests passed successfully! ===\n`);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
