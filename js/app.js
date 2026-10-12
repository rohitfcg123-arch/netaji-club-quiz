import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged, signOut, setPersistence, browserLocalPersistence,
  GoogleAuthProvider, signInWithRedirect, getRedirectResult, getIdTokenResult
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, onSnapshot, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const hostMode = params.get("host") === "1";
const requestedCode = (params.get("code") || "").trim().toUpperCase();
let activeCode = "", playerName = "", quizState = null, unsubQuiz = null, unsubQuestion = null;
let score = 0, correctCount = 0, answered = false, currentUser = null, currentIndex = -1, questionShownAt = 0, activeQuestionData = null;
let selectedLanguage = localStorage.getItem("ncQuizLanguage") || "hi";
const languageNames = { hi: "हिंदी", en: "English", bn: "বাংলা" };
function localizedQuestion(q) {
  const t = q && q.translations && q.translations[selectedLanguage];
  if (t && typeof t.question === "string" && Array.isArray(t.options) && t.options.length === 4) return t;
  return { question: q?.question || "", options: q?.options || [] };
}
const languageSelect = $("quizLanguage");
if (languageSelect) {
  languageSelect.value = ["hi","en","bn"].includes(selectedLanguage) ? selectedLanguage : "hi";
  languageSelect.addEventListener("change", () => {
    selectedLanguage = languageSelect.value;
    localStorage.setItem("ncQuizLanguage", selectedLanguage);
  });
}

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
    "auth/too-many-requests": "बहुत बार कोशिश हुई है। कुछ देर बाद फिर प्रयास करें。",
    "auth/network-request-failed": "Internet connection जाँचें।",
    "auth/unauthorized-domain": "Firebase Console में GitHub Pages domain को Authorized domains में जोड़ें।",
    "auth/operation-not-allowed": "Firebase Console में Google sign-in provider enable करें।"
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
  // Players must authenticate with Google only. Password-based sessions from an
  // older version are signed out and cannot enter the player portal.
  async function isGoogleUser(user) {
    try {
      const token = await getIdTokenResult(user);
      return token.claims.firebase?.sign_in_provider === "google.com";
    } catch (error) {
      console.error("Could not verify Google sign-in provider:", error);
      return false;
    }
  }

  async function routeAuthenticatedUser(user) {
    if (!user) return;
    if (!(await isGoogleUser(user))) {
      try { await signOut(auth); } catch (error) { console.error("Sign out non-Google player:", error); }
      authNotice("Player Portal में केवल Continue with Google से Login कर सकते हैं।");
      return;
    }
    if (redirectCheckFinished) location.replace("join.html");
  }

  $("googleLoginBtn").addEventListener("click", async () => {
    $("googleLoginBtn").disabled = true;
    authNotice("Google Login खोला जा रहा है…");
    try {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithRedirect(auth, provider);
    } catch (err) {
      console.error("Google Login:", err);
      authNotice(authError(err));
      $("googleLoginBtn").disabled = false;
    }
  });

  let redirectCheckFinished = false;
  getRedirectResult(auth).then(result => {
    if (result?.user) authNotice("Google Login सफल हुआ। आगे बढ़ रहे हैं…");
  }).catch(err => {
    console.error("Google redirect result:", err);
    authNotice(authError(err));
  }).finally(() => {
    redirectCheckFinished = true;
    if (auth.currentUser) void routeAuthenticatedUser(auth.currentUser);
  });

  onAuthStateChanged(auth, user => {
    if (!user) return;
    const typedName = localStorage.getItem("ncQuizPendingName");
    if (typedName && !user.displayName) localStorage.setItem("ncQuizPendingName", typedName);
    void routeAuthenticatedUser(user);
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
      unsubQuestion = onSnapshot(doc(db, "quizzes", activeCode, "questions", String(idx)), async qSnap => {
        if (!qSnap.exists()) { waiting("प्रश्न लोड हो रहा है…"); return; }
        activeQuestionData = qSnap.data();
        const q = localizedQuestion(activeQuestionData);
        questionShownAt = Number(quizState.questionStartedAt || Date.now());
        $("status").textContent = "LIVE";
        $("question").textContent = q.question || "";
        $("feedback").textContent = "";
        clearOptions();
        (q.options || []).forEach((o, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.dataset.optionIndex = String(i);
          b.textContent = String.fromCharCode(65 + i) + ". " + o;
          if (!hostMode) b.addEventListener("click", () => submitAnswer(i));
          $("options").appendChild(b);
        });
        // If the player refreshes after answering, preserve the locked answer.
        if (!hostMode && currentUser) {
          try {
            const prior = await getDoc(doc(db, "quizzes", activeCode, "answers", currentUser.uid + "_" + currentIndex));
            if (prior.exists()) {
              answered = true;
              await displayAnswerFeedback(Number(prior.data().sel), q, true);
            }
          } catch (answerReadError) {
            console.warn("Could not restore previous answer state", answerReadError);
          }
        }
        updateTimer();
      }, e => {
        console.error("Question listener:", e);
        waiting("Question access error: Google Login और Firebase Rules जाँचें।");
      });
    } else updateTimer();
  }, e => {
    console.error("Quiz listener:", e);
    waiting("Firebase sync error: " + (e.message || "Rules/Internet जाँचें"));
  });
}

