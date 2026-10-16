import { auth, db } from "./firebase.js";
import { BRANDING_DEFAULTS, normalizeBranding, resolveBranding, applyBranding, listenForDefaultBranding } from "./branding.js?v=20261013-branding-2";
import { onAuthStateChanged, signOut, getIdTokenResult, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
// Ensure Google login survives navigation from index.html to join.html and page reloads.
try {
  await setPersistence(auth, browserLocalPersistence);
} catch (persistenceError) {
  console.error("Could not enable persistent player authentication on Join page:", persistenceError);
}
let currentUser = null;
let activeCode = "";
let playerName = "";
let quizState = null;
let globalBranding = normalizeBranding(BRANDING_DEFAULTS);
let activeBranding = normalizeBranding(BRANDING_DEFAULTS);
function refreshActiveBranding() {
  activeBranding = resolveBranding(globalBranding, quizState?.settings?.branding);
  applyBranding(activeBranding);
}
let unsubQuiz = null;
let unsubQuestion = null;
let currentIndex = -1;
let answered = false;
let questionShownAt = 0;
let activeQuestionData = null;
let questionListenerGeneration = 0;
let score = 0;
let correctCount = 0;
let selectedLanguage = localStorage.getItem("ncQuizLanguage") || "hi";
const languageSelect = $("quizLanguage");
if (languageSelect) {
  languageSelect.value = ["hi", "en", "bn"].includes(selectedLanguage) ? selectedLanguage : "hi";
  languageSelect.addEventListener("change", () => {
    selectedLanguage = languageSelect.value;
    localStorage.setItem("ncQuizLanguage", selectedLanguage);
    if (activeQuestionData && quizState?.status === "live") {
      const q = localizedQuestion(activeQuestionData);
      $("question").textContent = q.question || "";
      [...$("options").children].forEach((button, i) => {
        button.textContent = String.fromCharCode(65 + i) + ". " + (q.options?.[i] || "");
      });
    }
  });
}
let examLocked = false;
let completedNormally = false;

function setExamLock(locked) {
  examLocked = locked;
  const logout = $("logoutBtn");
  if (logout) {
    logout.disabled = locked;
    logout.textContent = locked ? "Exam चल रहा है" : "Logout";
    logout.title = locked ? "Quiz समाप्त होने तक Logout उपलब्ध नहीं है।" : "Logout";
  }
  if (locked && !history.state?.quizLock) {
    history.pushState({ quizLock: true }, "", location.href);
  }
}
window.addEventListener("beforeunload", event => {
  if (examLocked && !completedNormally) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("popstate", () => {
  if (examLocked && !completedNormally) {
    history.pushState({ quizLock: true }, "", location.href);
    notice("Quiz चल रहा है। Quiz समाप्त होने तक इसी पेज पर रहें। Refresh करने पर भी आपका Quiz यहीं खुलेगा।");
  }
});

function notice(message) { $("notice").textContent = message; }
function clearOptions() { $("options").innerHTML = ""; }
function isPlaceholderQuestion(value) {
  const text = String(value || "").trim().toLowerCase().replace(/\\s+/g, " ");
  return !text ||
    text.includes("the quiz is about to start") ||
    text.includes("please stay on this screen") ||
    text.includes("क्विज़ शुरू होने वाला है") ||
    text.includes("क्विज शुरू होने वाला है") ||
    text.includes("প্রশ্ন এখানে দেখাবে") ||
    text.includes("waiting for the quiz");
}
function localizedQuestion(q) {
  const translated = q?.translations?.[selectedLanguage];
  const base = { question: q?.question || "", options: q?.options || [] };
  if (translated && typeof translated.question === "string" && Array.isArray(translated.options) && translated.options.length === 4) {
    // Some imported records accidentally contain the waiting-screen text in one language.
    // Never display that placeholder as a live question when the source has real text.
    if (!isPlaceholderQuestion(translated.question)) return translated;
    if (!isPlaceholderQuestion(base.question)) {
      return { question: base.question, options: translated.options };
    }
    for (const lang of ["hi", "en", "bn"]) {
      const candidate = q?.translations?.[lang];
      if (candidate && !isPlaceholderQuestion(candidate.question) && Array.isArray(candidate.options) && candidate.options.length === 4) {
        return candidate;
      }
    }
  }
  return base;
}
function authError(e) {
  const messages = {
    "auth/network-request-failed": "Internet connection जाँचें।",
    "permission-denied": "Firebase Rules में permission नहीं मिली।",
    "unavailable": "Internet या Firebase connection जाँचें।"
  };
  return messages[e.code] || e.message || "कुछ गड़बड़ हुई। फिर प्रयास करें।";
}
function showGame() { $("game").classList.remove("hidden"); }
function waiting(message = "Admin के Quiz शुरू करने का इंतज़ार है") {
  $("status").textContent = "Waiting";
  $("timer").textContent = "—";
  $("question").textContent = message;
  clearOptions();
  $("feedback").textContent = "";
}
function stopListeners() {
  if (unsubQuiz) { unsubQuiz(); unsubQuiz = null; }
  if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
}

$("logoutBtn").addEventListener("click", async () => {
  if (examLocked && !completedNormally) {
    notice("Quiz शुरू हो चुका है। Quiz समाप्त होने तक Logout नहीं कर सकते।");
    return;
  }
  stopListeners();
  try {
    await signOut(auth);
    location.replace("index.html");
  } catch (error) {
    notice("Logout नहीं हो पाया: " + authError(error));
  }
});

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) {
    location.replace("index.html");
    return;
  }
  let googleAuthenticated = false;
  try {
    const token = await getIdTokenResult(user);
    googleAuthenticated = token.claims.firebase?.sign_in_provider === "google.com";
  } catch (error) {
    console.error("Could not verify Google sign-in provider:", error);
  }
  if (!googleAuthenticated) {
    try { await signOut(auth); } catch (error) { console.error("Non-Google player sign-out:", error); }
    location.replace("index.html");
    return;
  }
  $("signedInLabel").textContent = "Google Login: " + (user.email || "Google account");
  const savedName = localStorage.getItem("ncQuizPendingName") ||
    localStorage.getItem("ncQuizPlayerName_" + user.uid) || user.displayName || "";
  $("playerName").value = savedName;
  if (savedName) localStorage.setItem("ncQuizPlayerName_" + user.uid, savedName);

  // Remember the previous code as a convenience, but NEVER join automatically on login.
  // A player must explicitly press Start Quiz after reviewing/entering the code.
  const savedCode = localStorage.getItem("ncQuizCode_" + user.uid);
  if (savedCode && !activeCode && !$("quizCode").value.trim()) {
    $("quizCode").value = savedCode;
  }
  $("joinPanel").classList.remove("hidden");
  $("game").classList.add("hidden");
});

