import { auth, db } from './firebase-config.js';
import { 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  doc, setDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('farmForm');
const submitBtn = document.getElementById('submitBtn');
const getLocationBtn = document.getElementById('getLocationBtn');
const message = document.getElementById('message');

let currentUser = null;

// เช็คว่า login อยู่หรือเปล่า
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
  } else {
    // ยังไม่ได้ login → ไปหน้า login
    window.location.href = 'login.html';
  }
});

// ปุ่ม "ใช้ตำแหน่งปัจจุบัน" — ดึง GPS จากเบราว์เซอร์
getLocationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('เบราว์เซอร์ไม่รองรับ GPS');
    return;
  }

  getLocationBtn.textContent = '⏳ กำลังค้นหาตำแหน่ง...';
  getLocationBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      document.getElementById('latitude').value = position.coords.latitude.toFixed(6);
      document.getElementById('longitude').value = position.coords.longitude.toFixed(6);
      getLocationBtn.textContent = '✓ ได้ตำแหน่งแล้ว';
      setTimeout(() => {
        getLocationBtn.textContent = '📍 ใช้ตำแหน่งปัจจุบัน';
        getLocationBtn.disabled = false;
      }, 2000);
    },
    (error) => {
      alert('ไม่สามารถดึงตำแหน่งได้: ' + error.message);
      getLocationBtn.textContent = '📍 ใช้ตำแหน่งปัจจุบัน';
      getLocationBtn.disabled = false;
    }
  );
});

// สร้างรหัสฟาร์มแบบสุ่ม FARM-XXXX
function generateFarmId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `FARM-${num}`;
}

// Submit form
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!currentUser) {
    alert('กรุณาเข้าสู่ระบบก่อน');
    return;
  }

  const farmName = document.getElementById('farmName').value.trim();
  const province = document.getElementById('province').value.trim();
  const district = document.getElementById('district').value.trim();
  const aquaType = document.getElementById('aquaType').value;
  const pondSize = parseFloat(document.getElementById('pondSize').value);
  const latitude = parseFloat(document.getElementById('latitude').value);
  const longitude = parseFloat(document.getElementById('longitude').value);

  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังบันทึก...';
  message.className = 'message';

  try {
    const farmId = generateFarmId();

    // 1. บันทึก farm ลง collection 'farms'
    await setDoc(doc(db, 'farms', farmId), {
      ownerId: currentUser.uid,
      farmName: farmName,
      province: province,
      district: district,
      aquaType: aquaType,
      pondSize: pondSize,
      location: {
        lat: latitude,
        lng: longitude
      },
      doThreshold: 5.0,
      rateThreshold: 0.5,
      friends: [],
      aeratorStatus: false,
      createdAt: serverTimestamp()
    });

    // 2. อัปเดต farmId ใน users
    await updateDoc(doc(db, 'users', currentUser.uid), {
      farmId: farmId
    });

    message.className = 'message success';
    message.textContent = `✓ ลงทะเบียนสำเร็จ! รหัสฟาร์มของคุณคือ ${farmId}`;

    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 2500);

  } catch (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'ลงทะเบียนฟาร์ม';
    message.className = 'message error';
    message.textContent = '✗ เกิดข้อผิดพลาด: ' + error.message;
  }
});