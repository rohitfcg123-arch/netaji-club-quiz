import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const gate = document.getElementById("adminAuthGate");
const form = document.getElementById("adminLoginForm");
const email = document.getElementById("adminEmail");
const password = document.getElementById("adminPassword");
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
function adminDeniedError() {
  const error = new Error("इस account को Admin permission नहीं मिली। Firestore में admins/{आपका UID} document और Boolean active=true जाँचें।");
  error.code = "admin/not-authorized";
  return error;
}
async function verifyAdmin(user) {
  const snap = await getDoc(doc(db, "admins", user.uid));
  if (!snap.exists() || snap.data()?.active !== true) throw adminDeniedError();
}

async function handleAdminLogout(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
  if (logoutInProgress) return;
  logoutInProgress = true;
  if (logoutButton) {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out…";
  }
  setMessage("Logout किया जा रहा है…");
  try {
    await signOut(auth);
    authorizedUid = null;
    if (password) password.value = "";
    if (email) email.value = "";
    showGate(true);
    setMessage("आप सुरक्षित रूप से Logout हो गए हैं।");
  } catch (error) {
    console.error("Logout failed:", error);
    setMessage("Logout नहीं हो पाया: " + (error?.message || "दोबारा कोशिश करें।"), true);
  } finally {
    logoutInProgress = false;
    if (logoutButton) {
      logoutButton.disabled = false;
      logoutButton.textContent = "Logout";
    }
  }
}

// Capture the click before any other page script can intercept it.
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("#adminLogout") : null;
  if (target) void handleAdminLogout(event);
}, true);

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!button || !email || !password) return;
  button.disabled = true;
  setMessage("Login और Admin permission जाँची जा रही है…");
  try {
    // Explicitly save the Firebase session in this browser across refreshes.
    await setPersistence(auth, browserLocalPersistence);
    const credential = await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
    await verifyAdmin(credential.user);
    authorizedUid = credential.user.uid;
    setMessage("Admin login successful.");
    showGate(false);
  } catch (error) {
    console.error("Admin login failed:", error);
    if (auth.currentUser && !authorizedUid) {
      try { await signOut(auth); } catch (signOutError) { console.error(signOutError); }
    }
    const code = error?.code || "";
    const friendly = code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
      ? "Email या Password गलत है।"
      : code === "auth/too-many-requests"
      ? "बहुत बार प्रयास हुआ है। थोड़ी देर बाद कोशिश करें।"
      : error?.message || "Login नहीं हो पाया।";
    setMessage(friendly, true);
  } finally {
    button.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    authorizedUid = null;
    showGate(true);
    return;
  }
  try {
    await verifyAdmin(user);
    authorizedUid = user.uid;
    showGate(false);
    setMessage("Admin session verified.");
  } catch (error) {
    console.error("Admin authorization check failed:", error);
    authorizedUid = null;
    showGate(true);

    if (error?.code === "admin/not-authorized") {
      try { await signOut(auth); } catch (signOutError) { console.error(signOutError); }
      setMessage(error.message, true);
    } else {
      // Do not erase a valid session just because Firestore/network was temporarily unavailable.
      setMessage("Login session सेव है, लेकिन Admin permission verify नहीं हो पाई। Internet/Firestore Rules जाँचें और पेज refresh करें। विवरण: " + (error?.message || "Unknown error"), true);
    }
  }
});
