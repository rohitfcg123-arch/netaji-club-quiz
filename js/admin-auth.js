import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, getIdTokenResult,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ROOT_ADMIN = "rohit.fcg123@gmail.com";
const gate = document.getElementById("adminAuthGate");
const form = document.getElementById("adminLoginForm");
const button = document.getElementById("adminLoginButton");
const message = document.getElementById("adminAuthMessage");
const logoutButton = document.getElementById("adminLogout");
let authorizedUid = null;
let logoutInProgress = false;

function setMessage(text, isError = false) {
  if (!message) return;
  message.textContent = text;
  message.style.background = isError ? "#fde8e8" : "";
  message.style.color = isError ? "#8c2026" : "";
}
function showGate(show) {
  if (gate) gate.style.display = show ? "grid" : "none";
  document.body.style.overflow = show ? "hidden" : "";
}
function normalizedEmail(user) { return String(user?.email || "").trim().toLowerCase(); }

async function verifyAdmin(user) {
  if (!user || !user.email) throw new Error("Google account ka email available nahi hai.");
  const token = await getIdTokenResult(user);
  if (token.claims.firebase?.sign_in_provider !== "google.com") throw new Error("Email/password login band hai. Continue with Google use karein.");
  const email = normalizedEmail(user);
  if (email === ROOT_ADMIN) return;
  const snap = await getDoc(doc(db, "approvedAdminEmails", email));
  if (!snap.exists() || snap.data()?.active !== true || String(snap.data()?.email || "").toLowerCase() !== email) {
    const error = new Error("Is Google account ko Admin approval nahi mila hai. Root Admin se approval lein.");
    error.code = "admin/not-authorized";
    throw error;
  }
}

async function handleAdminLogout(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
  if (logoutInProgress) return;
  logoutInProgress = true;
  if (logoutButton) { logoutButton.disabled = true; logoutButton.textContent = "Logging out…"; }
  try {
    await signOut(auth);
    authorizedUid = null;
    showGate(true);
    setMessage("Google account se logout ho gaye.");
  } catch (error) {
    console.error("Logout failed:", error);
    setMessage("Logout nahi hua: " + (error?.message || "Dobara try karein."), true);
  } finally {
    logoutInProgress = false;
    if (logoutButton) { logoutButton.disabled = false; logoutButton.textContent = "Logout"; }
  }
}
document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target.closest("#adminLogout") : null;
  if (target) void handleAdminLogout(event);
}, true);

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!button) return;
  button.disabled = true;
  setMessage("Google account aur Admin approval verify ho raha hai…");
  try {
    await setPersistence(auth, browserLocalPersistence);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const credential = await signInWithPopup(auth, provider);
    await verifyAdmin(credential.user);
    authorizedUid = credential.user.uid;
    setMessage("Admin login successful.");
    showGate(false);
    location.reload();
  } catch (error) {
    console.error("Admin Google login failed:", error);
    if (error?.code === "admin/not-authorized" && auth.currentUser) {
      try { await signOut(auth); } catch (e) { console.error(e); }
    }
    const code = error?.code || "";
    const friendly = code === "auth/popup-blocked" ? "Popup block ho gaya. Chrome mein popups allow karke retry karein."
      : code === "auth/popup-closed-by-user" ? "Login window band ho gayi. Dobara Login with Google dabayein."
      : code === "auth/unauthorized-domain" ? "Firebase Authentication ke Authorized domains mein rohitfcg123-arch.github.io add karein."
      : error?.message || "Google login nahi ho paya.";
    setMessage(friendly, true);
  } finally { button.disabled = false; }
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    authorizedUid = null;
    showGate(true);
    return;
  }
  try {
    await verifyAdmin(user);
    authorizedUid = user.uid;
    showGate(false);
  } catch (error) {
    console.error("Admin authorization check failed:", error);
    authorizedUid = null;
    showGate(true);
    if (error?.code === "admin/not-authorized") {
      try { await signOut(auth); } catch (e) { console.error(e); }
      setMessage(error.message, true);
    } else {
      setMessage("Admin approval verify nahi ho saka. Internet/Firestore Rules check karein. " + (error?.message || ""), true);
    }
  }
});
