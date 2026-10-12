import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut, getIdTokenResult } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
let currentUser = null;
let activeCode = "";
let playerName = "";
let quizState = null;
let unsubQuiz = null;
let unsubQuestion = null;
let currentIndex = -1;
let answered = false;
let questionShownAt = 0;
let activeQuestionData = null;
let score = 0;
let correctCount = 0;
let selectedLanguage = localStorage.getItem("ncQuizLanguage") || "hi";
const languageNames = { hi: "हिंदी", en: "English", bn: "বাংলা" };

function notice(message) { $("notice").textContent = message; }
function clearOptions() { $("options").innerHTML = ""; }
function localizedQuestion(q) {
  const translated = q?.translations?.[selectedLanguage];
  if (translated && typeof translated.question === "string" && Array.isArray(translated.options) && translated.options.length === 4) return translated;
  return { question: q?.question || "", options: q?.options || [] };
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

  // If this player reloads after pressing Start Quiz, restore the last waiting/live quiz.
  const savedCode = localStorage.getItem("ncQuizCode_" + user.uid);
  if (savedCode && !activeCode) {
    const savedPlayerName = $("playerName").value.trim();
    if (savedPlayerName) {
      $("quizCode").value = savedCode;
      await joinQuiz(savedCode, savedPlayerName, true);
    }
  }
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
      notice("यह Quiz समाप्त हो चुका है। Admin से नया Quiz Code लें।");
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
    quizState = snapshot.data();
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
    if (quizState.status !== "live") {
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      waiting("Admin के Quiz शुरू करने का इंतज़ार है");
      currentIndex = -1;
      return;
    }

    const index = Number(quizState.currentIndex || 0);
    if (index !== currentIndex) {
      currentIndex = index;
      answered = false;
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      unsubQuestion = onSnapshot(doc(db, "quizzes", activeCode, "questions", String(index)), async questionSnap => {
        if (!questionSnap.exists()) { waiting("प्रश्न लोड हो रहा है…"); return; }
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
          button.addEventListener("click", () => submitAnswer(i));
          $("options").appendChild(button);
        });

        // After refresh, restore and lock an answer that the player already submitted.
        try {
          const prior = await getDoc(doc(db, "quizzes", activeCode, "answers", currentUser.uid + "_" + currentIndex));
          if (prior.exists()) {
            answered = true;
            await displayAnswerFeedback(Number(prior.data().sel), q, true);
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

async function displayAnswerFeedback(selected, q, fromPrevious = false) {
  const keySnap = await getDoc(doc(db, "quizzes", activeCode, "keys", String(currentIndex)));
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

async function submitAnswer(selected) {
  if (answered || !currentUser || !activeCode || !quizState || quizState.status !== "live") return;
  answered = true;
  [...$("options").children].forEach(button => { button.disabled = true; });
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
  } catch (error) {
    console.error("Answer submit:", error);
    answered = false;
    $("feedback").textContent = "जवाब जमा नहीं हुआ: " + authError(error);
    [...$("options").children].forEach(button => { button.disabled = false; });
    return;
  }
  try {
    await displayAnswerFeedback(selected, localizedQuestion(activeQuestionData || {}));
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
    $("timer").textContent = (remainingMs / 1000).toFixed(1) + " sec";
  }
}
setInterval(updateTimer, 250);
