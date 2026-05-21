// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCZFtrmUlHeFkg6i164QW0I8SYcV9mQWxw",
  authDomain: "aqua-monitor-9bdc9.firebaseapp.com",
  projectId: "aqua-monitor-9bdc9",
  storageBucket: "aqua-monitor-9bdc9.appspot.com",
  messagingSenderId: "245956238227",
  appId: "1:245956238227:web:0034d23b6715bd0bd3e666"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);