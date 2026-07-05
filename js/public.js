import { db } from './firebase-config.js';
import { 
  collection, getDocs, query, where, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function getRegion(province) {
  if (!province) return 'อื่นๆ';
  const north = ['เชียงใหม่','เชียงราย','ลำพูน','ลำปาง','แม่ฮ่องสอน','พะเยา','น่าน','แพร่','อุตรดิตถ์'];
  const northeast = ['ขอนแก่น','นครราชสีมา','อุดรธานี','อุบลราชธานี','ร้อยเอ็ด','มหาสารคาม','กาฬสินธุ์','สกลนคร','นครพนม','มุกดาหาร','ยโสธร','อำนาจเจริญ','เลย','หนองคาย','หนองบัวลำภู','ศรีสะเกษ','สุรินทร์','บุรีรัมย์','ชัยภูมิ','บึงกาฬ'];
  const south = ['ตรัง','สงขลา','ภูเก็ต','กระบี่','พังงา','ระนอง','ชุมพร','สุราษฎร์ธานี','นครศรีธรรมราช','พัทลุง','สตูล','ปัตตานี','ยะลา','นราธิวาส'];
  const east = ['ชลบุรี','ระยอง','จันทบุรี','ตราด','ฉะเชิงเทรา','ปราจีนบุรี','สระแก้ว'];
  
  if (north.includes(province)) return 'เหนือ';
  if (northeast.includes(province)) return 'อีสาน';
  if (south.includes(province)) return 'ใต้';
  if (east.includes(province)) return 'ตะวันออก';
  return 'กลาง';
}

function getMarkerColor(doVal) {
  if (doVal >= 5) return '#10b981';
  if (doVal >= 3) return '#f59e0b';
  return '#ef4444';
}

function getDoClassPopup(doVal) {
  if (doVal >= 5) return 'do-good-popup';
  if (doVal >= 3) return 'do-warning-popup';
  return 'do-danger-popup';
}

// Init Map
const map = L.map('map').setView([13.7563, 100.5018], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 18
}).addTo(map);

// Global data
let allFarms = [];
let allFarmLatest = {};
let regionDOChart = null, regionTempChart = null;
let aquaDOChart = null, aquaTempChart = null;

// ==================== Chart.js premium styling (visual only) ====================
// NOTE: data & queries below are unchanged — these helpers only affect appearance.
Chart.defaults.font.family = "'IBM Plex Sans Thai','Prompt',sans-serif";
Chart.defaults.font.size = 13;
Chart.defaults.color = '#64748b';

const OCEAN_BAR = { from: '#0284c7', to: '#7dd3fc' };
const CYAN_BAR  = { from: '#0891b2', to: '#67e8f9' };

function makeBarGradient(ctx, area, from, to) {
  if (!area) return from; // chartArea not ready on first paint
  const g = ctx.createLinearGradient(0, area.bottom, 0, area.top);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

function barDataset(label, data, palette) {
  return {
    label: label,
    data: data,
    backgroundColor: (c) => makeBarGradient(c.chart.ctx, c.chart.chartArea, palette.from, palette.to),
    hoverBackgroundColor: (c) => makeBarGradient(c.chart.ctx, c.chart.chartArea, palette.from, palette.to),
    borderRadius: 8,
    borderSkipped: false,
    maxBarThickness: 56
  };
}

function chartOptions(beginAtZero, unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 8, right: 6, bottom: 2, left: 2 } },
    animation: { duration: 700, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(12,74,110,0.96)',
        padding: 12,
        cornerRadius: 10,
        displayColors: false,
        caretSize: 6,
        titleFont: { family: "'Prompt',sans-serif", weight: '600', size: 13 },
        bodyFont: { size: 13 },
        callbacks: {
          label: (item) => `${item.formattedValue}${unit ? ' ' + unit : ''}`
        }
      }
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: { color: '#64748b', maxRotation: 0, autoSkip: true }
      },
      y: {
        beginAtZero: beginAtZero,
        border: { display: false },
        grid: { color: 'rgba(14,165,233,0.10)', drawTicks: false },
        ticks: { color: '#94a3b8', padding: 8, maxTicksLimit: 6 }
      }
    }
  };
}

