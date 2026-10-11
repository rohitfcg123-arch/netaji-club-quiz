// Configure this file with the WEB APP config from your own Firebase project.
// Do not add service-account private keys or Admin SDK credentials here.
// This demo's quiz flow currently uses localStorage; Firebase live sync is not wired yet.
export const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_WEB_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_WEB_APP_ID"
};
export const firebaseConfigured = !Object.values(firebaseConfig).some(v => String(v).startsWith("PASTE_") || String(v).startsWith("YOUR_"));