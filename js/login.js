import { auth, db } from './firebase-config.js';
import { 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  doc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const message = document.getElementById('message');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังเข้าสู่ระบบ...';
  message.className = 'message';

  try {
    // 1. Login ผ่าน Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. ดูว่า user มีฟาร์มหรือยัง
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();

    message.className = 'message success';
    message.textContent = '✓ เข้าสู่ระบบสำเร็จ!';

    setTimeout(() => {
      if (userData && userData.farmId) {
        // มีฟาร์มแล้ว → ไป dashboard
        window.location.href = 'dashboard.html';
      } else {
        // ยังไม่มีฟาร์ม → ไปลงทะเบียนฟาร์ม
        window.location.href = 'setup-farm.html';
      }
    }, 1000);

  } catch (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'เข้าสู่ระบบ';

    let errorMsg = 'เกิดข้อผิดพลาด';
    if (error.code === 'auth/invalid-credential' || 
        error.code === 'auth/wrong-password' || 
        error.code === 'auth/user-not-found') {
      errorMsg = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    } else if (error.code === 'auth/invalid-email') {
      errorMsg = 'รูปแบบอีเมลไม่ถูกต้อง';
    } else if (error.code === 'auth/too-many-requests') {
      errorMsg = 'ล็อกอินผิดบ่อยเกินไป กรุณารอสักครู่';
    }

    message.className = 'message error';
    message.textContent = '✗ ' + errorMsg;
  }
});