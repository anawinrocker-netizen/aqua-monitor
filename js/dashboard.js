import { auth, db } from './firebase-config.js';
import { 
  onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, getDoc, collection, query, where, orderBy, limit, onSnapshot, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { checkAndAlert, startHourlyReport } from './telegram-alert.js';

// DOM Elements
const farmInfo = document.getElementById('farmInfo');
const currentDO = document.getElementById('currentDO');
const currentTemp = document.getElementById('currentTemp');
const currentSat = document.getElementById('currentSat');
const aeratorStatusEl = document.getElementById('aeratorStatus');
const lastUpdate = document.getElementById('lastUpdate');
const logoutBtn = document.getElementById('logoutBtn');
const toggleBtn = document.getElementById('toggleAerator');

let currentUser = null;
let currentFarmId = null;
let doChart = null;
let rocChart = null;

// <<< เพิ่ม: เก็บค่าล่าสุดไว้ให้รายงานประจำชั่วโมงของ Telegram เรียกใช้
let latestDO = null;
let latestTemp = null;
let hourlyReportStarted = false;

// ==================== ตัวช่วย: แปลง Firestore Timestamp เป็น JS Date ====================
// <<< เพิ่ม: reading.timestamp ที่ ESP32 ส่งมาจะเป็น Firestore Timestamp object
// ใช้ฟังก์ชันนี้แปลงเป็น Date ปลอดภัย (กันกรณีข้อมูลเก่าที่ไม่มี timestamp)
function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate(); // Firestore Timestamp
  return new Date(ts); // เผื่อกรณีเป็น string/number
}

// คำนวณ DO Saturation จาก DO mg/L + Temp
function calculateDOSat(doMgL, tempC) {
  const doMax = 14.652 - 0.41022 * tempC 
              + 0.0079910 * Math.pow(tempC, 2) 
              - 0.000077774 * Math.pow(tempC, 3);
  return (doMgL / doMax) * 100;
}

// แต่งสีค่า DO ตามระดับ
function getDOClass(doVal) {
  if (doVal >= 5) return 'do-good';
  if (doVal >= 3) return 'do-warning';
  return 'do-danger';
}

// ==================== Auth Check ====================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;

  const userDoc = await getDoc(doc(db, 'users', user.uid));
  const userData = userDoc.data();

  if (!userData || !userData.farmId) {
    window.location.href = 'setup-farm.html';
    return;
  }

  currentFarmId = userData.farmId;

  const farmDoc = await getDoc(doc(db, 'farms', currentFarmId));
  const farmData = farmDoc.data();
  farmInfo.textContent = `${farmData.farmName} | ${currentFarmId}`;

  listenToReadings();
  listenToAeratorStatus();
});

// ==================== Real-time Readings ====================
function listenToReadings() {
  const q = query(
    collection(db, 'readings'),
    where('farmId', '==', currentFarmId),
    orderBy('timestamp', 'desc'),   // <<< แก้: เดิมเป็น '__name__' (ID สุ่ม) → ใช้ timestamp จริง
    limit(96 * 4)
  );

  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      currentDO.textContent = '--';
      currentTemp.textContent = '--';
      currentSat.textContent = '--';
      return;
    }

    const readings = [];
    snapshot.forEach(doc => readings.push({ id: doc.id, ...doc.data() }));

    readings.reverse(); // กลับเป็นเรียงจากเก่า → ใหม่ (ตามเวลาจริง)

    const latest = readings[readings.length - 1];
    const doVal = latest.do;
    const tempVal = latest.temperature;
    const satVal = calculateDOSat(doVal, tempVal);

    currentDO.textContent = doVal.toFixed(2);
    currentDO.className = 'status-value ' + getDOClass(doVal);
    currentTemp.textContent = tempVal.toFixed(1);
    currentSat.textContent = satVal.toFixed(1);

    // <<< แก้: แสดงเวลาของ reading ล่าสุดจริง (เดิมแสดงเวลาปัจจุบันของเครื่อง)
    const latestDate = tsToDate(latest.timestamp);
    lastUpdate.textContent = latestDate
      ? latestDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '--';

    updateChart(readings);
    updateROCChart(readings);

    // <<< เพิ่ม: แจ้งเตือน Telegram
    // เก็บค่าล่าสุดไว้ให้รายงานประจำชั่วโมง
    latestDO = doVal;
    latestTemp = tempVal;

    // คำนวณอัตราการเปลี่ยนแปลง DO ล่าสุด (mg/L ต่อ 10 นาที) แบบเดียวกับกราฟ ROC
    const ROC_WINDOW = 40;
    let latestRate = null;
    if (readings.length > ROC_WINDOW) {
      latestRate = readings[readings.length - 1].do - readings[readings.length - 1 - ROC_WINDOW].do;
    }

    checkAndAlert(doVal, latestRate);

    // เริ่มรายงานประจำชั่วโมงครั้งเดียวหลังโหลดข้อมูลชุดแรก
    if (!hourlyReportStarted) {
      hourlyReportStarted = true;
      startHourlyReport(() => ({ do: latestDO, temp: latestTemp }));
    }
  }, (error) => {
    // <<< เพิ่ม: ดักจับ error โดยเฉพาะกรณีต้องสร้าง Firestore index
    console.error('readings query error:', error);
    if (error.code === 'failed-precondition') {
      console.warn('⚠ Firestore ต้องสร้าง composite index ก่อน — กดลิงก์ในข้อความ error สีแดงด้านบนนี้เพื่อสร้าง แล้วรอ 1-2 นาที');
    }
  });
}

