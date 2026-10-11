import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const gate = document.getElementById("adminAuthGate");
const form = document.getElementById("adminLoginForm");
const email = document.getElementById("adminEmail");
const password = document.getElementById("adminPassword");
const button = document.getElementById("adminLoginButton");
const message = document.getElementById("adminAuthMessage");
const logoutButton = document.getElementById("adminLogout");
let authorizedUid = null;

async function handleAdminLogout() {
  if (!logoutButton) return;
  logoutButton.disabled = true;
  logoutButton.textContent = "Logging out…";
  try {
    await signOut(auth);
    authorizedUid = null;
    password.value = "";
    email.value = "";
    showGate(true);
    setMessage("आप सुरक्षित रूप से Logout हो गए हैं।");
  } catch (error) {
    console.error("Logout failed:", error);
    setMessage("Logout नहीं हो पाया: " + (error?.message || "दोबारा कोशिश करें।"), true);
  } finally {
    logoutButton.disabled = false;
    logoutButton.textContent = "Logout";
  }
}
if (logoutButton) {
  logoutButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handleAdminLogout();
  });
  logoutButton.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      void handleAdminLogout();
    }
  });
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.background = isError ? "#fde8e8" : "";
  message.style.color = isError ? "#8c2026" : "";
}
function showGate(show) {
  gate.style.display = show ? "grid" : "none";
  document.body.style.overflow = show ? "hidden" : "";
}
async function verifyAdmin(user) {
  const snap = await getDoc(doc(db, "admins", user.uid));
  if (!snap.exists() || snap.data()?.active !== true) {
    throw new Error("इस account को Admin permission नहीं मिली। Firestore में admins/" + user.uid + " document और Boolean active=true जाँचें।");
  }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  setMessage("Login और Admin permission जाँची जा रही है…");
  try {
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
    console.error("Admin authorization failed:", error);
    authorizedUid = null;
    try { await signOut(auth); } catch (signOutError) { console.error(signOutError); }
    showGate(true);
    setMessage(error?.message || "Admin permission नहीं मिली।", true);
  }
});