$("joinForm").addEventListener("submit", async event => {
  event.preventDefault();
  const code = $("quizCode").value.trim().toUpperCase();
  const name = $("playerName").value.trim();
  if (!name || !code) { notice("अपना नाम और Quiz Code भरें।"); return; }
  if (name.length > 40) { notice("नाम 40 अक्षरों से छोटा रखें।"); return; }
  await joinQuiz(code, name, false);
});

async function joinQuiz(code, name, isResume) {
  if (!currentUser) { notice("Login की जाँच हो रही है। एक पल रुकें।"); return; }
  let stage = "Quiz Code पढ़ना";
  notice("Quiz Code जाँचा जा रहा है…");
  try {
    const quizRef = doc(db, "quizzes", code);
    const snap = await getDoc(quizRef);
    if (!snap.exists()) { notice("Quiz Code नहीं मिला। Admin से सही code लें।"); return; }
    const quiz = snap.data();
    if (quiz.status === "completed") {
      completedNormally = true;
      setExamLock(false);
      localStorage.removeItem("ncQuizCode_" + currentUser.uid);
      notice("यह Quiz समाप्त हो चुका है। अब आप Logout कर सकते हैं या नया Quiz Code ले सकते हैं।");
      return;
    }
    if (!["waiting", "starting", "live"].includes(quiz.status)) {
      notice("यह Quiz अभी Join नहीं किया जा सकता।");
      return;
    }

    stage = "Firebase में खिलाड़ी की पहचान जाँचना";
    playerName = name;
    const playerRef = doc(db, "quizzes", code, "players", currentUser.uid);
    const playerSnap = await getDoc(playerRef);
    if (!playerSnap.exists()) {
      if (!currentUser.email) { notice("Google Account की Email ID नहीं मिली। दूसरी Google ID से Login करें।"); return; }
      stage = "Firebase में खिलाड़ी का नाम और Google Email सेव करना";
      await setDoc(playerRef, {
        name: playerName,
        email: currentUser.email,
        photoURL: currentUser.photoURL || "",
        joinedAt: serverTimestamp()
      });
    } else {
      // UID is the stable identity; preserve the registered name and keep Google email current.
      const existingPlayer = playerSnap.data();
      playerName = existingPlayer.name || playerName;
      $("playerName").value = playerName;
      if (currentUser.email && existingPlayer.email !== currentUser.email) {
        stage = "Firebase में खिलाड़ी की Google Email अपडेट करना";
        await setDoc(playerRef, {
          email: currentUser.email,
          photoURL: currentUser.photoURL || ""
        }, { merge: true });
      }
    }

    stage = "Quiz में शामिल करना";
    activeCode = code;
    completedNormally = false;
    localStorage.setItem("ncQuizPlayerName_" + currentUser.uid, playerName);
    localStorage.setItem("ncQuizCode_" + currentUser.uid, activeCode);
    localStorage.removeItem("ncQuizPendingName");
    $("joinPanel").classList.add("hidden");
    showGame();
    notice(playerName + ", आप Quiz में जुड़ गए हैं। Admin के शुरू करने तक Waiting में रहें।");
    startListening(code);
  } catch (error) {
    console.error("Join quiz:", error);
    notice("Quiz Join नहीं हो पाया (" + stage + "): " + authError(error) + " अगर Rules अभी update किए हैं तो Firebase Console में Publish करें।");
    if (isResume) localStorage.removeItem("ncQuizCode_" + currentUser.uid);
  }
}

