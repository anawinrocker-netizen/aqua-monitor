import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('registerForm');
const submitBtn = document.getElementById('submitBtn');
const message = document.getElementById('message');

function showError(text) {
  message.className = 'message error';
  message.innerHTML = '<i data-lucide="x" class="icon-inline"></i> ' + text;
  lucide.createIcons();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const acceptTerms = document.getElementById('acceptTerms').checked;
  const publicConsent = document.getElementById('publicConsent').checked;

  // ---------- การตรวจสอบข้อมูลก่อนสมัคร (validation) ----------
  // 1. ตรวจสอบรูปแบบอีเมล
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    showError('รูปแบบอีเมลไม่ถูกต้อง');
    return;
  }

  // 2. รหัสผ่านอย่างน้อย 8 ตัว และมีตัวเลขอย่างน้อย 1 ตัว
  if (password.length < 8 || !/\d/.test(password)) {
    showError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และมีตัวเลขอย่างน้อย 1 ตัว');
    return;
  }

  // 3. รหัสผ่านและการยืนยันรหัสผ่านต้องตรงกัน
  if (password !== confirmPassword) {
    showError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
    return;
  }

  // 4. ต้องยอมรับข้อตกลงการใช้บริการ
  if (!acceptTerms) {
    showError('กรุณายอมรับข้อตกลงการใช้บริการและนโยบายความเป็นส่วนตัวก่อนสมัคร');
    return;
  }

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
      publicConsent: publicConsent,
      createdAt: serverTimestamp()
    });

    // 3. ส่งอีเมลยืนยันตัวตน
    await sendEmailVerification(user);

    // 4. ออกจากระบบ เพื่อบังคับให้ยืนยันอีเมลก่อนเข้าใช้งาน
    await signOut(auth);

    // 5. แสดงข้อความสำเร็จ + ไปหน้าเข้าสู่ระบบ
    message.className = 'message success';
    message.innerHTML = '<i data-lucide="check-circle" class="icon-inline"></i> สมัครสำเร็จ! เราได้ส่งอีเมลยืนยันไปที่ ' + email + ' แล้ว กรุณากดลิงก์ในอีเมลเพื่อยืนยันก่อนเข้าใช้งาน';
    lucide.createIcons();

    setTimeout(() => {
      window.location.href = 'login.html';
    }, 4000);

  } catch (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'สมัครสมาชิก';

    let errorMsg = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
    if (error.code === 'auth/email-already-in-use') {
      errorMsg = 'อีเมลนี้ถูกใช้สมัครแล้ว';
    } else if (error.code === 'auth/invalid-email') {
      errorMsg = 'รูปแบบอีเมลไม่ถูกต้อง';
    } else if (error.code === 'auth/weak-password') {
      errorMsg = 'รหัสผ่านอ่อนเกินไป กรุณาตั้งให้ยากขึ้น';
    }

    showError(errorMsg);
  }
});
