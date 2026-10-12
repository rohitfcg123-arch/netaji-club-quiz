import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup,
  getIdTokenResult
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
  // The host review screen is opened separately from Admin Dashboard; provide a clear return path.
  const hostHeader = document.querySelector("header.top");
  if (hostHeader && !document.getElementById("hostAdminBack")) {
    const back = document.createElement("a");
    back.id = "hostAdminBack";
    back.className = "link";
    back.href = "admin.html";
    back.textContent = "← Admin Home";
    back.style.cssText = "display:inline-block;background:#fff8e8;border:1px solid #d9cba8;border-radius:10px;padding:9px 12px;text-decoration:none;white-space:nowrap";
    hostHeader.appendChild(back);
  }
  document.body.classList.add("host-mode");
  document.querySelector(".hero")?.classList.add("hidden");
  $("game").classList.remove("hidden");
  $("score")?.closest("p")?.classList.add("hidden");
  $("feedback").classList.add("hidden");
  if (requestedCode) startListening(requestedCode);
  else waiting("Quiz Code नहीं मिला।");
} else {
  // This site is hosted on GitHub Pages, so use popup OAuth instead of a full
  // redirect through firebaseapp.com. Modern browsers can block the cross-site
  // storage used by redirect sign-in on non-Firebase hosting.
  let navigatingToJoin = false;

  async function routeAuthenticatedUser(user) {
    if (!user || navigatingToJoin) return;
    navigatingToJoin = true;
    try {
      const token = await getIdTokenResult(user);
      const provider = token.claims.firebase?.sign_in_provider;
      if (provider !== "google.com") {
        navigatingToJoin = false;
        await signOut(auth);
        authNotice("इस Player Portal में केवल Google Account से Login कर सकते हैं।");
        $("googleLoginBtn").disabled = false;
        return;
      }
      $("googleLoginBtn").disabled = true;
      authNotice("✅ Google Login सफल हुआ! Quiz join पेज खोला जा रहा है…");
      // Give the success message a moment to be visible before navigation.
      setTimeout(() => location.replace(new URL("join.html", location.href).href), 450);
    } catch (error) {
      console.error("Google provider verification failed:", error);
      navigatingToJoin = false;
      authNotice("Login verify नहीं हो पाया। Internet connection जाँचें और फिर कोशिश करें।");
      $("googleLoginBtn").disabled = false;
    }
  }

  $("googleLoginBtn").addEventListener("click", async () => {
    const button = $("googleLoginBtn");
    button.disabled = true;
    authNotice("Google Account चुनने के लिए सुरक्षित Login window खुल रही है…");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      // Do not await any other operation before this call; the browser needs
      // the user's direct click to allow the OAuth popup.
      const credential = await signInWithPopup(auth, provider);
      authNotice("✅ Google ने पहचान की पुष्टि कर दी। आगे बढ़ रहे हैं…");
      await routeAuthenticatedUser(credential.user);
    } catch (error) {
      console.error("Google popup login failed:", error);
      const messages = {
        "auth/popup-blocked": "Browser ने Login window रोक दी। Chrome में Pop-ups की अनुमति देकर फिर कोशिश करें।",
        "auth/popup-closed-by-user": "Login window बंद हो गई। Continue with Google दबाकर फिर कोशिश करें।",
        "auth/cancelled-popup-request": "Login request रद्द हो गई। एक बार फिर Continue with Google दबाएँ।",
        "auth/unauthorized-domain": "Firebase Console के Authorized domains में rohitfcg123-arch.github.io जोड़ें।",
        "auth/operation-not-allowed": "Firebase Console → Authentication → Sign-in method में Google provider Enable करें।",
        "auth/network-request-failed": "Internet connection जाँचें और फिर प्रयास करें।"
      };
      authNotice("❌ " + (messages[error.code] || error.message || "Google Login नहीं हो पाया। दोबारा कोशिश करें।"));
      button.disabled = false;
    }
  });

  onAuthStateChanged(auth, user => {
    if (user) void routeAuthenticatedUser(user);
    else {
      navigatingToJoin = false;
      if ($("googleLoginBtn")) $("googleLoginBtn").disabled = false;
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
      // Compatibility only. Ranking uses timestamps created by Firestore.
      elapsedMs: 0
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
    $("timer").textContent = Math.ceil(remainingMs / 1000) + " sec";
  }
}
setInterval(updateTimer, 250);