// ==================== Load Data ====================
async function loadPublicData() {
  try {
    const farmsSnap = await getDocs(collection(db, 'farms'));
    const farms = [];
    farmsSnap.forEach(doc => farms.push({ id: doc.id, ...doc.data() }));

    document.getElementById('totalFarms').textContent = farms.length;

    let totalDO = 0, totalTemp = 0, validCount = 0;
    const farmLatest = {};
    let totalReadings = 0;

    for (const farm of farms) {
      const q = query(
        collection(db, 'readings'),
        where('farmId', '==', farm.id),
        orderBy('__name__', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      
      const allSnap = await getDocs(query(collection(db, 'readings'), where('farmId', '==', farm.id)));
      totalReadings += allSnap.size;

      if (!snap.empty) {
        const latest = snap.docs[0].data();
        farmLatest[farm.id] = latest;
        totalDO += latest.do;
        totalTemp += latest.temperature;
        validCount++;
      }
    }

    document.getElementById('avgDO').textContent = validCount > 0 ? (totalDO / validCount).toFixed(2) : '--';
    document.getElementById('avgTemp').textContent = validCount > 0 ? (totalTemp / validCount).toFixed(1) : '--';
    document.getElementById('totalReadings').textContent = totalReadings.toLocaleString();

    // Markers
    farms.forEach(farm => {
      if (!farm.location || !farm.location.lat) return;
      const latest = farmLatest[farm.id];
      const doVal = latest ? latest.do : null;
      const color = doVal !== null ? getMarkerColor(doVal) : '#999';

      const marker = L.circleMarker([farm.location.lat, farm.location.lng], {
        radius: 10,
        fillColor: color,
        color: 'white',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map);

      const popupHtml = `
        <div class="farm-popup">
          <b>${farm.province || '-'} | ${farm.aquaType || '-'}</b><br>
          <div class="do-value ${doVal !== null ? getDoClassPopup(doVal) : ''}">
            DO: ${doVal !== null ? doVal.toFixed(2) + ' mg/L' : 'ไม่มีข้อมูล'}
          </div>
          ${latest ? `อุณหภูมิ: ${latest.temperature.toFixed(1)}°C` : ''}
        </div>
      `;
      marker.bindPopup(popupHtml);
    });

    allFarms = farms;
    allFarmLatest = farmLatest;

    drawRegionCharts('all');
    drawAquaTypeCharts('all');

  } catch (err) {
    console.error('Load public data error:', err);
  }
}

// ==================== Region Charts ====================
function drawRegionCharts(filterRegion) {
  // ถ้าเลือก "ทั้งหมด" → แสดงเปรียบเทียบทุกภาค
  // ถ้าเลือกภาคใดภาคหนึ่ง → แสดงเปรียบเทียบทุกจังหวัดในภาคนั้น
  
  const dataMap = {};
  
  allFarms.forEach(farm => {
    const latest = allFarmLatest[farm.id];
    if (!latest) return;
    
    const region = getRegion(farm.province);
    
    if (filterRegion === 'all') {
      // กลุ่มตามภาค
      if (!dataMap[region]) dataMap[region] = { doSum: 0, tempSum: 0, count: 0 };
      dataMap[region].doSum += latest.do;
      dataMap[region].tempSum += latest.temperature;
      dataMap[region].count++;
    } else {
      // กลุ่มตามจังหวัด (เฉพาะภาคที่เลือก)
      if (region !== filterRegion) return;
      const key = farm.province || 'ไม่ระบุ';
      if (!dataMap[key]) dataMap[key] = { doSum: 0, tempSum: 0, count: 0 };
      dataMap[key].doSum += latest.do;
      dataMap[key].tempSum += latest.temperature;
      dataMap[key].count++;
    }
  });

  const labels = Object.keys(dataMap);
  const doData = labels.map(k => (dataMap[k].doSum / dataMap[k].count).toFixed(2));
  const tempData = labels.map(k => (dataMap[k].tempSum / dataMap[k].count).toFixed(2));

  // DO Chart
  if (regionDOChart) regionDOChart.destroy();
  regionDOChart = new Chart(document.getElementById('regionDOChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [barDataset('DO (mg/L)', doData, OCEAN_BAR)]
    },
    options: chartOptions(true, 'mg/L')
  });

  // Temp Chart
  if (regionTempChart) regionTempChart.destroy();
  regionTempChart = new Chart(document.getElementById('regionTempChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [barDataset('อุณหภูมิ (°C)', tempData, OCEAN_BAR)]
    },
    options: chartOptions(false, '°C')
  });
}

// ==================== Aqua Type Charts ====================
function drawAquaTypeCharts(filterType) {
  const dataMap = {};
  
  allFarms.forEach(farm => {
    const latest = allFarmLatest[farm.id];
    if (!latest) return;
    
    const type = farm.aquaType || 'อื่นๆ';
    
    if (filterType === 'all') {
      // กลุ่มตามชนิดสัตว์น้ำ
      if (!dataMap[type]) dataMap[type] = { doSum: 0, tempSum: 0, count: 0 };
      dataMap[type].doSum += latest.do;
      dataMap[type].tempSum += latest.temperature;
      dataMap[type].count++;
    } else {
      // กลุ่มตามจังหวัด (เฉพาะชนิดที่เลือก)
      if (type !== filterType) return;
      const key = farm.province || 'ไม่ระบุ';
      if (!dataMap[key]) dataMap[key] = { doSum: 0, tempSum: 0, count: 0 };
      dataMap[key].doSum += latest.do;
      dataMap[key].tempSum += latest.temperature;
      dataMap[key].count++;
    }
  });

  const labels = Object.keys(dataMap);
  const doData = labels.map(k => (dataMap[k].doSum / dataMap[k].count).toFixed(2));
  const tempData = labels.map(k => (dataMap[k].tempSum / dataMap[k].count).toFixed(2));

  if (aquaDOChart) aquaDOChart.destroy();
  aquaDOChart = new Chart(document.getElementById('aquaDOChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [barDataset('DO (mg/L)', doData, CYAN_BAR)]
    },
    options: chartOptions(true, 'mg/L')
  });

  if (aquaTempChart) aquaTempChart.destroy();
  aquaTempChart = new Chart(document.getElementById('aquaTempChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [barDataset('อุณหภูมิ (°C)', tempData, CYAN_BAR)]
    },
    options: chartOptions(false, '°C')
  });
}

// ==================== Event Listeners ====================
document.getElementById('regionFilter').addEventListener('change', (e) => {
  drawRegionCharts(e.target.value);
});

document.getElementById('aquaTypeFilter').addEventListener('change', (e) => {
  drawAquaTypeCharts(e.target.value);
});

loadPublicData();