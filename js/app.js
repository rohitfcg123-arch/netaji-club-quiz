import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, onSnapshot, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const hostMode = params.get("host") === "1";
const requestedCode = (params.get("code") || "").trim().toUpperCase();
let activeCode = "", playerName = "", quizState = null, unsubQuiz = null, unsubQuestion = null;
let score = 0, answered = false, currentUser = null, currentIndex = -1;

function notice(t) { if ($("notice")) $("notice").textContent = t; }
function authNotice(t) { if ($("authNotice")) $("authNotice").textContent = t; }
function clearOptions() { $("options").innerHTML = ""; }
function waiting(text = "Admin के Quiz शुरू करने का इंतज़ार है") {
  $("status").textContent = "Waiting";
  $("timer").textContent = "—";
  $("question").textContent = text;
  clearOptions();
  $("feedback").textContent = "";
}
function showGame() { $("game").classList.remove("hidden"); }
function authError(e) {
  const messages = {
    "auth/email-already-in-use": "इस Email से अकाउंट पहले से बना है। Login करें।",
    "auth/invalid-email": "Email ID सही नहीं है।",
    "auth/weak-password": "Password कम से कम 6 अक्षर का रखें।",
    "auth/invalid-credential": "Email या Password गलत है।",
    "auth/too-many-requests": "बहुत बार कोशिश हुई है। कुछ देर बाद फिर प्रयास करें。",
    "auth/network-request-failed": "Internet connection जाँचें।"
  };
  return messages[e.code] || e.message || "कुछ गड़बड़ हुई। फिर प्रयास करें।";
}

if (hostMode) {
  document.body.classList.add("host-mode");
  document.querySelector(".hero")?.classList.add("hidden");
  $("game").classList.remove("hidden");
  $("score")?.closest("p")?.classList.add("hidden");
  $("feedback").classList.add("hidden");
  if (requestedCode) startListening(requestedCode);
  else waiting("Quiz Code नहीं मिला।");
} else {
  $("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    authNotice("Login हो रहा है…");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, $("authEmail").value.trim(), $("authPassword").value);
      authNotice("Login सफल हुआ।");
    } catch (err) {
      console.error(err);
      authNotice(authError(err));
    }
  });

  $("registerBtn").addEventListener("click", async () => {
    const name = $("authName").value.trim();
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if (!name) { authNotice("अकाउंट बनाने के लिए अपना नाम भरें।"); return; }
    if (name.length > 40) { authNotice("नाम 40 अक्षरों से छोटा रखें।"); return; }
    authNotice("अकाउंट बनाया जा रहा है…");
    try {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      $("authName").value = name;
      authNotice("अकाउंट बन गया! अब Quiz Code डालकर Join करें।");
    } catch (err) {
      console.error(err);
      authNotice(authError(err));
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    try { await signOut(auth); notice("आप Logout हो गए हैं।"); }
    catch (e) { notice("Logout नहीं हो पाया: " + authError(e)); }
  });

  onAuthStateChanged(auth, user => {
    currentUser = user;
    $("authPanel").classList.toggle("hidden", !!user);
    $("playerPanel").classList.toggle("hidden", !user);
    if (user) {
      const suggestedName = user.displayName || $("authName").value.trim() || "";
      $("signedInLabel").textContent = "Logged in: " + (user.email || "");
      $("playerName").value = suggestedName;
      authNotice("");
    } else {
      if (unsubQuiz) { unsubQuiz(); unsubQuiz = null; }
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      $("game").classList.add("hidden");
    }
  });

  $("joinForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentUser) { notice("पहले Email और Password से Login करें।"); return; }
    const code = $("quizCode").value.trim().toUpperCase();
    playerName = $("playerName").value.trim();
    if (!code || !playerName) { notice("Quiz Code और नाम भरें।"); return; }
    if (playerName.length > 40) { notice("नाम 40 अक्षरों से छोटा रखें।"); return; }
    notice("Firebase से Quiz जाँचा जा रहा है…");
    try {
      const snap = await getDoc(doc(db, "quizzes", code));
      if (!snap.exists()) { notice("Quiz Code नहीं मिला। Admin से सही code लें।"); return; }
      const quiz = snap.data();
      if (quiz.status === "completed") { notice("यह क्विज़ समाप्त हो चुका है।"); return; }
      if (!["waiting", "starting", "live"].includes(quiz.status)) {
        notice("यह Quiz अभी Join नहीं किया जा सकता।"); return;
      }
      const playerRef = doc(db, "quizzes", code, "players", currentUser.uid);
      const playerSnap = await getDoc(playerRef);
      if (!playerSnap.exists()) {
        await setDoc(playerRef, {
          name: playerName, joinedAt: serverTimestamp()
        });
      } else if (playerSnap.data().name !== playerName) {
        notice("Aap is quiz mein pehle se join kar chuke hain. Wahi naam use karein: " + playerSnap.data().name);
        playerName = playerSnap.data().name;
        $("playerName").value = playerName;
      }
      showGame();
      notice(playerName + ", आप Quiz से जुड़ गए हैं।");
      startListening(code);
    } catch (err) {
      console.error(err);
      notice("Join नहीं हो पाया: " + authError(err) + " (Firebase Rules जाँचें)");
    }
  });
}