// ==================== Chart DO ====================
function updateChart(readings) {
  const sampled = readings.filter((_, i) => i % 4 === 0);

  // <<< แก้: ใช้เวลาจริงจาก reading.timestamp (เดิมเดาจาก index ย้อนหลัง 60 วิ/จุด)
  const labels = sampled.map(r => {
    const d = tsToDate(r.timestamp);
    return d ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
  });
  const data = sampled.map(r => r.do);

  if (doChart) {
    doChart.data.labels = labels;
    doChart.data.datasets[0].data = data;
    doChart.update('none');
    return;
  }

  const ctx = document.getElementById('doChart').getContext('2d');
  doChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'DO (mg/L)',
        data: data,
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'top' } },
      scales: {
        y: { beginAtZero: false, title: { display: true, text: 'DO (mg/L)' } },
        x: { title: { display: true, text: 'เวลา' }, ticks: { maxTicksLimit: 12 } }
      }
    }
  });
}

// ==================== Rate of Change Chart ====================
function updateROCChart(readings) {
  const ROC_WINDOW = 40;

  let rocData = [];
  let rocLabels = [];

  if (readings.length >= ROC_WINDOW) {
    for (let i = ROC_WINDOW; i < readings.length; i += 4) {
      const oldDO = readings[i - ROC_WINDOW].do;
      const newDO = readings[i].do;
      const roc = newDO - oldDO;
      rocData.push(roc.toFixed(3));

      // <<< แก้: ใช้เวลาจริงจาก reading.timestamp (เดิมเดาจาก index ย้อนหลัง 15 วิ/จุด)
      const d = tsToDate(readings[i].timestamp);
      rocLabels.push(d ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '');
    }
  } else {
    rocLabels = ['รอข้อมูล...'];
    rocData = [0];
  }

  if (rocChart) {
    rocChart.data.labels = rocLabels;
    rocChart.data.datasets[0].data = rocData;
    rocChart.update('none');
    return;
  }

  const ctx = document.getElementById('rocChart').getContext('2d');
  rocChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: rocLabels,
      datasets: [{
        label: 'อัตราการเปลี่ยนแปลง DO (mg/L ต่อ 10 นาที)',
        data: rocData,
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'top' } },
      scales: {
        y: { 
          title: { display: true, text: 'ΔDO (mg/L / 10 นาที)' },
          suggestedMin: -1,
          suggestedMax: 1,
          grid: {
            color: (ctx) => {
              if (ctx.tick.value === 0) return '#64748b';
              if (ctx.tick.value === -0.5) return '#ef4444';
              return '#e2e8f0';
            },
            lineWidth: (ctx) => {
              if (ctx.tick.value === 0) return 2;
              if (ctx.tick.value === -0.5) return 2;
              return 1;
            }
          },
          ticks: {
            callback: function(value) {
              if (value === -0.5) return '-0.5 (อันตราย)';
              if (value === 0) return '0';
              return value;
            }
          }
        },
        x: { title: { display: true, text: 'เวลา' }, ticks: { maxTicksLimit: 12 } }
      }
    }
  });
}

// ==================== Aerator Status ====================
function listenToAeratorStatus() {
  const commandRef = doc(db, 'commands', currentFarmId);
  onSnapshot(commandRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      const isOn = data.aeratorOn;
      aeratorStatusEl.innerHTML = isOn
        ? '<i data-lucide="power" style="color:#10b981"></i> เปิดอยู่'
        : '<i data-lucide="power-off" style="color:#ef4444"></i> ปิดอยู่';
      aeratorStatusEl.className = 'status-value ' + (isOn ? 'on' : 'off');
    } else {
      aeratorStatusEl.innerHTML = '<i data-lucide="power-off" style="color:#ef4444"></i> ปิดอยู่';
      aeratorStatusEl.className = 'status-value off';
    }
    lucide.createIcons();
  });
}

// ==================== Toggle Aerator (Manual) ====================
toggleBtn.addEventListener('click', async () => {
  if (!currentFarmId) return;

  toggleBtn.disabled = true;
  const commandRef = doc(db, 'commands', currentFarmId);
  const snap = await getDoc(commandRef);
  const currentlyOn = snap.exists() ? snap.data().aeratorOn : false;

  await setDoc(commandRef, {
    aeratorOn: !currentlyOn,
    reason: 'manual',
    farmId: currentFarmId
  });

  toggleBtn.disabled = false;
});

// ==================== Logout ====================
logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'login.html';
});