function startListening(code) {
  activeCode = String(code).trim().toUpperCase();
  if (unsubQuiz) unsubQuiz();
  unsubQuiz = onSnapshot(doc(db, "quizzes", activeCode), snapshot => {
    if (!snapshot.exists()) {
      waiting("इस Quiz Code का Quiz नहीं मिला।");
      return;
    }
    const incomingQuizState = snapshot.data();
    const previousStatus = quizState?.status || "";
    const previousRunId = String(quizState?.runId || "");
    const incomingRunId = String(incomingQuizState?.runId || "");

    // Force a fresh question listener whenever a new live run starts. Without this,
    // a player can remain on the old waiting/question state if the admin restarts
    // the same quiz at the same question index.
    if (incomingQuizState.status === "live" &&
        (previousStatus !== "live" || incomingRunId !== previousRunId)) {
      currentIndex = -1;
      activeQuestionData = null;
      answered = false;
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
    }

    quizState = incomingQuizState;
    refreshActiveBranding();
    if (quizState.status === "completed") {
      completedNormally = true;
      setExamLock(false);
      localStorage.removeItem("ncQuizCode_" + currentUser.uid);
      $("status").textContent = "Completed";
      $("question").textContent = "Quiz समाप्त हो गया। अब आप Logout कर सकते हैं।";
      $("timer").textContent = "—";
      clearOptions();
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      return;
    }
    if (quizState.status === "starting") {
      // Invalidate in-flight callbacks from the previous question/run before showing countdown.
      questionListenerGeneration++;
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      currentIndex = -1;
      activeQuestionData = null;
      answered = false;
      setExamLock(true);
      $("status").textContent = "Starting";
      $("question").textContent = "क्विज़ शुरू होने वाला है…";
      clearOptions();
      $("feedback").textContent = "";
      $("timer").textContent = Math.max(0, Math.ceil((Number(quizState.startAt || 0) - Date.now()) / 1000));
      return;
    }
    if (quizState.status !== "live") {
      questionListenerGeneration++;
      setExamLock(false);
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      activeQuestionData = null;
      answered = false;
      waiting(activeBranding?.text?.waitingText || "Admin के Quiz शुरू करने का इंतज़ार है");
      currentIndex = -1;
      return;
    }

    setExamLock(true);
    // A reused code can still contain an expired LIVE state from the previous round.
    // On a fresh join, don't reveal that stale question; wait for Admin's next live question.
    const liveSeconds = Math.max(5, Number(quizState.settings?.questionSeconds || 10));
    const liveStartedAt = Number(quizState.questionStartedAt || 0);
    if (!activeQuestionData && (!liveStartedAt || Date.now() >= liveStartedAt + liveSeconds * 1000)) {
      questionListenerGeneration++;
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      currentIndex = -1;
      waiting("पिछले Quiz का समय समाप्त है। Admin के नया Quiz शुरू करने या अगले प्रश्न पर जाने का इंतज़ार करें।");
      return;
    }
    const index = Number(quizState.currentIndex || 0);
    if (index !== currentIndex || !activeQuestionData) {
      currentIndex = index;
      answered = false;
      activeQuestionData = null;
      const listenerGeneration = ++questionListenerGeneration;
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      $("status").textContent = "LIVE";
      $("question").textContent = "प्रश्न लोड हो रहा है…";
      clearOptions();
      $("feedback").textContent = "";
      unsubQuestion = onSnapshot(doc(db, "quizzes", activeCode, "questions", String(index)), async questionSnap => {
        // Ignore callbacks queued by an older question/run or a non-live state.
        if (listenerGeneration !== questionListenerGeneration ||
            currentIndex !== index ||
            activeCode !== code ||
            quizState?.status !== "live" ||
            Number(quizState?.currentIndex || 0) !== index) return;
        if (!questionSnap.exists()) {
          $("status").textContent = "LIVE";
          $("question").textContent = "प्रश्न लोड हो रहा है…";
          clearOptions();
          return;
        }
        activeQuestionData = questionSnap.data();
        const q = localizedQuestion(activeQuestionData);
        questionShownAt = Number(quizState?.questionStartedAt || Date.now());
        $("status").textContent = "LIVE";
        $("question").textContent = q.question || "";
        $("feedback").textContent = "";
        clearOptions();
        (q.options || []).forEach((option, i) => {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.optionIndex = String(i);
          button.textContent = String.fromCharCode(65 + i) + ". " + option;
          button.addEventListener("click", () => submitAnswer(i, index));
          $("options").appendChild(button);
        });

        // After refresh, restore and lock an answer that the player already submitted.
        try {
          const prior = await getDoc(doc(db, "quizzes", activeCode, "answers", currentUser.uid + "_" + index));
          if (currentIndex !== index) return;
          if (prior.exists()) {
            answered = true;
            await displayAnswerFeedback(Number(prior.data().sel), q, true, index);
          }
        } catch (error) {
          console.warn("Could not restore previous answer state:", error);
        }
        updateTimer();
      }, error => {
        console.error("Question listener:", error);
        waiting("प्रश्न लोड नहीं हो रहा। Google Login, Firebase Rules और Internet जाँचें।");
      });
    } else {
      updateTimer();
    }
  }, error => {
    console.error("Quiz listener:", error);
    waiting("Firebase sync error: " + (error.message || "Rules/Internet जाँचें"));
  });
}