function startListening(code) {
  activeCode = String(code).toUpperCase();
  if (unsubQuiz) unsubQuiz();
  unsubQuiz = onSnapshot(doc(db, "quizzes", activeCode), snap => {
    if (!snap.exists()) { waiting("इस Quiz Code का Quiz नहीं मिला।"); return; }
    quizState = snap.data();
    if (quizState.status === "completed") {
      $("status").textContent = "Completed";
      $("question").textContent = "Quiz समाप्त हो गया।";
      $("timer").textContent = "—";
      clearOptions();
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      return;
    }
    if (quizState.status === "starting") {
      $("status").textContent = "Starting";
      $("question").textContent = "क्विज़ शुरू होने वाला है…";
      clearOptions();
      $("timer").textContent = Math.max(0, Math.ceil((Number(quizState.startAt || 0) - Date.now()) / 1000));
      return;
    }
    if (quizState.status !== "live") { waiting("Admin के Quiz शुरू करने का इंतज़ार है"); return; }

    const idx = Number(quizState.currentIndex || 0);
    if (idx !== currentIndex) {
      currentIndex = idx;
      answered = false;
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      unsubQuestion = onSnapshot(doc(db, "quizzes", activeCode, "questions", String(idx)), qSnap => {
        if (!qSnap.exists()) { waiting("प्रश्न लोड हो रहा है…"); return; }
        const q = qSnap.data();
        $("status").textContent = "LIVE";
        $("question").textContent = q.question || "";
        $("feedback").textContent = "";
        clearOptions();
        (q.options || []).forEach((o, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = String.fromCharCode(65 + i) + ". " + o;
          if (!hostMode) b.addEventListener("click", () => submitAnswer(i));
          $("options").appendChild(b);
        });
        updateTimer();
      }, e => {
        console.error("Question listener:", e);
        waiting("Question access error: Email से Login और Firebase Rules जाँचें।");
      });
    } else updateTimer();
  }, e => {
    console.error("Quiz listener:", e);
    waiting("Firebase sync error: " + (e.message || "Rules/Internet जाँचें"));
  });
}

async function submitAnswer(selected) {
  if (answered || !currentUser || !activeCode || !quizState) return;
  answered = true;
  [...$("options").children].forEach(x => x.disabled = true);
  try {
    await setDoc(doc(db, "quizzes", activeCode, "answers", currentUser.uid + "_" + currentIndex), {
      uid: currentUser.uid,
      q: currentIndex,
      sel: selected,
      at: serverTimestamp()
    });
    $("feedback").textContent = "आपका जवाब जमा हो गया।";
  } catch (err) {
    console.error("Answer submit:", err);
    answered = false;
    $("feedback").textContent = "जवाब जमा नहीं हुआ: " + authError(err);
    [...$("options").children].forEach(x => x.disabled = false);
  }
}

function updateTimer() {
  if (!quizState) return;
  if (quizState.status === "starting") {
    $("timer").textContent = Math.max(0, Math.ceil((Number(quizState.startAt || 0) - Date.now()) / 1000));
    return;
  }
  if (quizState.status === "live") {
    const sec = Number(quizState.settings?.questionSeconds || 10);
    $("timer").textContent = Math.max(0, sec - Math.floor((Date.now() - Number(quizState.questionStartedAt || Date.now())) / 1000));
  }
}
setInterval(updateTimer, 250);
