import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut
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

    // 2. ตรวจสอบว่ายืนยันอีเมลแล้วหรือยัง
    if (!user.emailVerified) {
      // ยังไม่ยืนยัน → ออกจากระบบทันที และแสดงปุ่มส่งอีเมลยืนยันอีกครั้ง
      await signOut(auth);

      submitBtn.disabled = false;
      submitBtn.textContent = 'เข้าสู่ระบบ';

      message.className = 'message error';
      message.style.flexDirection = 'column';
      message.innerHTML =
        '<span><i data-lucide="mail-warning" class="icon-inline"></i> ' +
        'กรุณายืนยันอีเมลก่อนเข้าใช้งาน เราได้ส่งลิงก์ไปที่อีเมลของคุณแล้ว</span>' +
        '<button type="button" id="resendBtn" style="margin-top:12px;">ส่งอีเมลยืนยันอีกครั้ง</button>';
      lucide.createIcons();

      const resendBtn = document.getElementById('resendBtn');
      resendBtn.addEventListener('click', async () => {
        resendBtn.disabled = true;
        resendBtn.textContent = 'กำลังส่ง...';
        try {
          // ต้อง sign in ชั่วคราวเพื่อให้มี user object สำหรับส่งอีเมล
          const cred = await signInWithEmailAndPassword(auth, email, password);
          await sendEmailVerification(cred.user);
          await signOut(auth);
          resendBtn.textContent = 'ส่งอีเมลแล้ว ✓';
        } catch (err) {
          resendBtn.disabled = false;
          resendBtn.textContent = 'ส่งอีเมลยืนยันอีกครั้ง';
        }
      });
      return;
    }

    // 3. ยืนยันแล้ว → ดูว่า user มีฟาร์มหรือยัง
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();

    message.className = 'message success';
    message.innerHTML = '<i data-lucide="check-circle" class="icon-inline"></i> เข้าสู่ระบบสำเร็จ!';
    lucide.createIcons();

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

    let errorMsg = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
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
    message.innerHTML = '<i data-lucide="x" class="icon-inline"></i> ' + errorMsg;
    lucide.createIcons();
  }
});
