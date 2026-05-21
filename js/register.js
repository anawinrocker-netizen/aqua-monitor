import { auth, db } from './firebase-config.js';
import { 
  createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  doc, setDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('registerForm');
const submitBtn = document.getElementById('submitBtn');
const message = document.getElementById('message');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังสมัคร...';
  message.className = 'message';
  message.textContent = '';

  try {
    // 1. สร้างบัญชีใน Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. บันทึกข้อมูลผู้ใช้ใน Firestore (ยังไม่มี farmId)
    await setDoc(doc(db, 'users', user.uid), {
      name: name,
      email: email,
      farmId: null,
      createdAt: serverTimestamp()
    });

    // 3. แสดงข้อความสำเร็จ + ไปหน้าลงทะเบียนฟาร์ม
    message.className = 'message success';
    message.textContent = '✓ สมัครสมาชิกสำเร็จ! กำลังไปหน้าลงทะเบียนฟาร์ม...';
    
    setTimeout(() => {
      window.location.href = 'setup-farm.html';
    }, 1500);

  } catch (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'สมัครสมาชิก';

    let errorMsg = 'เกิดข้อผิดพลาด: ' + error.message;
    if (error.code === 'auth/email-already-in-use') {
      errorMsg = 'อีเมลนี้ถูกใช้งานแล้ว';
    } else if (error.code === 'auth/invalid-email') {
      errorMsg = 'อีเมลไม่ถูกต้อง';
    } else if (error.code === 'auth/weak-password') {
      errorMsg = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว';
    }

    message.className = 'message error';
    message.textContent = '✗ ' + errorMsg;
  }
});