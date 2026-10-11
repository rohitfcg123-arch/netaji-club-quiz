// Firebase Web SDK initialization for Netaji Club Quiz.
// This web config is intended for browser use. Authorization must be enforced by
// Firebase Authentication + Firestore Security Rules; never add service-account keys here.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCG85CidK3Dczuo9o21QG6AhTJjFAGdynE",
  authDomain: "netaji-club.firebaseapp.com",
  projectId: "netaji-club",
  storageBucket: "netaji-club.firebasestorage.app",
  messagingSenderId: "1085917792894",
  appId: "1:1085917792894:web:b238a7b21112ca22dc262f",
  measurementId: "G-KE6WZSR7JD"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const firebaseConfigured = true;