async function displayAnswerFeedback(selected, q, fromPrevious = false, questionIndex = currentIndex) {
  const keySnap = await getDoc(doc(db, "quizzes", activeCode, "keys", String(questionIndex)));
  if (questionIndex !== currentIndex) return;
  if (!keySnap.exists()) throw new Error("Correct answer key is not available.");
  const correctIndex = Number(keySnap.data().correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) throw new Error("Correct answer key is invalid.");

  [...$("options").children].forEach((button, index) => {
    button.disabled = true;
    button.classList.remove("answer-correct", "answer-wrong");
    if (index === correctIndex) button.classList.add("answer-correct");
    if (index === selected && selected !== correctIndex) button.classList.add("answer-wrong");
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
  $("score").textContent = String(score);
  $("correctCount").textContent = String(correctCount);
}

async function submitAnswer(selected, questionIndex = currentIndex) {
  if (answered || questionIndex !== currentIndex || !currentUser || !activeCode || !quizState || quizState.status !== "live") return;
  const answerQuestion = activeQuestionData;
  const answerText = localizedQuestion(answerQuestion || {});
  answered = true;
  [...$("options").children].forEach(button => { button.disabled = true; });
  try {
    await setDoc(doc(db, "quizzes", activeCode, "answers", currentUser.uid + "_" + questionIndex), {
      uid: currentUser.uid,
      q: questionIndex,
      sel: selected,
      at: serverTimestamp(),
      // Compatibility only. Ranking uses timestamps created by Firestore.
      elapsedMs: 0
    });
  } catch (error) {
    console.error("Answer submit:", error);
    // Do not re-enable the previous question's buttons after the UI has advanced.
    if (questionIndex === currentIndex) {
      answered = false;
      $("feedback").textContent = "जवाब जमा नहीं हुआ: " + authError(error);
      [...$("options").children].forEach(button => { button.disabled = false; });
    }
    return;
  }
  if (questionIndex !== currentIndex) return;
  try {
    await displayAnswerFeedback(selected, answerText, false, questionIndex);
  } catch (error) {
    console.error("Answer feedback:", error);
    $("feedback").textContent = "✅ आपका जवाब लॉक हो गया है। सही उत्तर दिखाने में समस्या हुई; जवाब बदला नहीं जा सकता।";
  }
}

function updateTimer() {
  if (!quizState) return;
  if (quizState.status === "starting") {
    $("timer").textContent = Math.max(0, Math.ceil((Number(quizState.startAt || 0) - Date.now()) / 1000));
  } else if (quizState.status === "live") {
    const seconds = Number(quizState.settings?.questionSeconds || 10);
    const remainingMs = Math.max(0, seconds * 1000 - (Date.now() - Number(quizState.questionStartedAt || Date.now())));
    $("timer").textContent = Math.ceil(remainingMs / 1000) + " sec";
    if (remainingMs <= 0) {
      [...$("options").children].forEach(button => { button.disabled = true; });
      if (!$("feedback").textContent) $("feedback").textContent = "समय समाप्त। अगले प्रश्न के लिए Admin का इंतज़ार करें।";
    }
  }
}
listenForDefaultBranding((branding, error) => {
  globalBranding = branding;
  refreshActiveBranding();
  if (error) console.warn("Default branding sync unavailable; using built-in theme:", error);
});
setInterval(updateTimer, 250);
