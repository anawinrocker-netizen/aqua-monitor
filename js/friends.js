import { auth, db } from './firebase-config.js';
import { 
  onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const farmInfo = document.getElementById('farmInfo');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResult = document.getElementById('searchResult');
const friendsList = document.getElementById('friendsList');
const friendCount = document.getElementById('friendCount');
const logoutBtn = document.getElementById('logoutBtn');

let currentUser = null;
let currentFarmId = null;
let currentFarmData = null;
let friendsMap = null;
const friendMarkers = [];

// ==================== Helpers ====================
function getDOClass(doVal) {
  if (doVal >= 5) return 'do-good';
  if (doVal >= 3) return 'do-warning';
  return 'do-danger';
}

function getMarkerColor(doVal) {
  if (doVal >= 5) return '#10b981';
  if (doVal >= 3) return '#f59e0b';
  return '#ef4444';
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
  currentFarmData = farmDoc.data();
  farmInfo.textContent = `${currentFarmData.farmName} | ${currentFarmId}`;

  initMap();
  loadFriends();
});

// ==================== Map ====================
function initMap() {
  friendsMap = L.map('friendsMap').setView(
    [currentFarmData.location.lat, currentFarmData.location.lng], 
    8
  );
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18
  }).addTo(friendsMap);

  // เรนเดอร์ไอคอน Lucide ในป๊อปอัปทุกครั้งที่เปิด
  friendsMap.on('popupopen', () => lucide.createIcons());

  // Marker ของฟาร์มเรา (รูปดาว)
  L.marker([currentFarmData.location.lat, currentFarmData.location.lng], {
    title: 'ฟาร์มของคุณ'
  }).addTo(friendsMap).bindPopup(
    `<b><i data-lucide="star" class="icon-inline"></i> ${currentFarmData.farmName}</b><br>${currentFarmId}<br>${currentFarmData.province}`
  );
}

function clearFriendMarkers() {
  friendMarkers.forEach(m => friendsMap.removeLayer(m));
  friendMarkers.length = 0;
}

async function addFriendMarker(farmId, farmData) {
  if (!farmData.location?.lat) return;

  // ดึงค่า DO ล่าสุด
  const q = query(
    collection(db, 'readings'),
    where('farmId', '==', farmId),
    orderBy('__name__', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  const latest = snap.empty ? null : snap.docs[0].data();
  const doVal = latest ? latest.do : null;
  const color = doVal !== null ? getMarkerColor(doVal) : '#999';

  const marker = L.circleMarker([farmData.location.lat, farmData.location.lng], {
    radius: 12,
    fillColor: color,
    color: 'white',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.85
  }).addTo(friendsMap);

  marker.bindPopup(`
    <b>${farmData.farmName}</b><br>
    ${farmId}<br>
    ${farmData.province} | ${farmData.aquaType}<br>
    <b>DO: ${doVal !== null ? doVal.toFixed(2) + ' mg/L' : 'ไม่มีข้อมูล'}</b>
  `);

  friendMarkers.push(marker);
}

// ==================== Search ====================
searchBtn.addEventListener('click', searchFarm);
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') searchFarm();
});

async function searchFarm() {
  const farmIdInput = searchInput.value.trim().toUpperCase();
  searchResult.innerHTML = '';

  if (!farmIdInput) {
    searchResult.innerHTML = '<div class="error-msg">กรุณากรอกรหัสฟาร์ม</div>';
    return;
  }

  if (farmIdInput === currentFarmId) {
    searchResult.innerHTML = '<div class="error-msg">นี่คือฟาร์มของคุณเอง</div>';
    return;
  }

  searchBtn.disabled = true;
  searchBtn.textContent = 'กำลังค้นหา...';

  try {
    const farmDoc = await getDoc(doc(db, 'farms', farmIdInput));

    if (!farmDoc.exists()) {
      searchResult.innerHTML = '<div class="error-msg">ไม่พบฟาร์มนี้ในระบบ</div>';
      return;
    }

    const farmData = farmDoc.data();
    const isAlreadyFriend = (currentFarmData.friends || []).includes(farmIdInput);

    searchResult.innerHTML = `
      <div class="farm-result">
        <h3>${farmData.farmName}</h3>
        <p><b>รหัส:</b> ${farmIdInput}</p>
        <p><b>จังหวัด:</b> ${farmData.province} ${farmData.district || ''}</p>
        <p><b>ประเภทสัตว์น้ำ:</b> ${farmData.aquaType}</p>
        <p><b>ขนาดบ่อ:</b> ${farmData.pondSize} ตร.ม.</p>
        <button class="btn-add ${isAlreadyFriend ? 'btn-added' : ''}"
                id="addFriendBtn"
                ${isAlreadyFriend ? 'disabled' : ''}>
          ${isAlreadyFriend
            ? '<i data-lucide="check" class="icon-inline"></i> เป็นเพื่อนแล้ว'
            : '<i data-lucide="user-plus" class="icon-inline"></i> เพิ่มเป็นเพื่อน'}
        </button>
      </div>
    `;

    lucide.createIcons();

    if (!isAlreadyFriend) {
      document.getElementById('addFriendBtn').addEventListener('click', () => addFriend(farmIdInput));
    }

  } catch (err) {
    searchResult.innerHTML = '<div class="error-msg">เกิดข้อผิดพลาด: ' + err.message + '</div>';
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'ค้นหา';
  }
}