async function displayAnswerFeedback(selected, q, fromPrevious = false) {
  const keySnap = await getDoc(doc(db, "quizzes", activeCode, "keys", String(currentIndex)));
  if (!keySnap.exists()) throw new Error("Correct answer key is not available.");
  const correctIndex = Number(keySnap.data().correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) throw new Error("Correct answer key is invalid.");
  [...$("options").children].forEach((button, i) => {
    button.disabled = true;
    button.classList.remove("answer-correct", "answer-wrong");
    if (i === correctIndex) button.classList.add("answer-correct");
    if (i === selected && selected !== correctIndex) button.classList.add("answer-wrong");
  });
  if (selected === correctIndex) {
    if (!fromPrevious) {
      correctCount += 1;
      score += Number(quizState?.settings?.pointsPerCorrect || 10);
    }
    $("feedback").textContent = "✅ सही जवाब! Correct: " + (q.options?.[correctIndex] || "");
  } else {
    $("feedback").textContent = "❌ गलत जवाब। सही उत्तर: " + (q.options?.[correctIndex] || "");
  }
  if ($("score")) $("score").textContent = String(score);
  if ($("correctCount")) $("correctCount").textContent = String(correctCount);
}

async function submitAnswer(selected) {
  if (answered || !currentUser || !activeCode || !quizState || quizState.status !== "live") return;
  answered = true;
  [...$("options").children].forEach(x => x.disabled = true);
  try {
    await setDoc(doc(db, "quizzes", activeCode, "answers", currentUser.uid + "_" + currentIndex), {
      uid: currentUser.uid,
      q: currentIndex,
      sel: selected,
      at: serverTimestamp(),
      elapsedMs: Math.max(0, Math.min(
        Number(quizState.settings?.questionSeconds || 10) * 1000,
        Date.now() - Number(questionShownAt || quizState.questionStartedAt || Date.now())
      ))
    });
  } catch (err) {
    console.error("Answer submit:", err);
    answered = false;
    $("feedback").textContent = "जवाब जमा नहीं हुआ: " + authError(err);
    [...$("options").children].forEach(x => x.disabled = false);
    return;
  }
  try {
    const q = localizedQuestion(activeQuestionData || {});
    await displayAnswerFeedback(selected, q);
  } catch (err) {
    // Keep the submitted choice locked even if answer feedback retrieval fails.
    console.error("Answer feedback:", err);
    $("feedback").textContent = "✅ आपका जवाब लॉक हो गया है। सही उत्तर दिखाने में समस्या हुई; जवाब बदला नहीं जा सकता।";
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
    const remainingMs = Math.max(0, sec * 1000 - (Date.now() - Number(quizState.questionStartedAt || Date.now())));
    $("timer").textContent = (remainingMs / 1000).toFixed(1) + " sec";
  }
}
setInterval(updateTimer, 250);