// ==================== Add/Remove Friend ====================
async function addFriend(friendId) {
  try {
    await updateDoc(doc(db, 'farms', currentFarmId), {
      friends: arrayUnion(friendId)
    });

    // Update local cache
    if (!currentFarmData.friends) currentFarmData.friends = [];
    currentFarmData.friends.push(friendId);

    searchResult.innerHTML += '<div class="success-msg"><i data-lucide="check-circle" class="icon-inline"></i> เพิ่มเพื่อนสำเร็จ!</div>';
    lucide.createIcons();
    loadFriends();

    // Clear search after 2 sec
    setTimeout(() => {
      searchInput.value = '';
      searchResult.innerHTML = '';
    }, 2000);

  } catch (err) {
    searchResult.innerHTML += '<div class="error-msg">เพิ่มเพื่อนไม่สำเร็จ: ' + err.message + '</div>';
  }
}

async function removeFriend(friendId) {
  if (!confirm('ลบเพื่อนคนนี้ออกจากเครือข่าย?')) return;

  try {
    await updateDoc(doc(db, 'farms', currentFarmId), {
      friends: arrayRemove(friendId)
    });

    currentFarmData.friends = currentFarmData.friends.filter(id => id !== friendId);
    loadFriends();
  } catch (err) {
    alert('ลบไม่สำเร็จ: ' + err.message);
  }
}

// ==================== Load Friends ====================
async function loadFriends() {
  const friends = currentFarmData.friends || [];
  friendCount.textContent = friends.length;

  clearFriendMarkers();

  if (friends.length === 0) {
    friendsList.innerHTML = '<p class="no-friends">ยังไม่มีเพื่อน — ใช้ช่องค้นหาด้านบนเพื่อเพิ่ม</p>';
    return;
  }

  friendsList.innerHTML = '<p class="no-friends">กำลังโหลด...</p>';
  const cards = [];

  for (const friendId of friends) {
    const farmDoc = await getDoc(doc(db, 'farms', friendId));
    if (!farmDoc.exists()) continue;
    const farmData = farmDoc.data();

    // ดึงค่า DO ล่าสุด
    const q = query(
      collection(db, 'readings'),
      where('farmId', '==', friendId),
      orderBy('__name__', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    const latest = snap.empty ? null : snap.docs[0].data();
    const doVal = latest ? latest.do : null;
    const tempVal = latest ? latest.temperature : null;

    cards.push(`
      <div class="friend-card">
        <h4>${farmData.farmName}</h4>
        <div class="friend-id">${friendId}</div>
        <div class="friend-info"><i data-lucide="map-pin" class="icon-inline"></i> ${farmData.province} ${farmData.district || ''}</div>
        <div class="friend-info"><i data-lucide="fish" class="icon-inline"></i> ${farmData.aquaType}</div>
        <div class="friend-do ${doVal !== null ? getDOClass(doVal) : ''}">
          ${doVal !== null ? doVal.toFixed(2) + ' mg/L' : '-- mg/L'}
        </div>
        <div class="friend-info"><i data-lucide="thermometer" class="icon-inline"></i> ${tempVal !== null ? tempVal.toFixed(1) + '°C' : '--'}</div>
        <button class="btn-remove" data-id="${friendId}">ลบเพื่อน</button>
      </div>
    `);

    // เพิ่ม marker บนแผนที่
    await addFriendMarker(friendId, farmData);
  }

  friendsList.innerHTML = cards.join('');
  lucide.createIcons();

  // Event listener สำหรับปุ่มลบ
  document.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFriend(btn.dataset.id));
  });
}

// ==================== Logout ====================
logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'login.html';
});