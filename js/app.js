import { auth, db } from "./firebase.js";
import { BRANDING_DEFAULTS, normalizeBranding, resolveBranding, applyBranding, listenForDefaultBranding } from "./branding.js";
import {
  browserLocalPersistence,
  setPersistence,
  onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup,
  getIdTokenResult
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, doc, getDoc, onSnapshot, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const hostMode = params.get("host") === "1";
const requestedCode = (params.get("code") || "").trim().toUpperCase();
let activeCode = "", playerName = "", quizState = null, unsubQuiz = null, unsubQuestion = null;
let score = 0, correctCount = 0, answered = false, currentUser = null, currentIndex = -1, questionShownAt = 0, activeQuestionData = null;
let selectedLanguage = localStorage.getItem("ncQuizLanguage") || "hi";
const languageNames = { hi: "हिंदी", en: "English", bn: "বাংলা" };
let globalBranding = normalizeBranding(BRANDING_DEFAULTS);
let activeBranding = normalizeBranding(BRANDING_DEFAULTS);
function refreshActiveBranding() {
  activeBranding = resolveBranding(globalBranding, quizState?.settings?.branding);
  applyBranding(activeBranding);
}


let hostAdminVerified = false;
let hostDataCode = "";
let hostCurrentRunId = "";
let hostDataUnsubs = [];
let hostPlayers = [];
let hostAnswers = [];
let hostKeys = new Map();
let hostQuestionStarts = new Map();
let hostCurrentRankByUid = new Map();
let hostBaseRanks = new Map();
let hostHasRankBaseline = false;
let hostLastBaselineQuestion = -1;
let hostLastTickMarker = "";
let hostAudioContext = null;

function renderHostShell() {
  document.title = "Netaji Club | Live Quiz Projection";
  document.body.innerHTML = [
    '<div id="hostBoard" class="host-board">',
    ' <header class="host-header">',
    '  <div class="host-brand"><div class="host-logo">NC</div><div><div class="host-brand-hi" data-brand-text="clubName">नेताजी क्लब</div><div class="host-brand-en" data-brand-text="competitionLabel">QUIZ COMPETITION</div><div class="host-motto" data-brand-text="tagline">ज्ञान • संस्कृति • एकता</div></div></div>',
    '  <div class="host-round"><span class="host-round-label">ROUND 1</span><strong id="hostQuizName">Saraswati Puja Quiz</strong><span id="hostCategoryTop">General Knowledge</span></div>',
    '  <div class="host-clock-wrap"><div class="host-clock-ring" id="hostTimerRing"><div class="host-clock-inner"><strong id="timer">—</strong><small id="hostTimerUnit">SECONDS</small></div></div><div class="host-clock-caption" id="status">WAITING</div></div>',
    ' </header>',
    ' <main id="hostMain" class="host-main">',
    '  <section class="host-question-panel">',
    '   <div class="host-question-top"><span class="host-question-number">QUESTION <b id="hostQuestionNo">—</b></span><span class="host-points">LIVE QUESTION</span></div>',
    '   <div class="host-translations">',
    '    <article class="host-lang host-lang-en"><span class="host-lang-tag">ENGLISH</span><small id="hostFallbackEn" class="host-translation-warning"></small><h2 id="hostQuestionEn">Waiting for the quiz to start…</h2></article>',
    '    <article class="host-lang host-lang-hi"><span class="host-lang-tag">हिंदी</span><small id="hostFallbackHi" class="host-translation-warning"></small><h2 id="hostQuestionHi">क्विज़ शुरू होने का इंतज़ार है…</h2></article>',
    '    <article class="host-lang host-lang-bn"><span class="host-lang-tag">বাংলা</span><small id="hostFallbackBn" class="host-translation-warning"></small><h2 id="hostQuestionBn">কুইজ শুরু হওয়ার অপেক্ষায়…</h2></article>',
    '   </div>',
    '  </section>',
    '  <section id="options" class="host-options" aria-label="Answer options"></section>',
    '  <section class="host-ranking-panel"><div class="host-ranking-heading"><span class="host-trophy">🏆</span><h2 data-brand-text="rankingHeading">LIVE RANKING</h2><span class="host-ranking-note" data-brand-text="rankingSubtitle">Ranks update automatically as answers arrive</span></div><div id="hostRankGrid" class="host-rank-grid"><div class="host-board-empty">Waiting for participants…</div></div></section>',
    ' </main>',
    ' <footer class="host-footer"><div class="host-foot-stat"><span class="host-foot-icon">👥</span><div><strong id="hostParticipants">0</strong><small>Participants Joined</small></div></div><div class="host-foot-divider"></div><div class="host-foot-stat"><span class="host-foot-icon">🏅</span><div><strong id="hostRoundFooter">Round 1</strong><small id="hostFooterCategory">General Knowledge</small></div></div><div class="host-foot-divider"></div><div class="host-foot-stat"><span class="host-foot-icon">📊</span><div><strong id="hostProgress">0 / 0</strong><small>Questions Progress</small></div></div></footer>',
    ' <div id="hostMessage" class="host-message" role="status" aria-live="polite"></div>',
    ' <h2 id="question" class="host-sr-only"></h2><p id="feedback" class="host-sr-only"></p><span id="score" class="host-sr-only">0</span><span id="correctCount" class="host-sr-only">0</span>',
    '</div>'
  ].join("");
}

function hostMessage(message, mode) {
  const el = $("hostMessage");
  if (!el) return;
  el.textContent = message || "";
  el.className = "host-message" + (mode ? " host-message-" + mode : "");
}
function hostStamp(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function hostInitials(name) {
  const bits = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return (bits.slice(0, 2).map(x => Array.from(x)[0] || "").join("") || "?").toUpperCase();
}
function hostSafeImage(value) {
  const s = String(value || "");
  return /^https:\/\//i.test(s) ? s : "";
}
function hostTranslation(q, lang) {
  const tr = q && q.translations && q.translations[lang];
  if (tr && typeof tr.question === "string" && Array.isArray(tr.options) && tr.options.length === 4) return { question: tr.question, options: tr.options, fallback: false };
  // The player screen shows the source question when a chosen language translation is missing.
  // Mirror that behavior here, and visibly label the absent translation.
  return { question: q && q.question || "", options: q && q.options || [], fallback: true };
}
function renderHostQuestion(q) {
  const en = hostTranslation(q, "en");
  const hi = hostTranslation(q, "hi");
  const bn = hostTranslation(q, "bn");
  $("hostQuestionEn").textContent = en.question || "English translation unavailable";
  $("hostQuestionHi").textContent = hi.question || "हिंदी में प्रश्न उपलब्ध नहीं";
  $("hostQuestionBn").textContent = bn.question || "";
  $("hostFallbackEn").textContent = en.fallback ? "Source text shown — translation missing" : "";
  $("hostFallbackHi").textContent = hi.fallback ? "अनुवाद उपलब्ध नहीं — source text" : "";
  $("hostFallbackBn").textContent = bn.fallback ? "অনুবাদ নেই — source text" : "";
  $("question").textContent = hi.question || "";
  const optHost = $("options");
  optHost.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const letter = String.fromCharCode(65 + i);
    const option = document.createElement("article");
    option.className = "host-option host-option-" + letter.toLowerCase();
    const enText = en.options && en.options[i] ? en.options[i] : (q?.options?.[i] || "—");
    const hiText = hi.options && hi.options[i] ? hi.options[i] : (i < (q?.options || []).length ? q.options[i] : "—");
    const bnText = bn.options && bn.options[i] ? bn.options[i] : (q?.options?.[i] || "—");
    option.innerHTML = '<span class="host-option-letter">' + letter + '</span><div class="host-option-copy"><strong class="host-option-en"></strong><span class="host-option-hi"></span><span class="host-option-bn"></span></div>';
    option.querySelector(".host-option-en").textContent = String(enText);
    option.querySelector(".host-option-hi").textContent = String(hiText);
    option.querySelector(".host-option-bn").textContent = String(bnText);
    optHost.appendChild(option);
  }
  const category = String(q?.category || quizState?.name || "General Knowledge");
  $("hostCategoryTop").textContent = category;
  $("hostFooterCategory").textContent = category;
  $("hostQuizName").textContent = String(quizState?.name || "Quiz Competition");
  updateHostMeta();
}
function updateHostMeta() {
  if (!hostMode) return;
  const total = Math.max(0, Number(quizState?.count || 0));
  const idx = Number(quizState?.currentIndex ?? currentIndex);
  $("hostQuestionNo").textContent = quizState?.status === "live" && idx >= 0 ? String(idx + 1) + " of " + total : "— of " + total;
  $("hostProgress").textContent = (quizState?.status === "live" && idx >= 0 ? idx + 1 : 0) + " / " + total;
  $("hostQuizName").textContent = String(quizState?.name || "Quiz Competition");
  if (activeQuestionData?.category) {
    $("hostCategoryTop").textContent = String(activeQuestionData.category);
    $("hostFooterCategory").textContent = String(activeQuestionData.category);
  } else {
    $("hostCategoryTop").textContent = String(quizState?.name || "General Knowledge");
    $("hostFooterCategory").textContent = String(quizState?.name || "General Knowledge");
  }
  $("hostParticipants").textContent = String(hostPlayers.length);
}
function renderHostWaiting(message) {
  if (!hostMode) return;
  $("status").textContent = quizState?.status === "starting" ? "STARTING" : quizState?.status === "completed" ? "COMPLETED" : "WAITING";
  $("hostQuestionEn").textContent = message || "Waiting for the quiz to start…";
  $("hostQuestionHi").textContent = message || "क्विज़ शुरू होने का इंतज़ार है…";
  $("hostQuestionBn").textContent = message || "কুইজ শুরু হওয়ার অপেক্ষায়…";
  $("question").textContent = message || "";
  $("options").innerHTML = "";
  updateHostMeta();
}
function renderHostTimer(seconds, totalSeconds) {
  if (!hostMode) return;
  const remaining = Math.max(0, Math.ceil(Number(seconds) || 0));
  $("timer").textContent = String(remaining);
  $("hostTimerUnit").textContent = "SECONDS";
  const total = Math.max(1, Number(totalSeconds) || 1);
  const ring = $("hostTimerRing");
  if (ring) {
    ring.style.setProperty("--timer-deg", (Math.max(0, Math.min(1, remaining / total)) * 360) + "deg");
    ring.classList.toggle("host-timer-low", remaining <= 5);
  }
  const marker = String(currentIndex) + ":" + String(remaining);
  const syncedSoundSetting = quizState?.settings?.timerSoundEnabled;
  const enabled = typeof syncedSoundSetting === "boolean" ? syncedSoundSetting : localStorage.getItem("ncTimerSoundEnabled") !== "false";
  if (enabled && remaining > 0 && marker !== hostLastTickMarker) playHostTick();
  hostLastTickMarker = marker;
}
function playHostTick() {
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!hostAudioContext) hostAudioContext = new AudioCtor();
    if (hostAudioContext.state === "suspended") hostAudioContext.resume().catch(() => {});
    const oscillator = hostAudioContext.createOscillator();
    const gain = hostAudioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, hostAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, hostAudioContext.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, hostAudioContext.currentTime + 0.055);
    oscillator.connect(gain);
    gain.connect(hostAudioContext.destination);
    oscillator.start();
    oscillator.stop(hostAudioContext.currentTime + 0.06);
  } catch (e) {
    console.debug("Timer audio blocked by browser:", e);
  }
}
function startHostLiveData(code) {
  if (!hostAdminVerified || hostDataCode === code) return;
  hostDataCode = code;
  hostDataUnsubs.forEach(fn => fn());
  hostDataUnsubs = [];
  const base = ["quizzes", code];
  const subscribe = (path, callback, label) => {
    const unsub = onSnapshot(collection(db, ...path), callback, error => {
      console.error("Host " + label + " listener failed:", error);
      hostMessage("Live " + label + " sync failed. Firebase Admin permissions/network check karein.", "error");
    });
    hostDataUnsubs.push(unsub);
  };
  subscribe(base.concat(["players"]), snap => {
    hostPlayers = snap.docs.map(d => ({ ...d.data(), uid: d.id }));
    recalculateHostRanking();
    updateHostMeta();
  }, "participants");
  subscribe(base.concat(["answers"]), snap => {
    hostAnswers = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    recalculateHostRanking();
  }, "answers");
  subscribe(base.concat(["keys"]), snap => {
    hostKeys = new Map(snap.docs.map(d => [d.id, Number(d.data().correctIndex)]));
    recalculateHostRanking();
  }, "answer keys");
  subscribe(base.concat(["questionTiming"]), snap => {
    hostQuestionStarts = new Map(snap.docs.map(d => [d.id, d.data()]));
    recalculateHostRanking();
  }, "question timing");
}
function recalculateHostRanking() {
  if (!hostMode) return;
  const total = Math.max(0, Number(quizState?.count || 0));
  const points = Number(quizState?.settings?.pointsPerCorrect || 10);
  if (!hostHasRankBaseline && hostPlayers.length) {
    const initialOrder = [...hostPlayers].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    hostBaseRanks = new Map(initialOrder.map((p, i) => [p.uid, i + 1]));
    hostHasRankBaseline = true;
    hostLastBaselineQuestion = currentIndex;
  }
  const rows = hostPlayers.map(p => {
    const mine = hostAnswers.filter(a => a.uid === p.uid);
    const correct = mine.filter(a => hostKeys.has(String(a.q)) && hostKeys.get(String(a.q)) === Number(a.sel)).length;
    let elapsed = 0, timedAnswers = 0;
    for (const a of mine) {
      const marker = hostQuestionStarts.get(String(a.q));
      const started = marker && (!quizState?.runId || marker.runId === quizState.runId) ? hostStamp(marker.startedAt) : 0;
      const received = hostStamp(a.at);
      if (started > 0 && received > 0) {
        elapsed += Math.max(0, received - started);
        timedAnswers++;
      }
    }
    return {
      ...p, correct, answered: mine.length, score: correct * points, elapsed, timedAnswers,
      completed: total > 0 && mine.length >= total
    };
  });
  rows.sort((a, b) =>
    b.correct - a.correct ||
    Number(b.completed) - Number(a.completed) ||
    (a.timedAnswers ? a.elapsed : Number.POSITIVE_INFINITY) - (b.timedAnswers ? b.elapsed : Number.POSITIVE_INFINITY) ||
    String(a.name || "").localeCompare(String(b.name || ""))
  );
  const newRanks = new Map(rows.map((p, i) => [p.uid, i + 1]));
  hostCurrentRankByUid = newRanks;
  const grid = $("hostRankGrid");
  if (!grid) return;
  const visible = rows.slice(0, 10);
  if (!visible.length) {
    grid.innerHTML = '<div class="host-board-empty">Waiting for participants…</div>';
    return;
  }
  grid.innerHTML = visible.map((p, i) => {
    const rank = i + 1;
    const oldRank = hostHasRankBaseline ? hostBaseRanks.get(p.uid) : undefined;
    const delta = oldRank == null ? 0 : oldRank - rank;
    const movement = delta > 0 ? '<span class="host-movement up">▲ +' + delta + '</span>' : delta < 0 ? '<span class="host-movement down">▼ ' + delta + '</span>' : '<span class="host-movement same">—</span>';
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
    const safeName = String(p.name || "Player");
    const photo = hostSafeImage(p.photoURL);
    const avatar = photo ? '<img src="' + escapeHostHtml(photo) + '" alt="" referrerpolicy="no-referrer">' : '<span>' + escapeHostHtml(hostInitials(safeName)) + '</span>';
    const klass = rank <= 3 ? " host-rank-top-" + rank : "";
    return '<article class="host-rank-card' + klass + '"><div class="host-rank-card-top"><span class="host-rank-number">' + rank + '</span><span class="host-medal">' + medal + '</span></div><div class="host-avatar">' + avatar + '</div><strong class="host-player-name">' + escapeHostHtml(safeName) + '</strong><strong class="host-player-score">' + p.score + ' pts</strong><small class="host-player-detail">' + p.correct + ' correct · ' + p.answered + '/' + total + '</small>' + movement + '</article>';
  }).join("");
}
function escapeHostHtml(v) {
  return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
async function verifyHostAdmin(user) {
  if (!user) throw new Error("Admin login session not found. Admin Portal se Review Quiz kholein.");
  const token = await getIdTokenResult(user);
  if (token.claims.firebase?.sign_in_provider !== "password") throw new Error("Review screen sirf Admin Portal ke verified Admin account ke liye hai.");
  const adminSnap = await getDoc(doc(db, "admins", user.uid));
  if (!adminSnap.exists() || adminSnap.data()?.active !== true) throw new Error("Is account ko active Admin permission nahi hai.");
  hostAdminVerified = true;
  startHostLiveData(requestedCode);
  startListening(requestedCode);
  hostMessage("", "");
}

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
  if (hostMode) { renderHostWaiting(text); hostMessage(text, "error"); }
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
  renderHostShell();
  if (!requestedCode) {
    hostMessage("Quiz Code नहीं मिला। Admin Portal से Review Quiz खोलें।", "error");
    renderHostWaiting("Quiz Code missing");
  } else {
    // Match Admin Portal's explicit local persistence before resolving the host session.
    // Do not bypass Firestore Rules; the same password-admin + active allowlist checks still run.
    setPersistence(auth, browserLocalPersistence).then(() => {
      onAuthStateChanged(auth, user => {
      if (!user) {
        hostAdminVerified = false;
        hostDataUnsubs.forEach(fn => fn());
        hostDataUnsubs = [];
        hostDataCode = "";
        hostPlayers = []; hostAnswers = []; hostKeys = new Map(); hostQuestionStarts = new Map();
        if ($("hostRankGrid")) $("hostRankGrid").innerHTML = "<div class=\"host-board-empty\">Admin session required</div>";
        hostMessage("Admin login session not found. Admin Portal mein login karke Review Quiz dobara kholein.", "error");
        renderHostWaiting("Admin verification required");
        $("options").innerHTML = '<div class="host-board-empty host-option-error">Admin login required to load live questions</div>';
        $("hostQuestionEn").textContent = "Admin login required";
        $("hostQuestionHi").textContent = "Admin login ज़रूरी है";
        $("hostQuestionBn").textContent = "Admin লগইন প্রয়োজন";
        return;
      }
      verifyHostAdmin(user).catch(error => {
        console.error("Review screen Admin verification failed:", error);
        hostAdminVerified = false;
        hostDataUnsubs.forEach(fn => fn()); hostDataUnsubs = []; hostDataCode = "";
        hostMessage(error.message || "Admin verification failed.", "error");
        if ($("hostRankGrid")) $("hostRankGrid").innerHTML = "<div class=\"host-board-empty\">Admin access required</div>";
        renderHostWaiting("Admin verification required");
        $("options").innerHTML = '<div class="host-board-empty host-option-error">Admin verification required</div>';
      });
    });
    }).catch(error => {
      console.error("Could not restore persistent Admin session for review screen:", error);
      hostMessage("Admin session restore failed. Admin Portal mein login karke Review Quiz dobara kholein.", "error");
      renderHostWaiting("Admin session restore failed");
    });
  }
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
    refreshActiveBranding();
    if (hostMode) {
      const newRunId = String(quizState.runId || "");
      if (hostCurrentRunId && newRunId && hostCurrentRunId !== newRunId) {
        hostCurrentRankByUid = new Map(); hostBaseRanks = new Map(); hostHasRankBaseline = false;
        hostLastBaselineQuestion = -1; hostAnswers = []; hostKeys = new Map(); hostQuestionStarts = new Map();
        activeQuestionData = null;
      }
      if (newRunId) hostCurrentRunId = newRunId;
      updateHostMeta();
    }
    if (quizState.status === "completed") {
      $("status").textContent = "Completed";
      $("question").textContent = "Quiz समाप्त हो गया।";
      $("timer").textContent = "—";
      clearOptions();
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      if (hostMode) { renderHostWaiting("QUIZ COMPLETED"); $("status").textContent = "COMPLETED"; recalculateHostRanking(); hostMessage("Quiz completed", "success"); }
      return;
    }
    if (quizState.status === "starting") {
      $("status").textContent = "Starting";
      $("question").textContent = "क्विज़ शुरू होने वाला है…";
      clearOptions();
      $("timer").textContent = Math.max(0, Math.ceil((Number(quizState.startAt || 0) - Date.now()) / 1000));
      if (hostMode) { renderHostWaiting("Quiz starts in a moment…"); $("status").textContent = "STARTING"; updateTimer(); }
      return;
    }
    if (quizState.status !== "live") { waiting(activeBranding?.text?.waitingText || "Admin के Quiz शुरू करने का इंतज़ार है"); return; }

    const idx = Number(quizState.currentIndex || 0);
    if (idx !== currentIndex) {
      if (hostMode) {
        hostBaseRanks = new Map(hostCurrentRankByUid);
        hostHasRankBaseline = hostBaseRanks.size > 0;
        hostLastBaselineQuestion = idx;
        hostLastTickMarker = "";
      }
      currentIndex = idx;
      answered = false;
      if (unsubQuestion) { unsubQuestion(); unsubQuestion = null; }
      unsubQuestion = onSnapshot(doc(db, "quizzes", activeCode, "questions", String(idx)), async qSnap => {
        if (!qSnap.exists()) { waiting("प्रश्न लोड हो रहा है…"); return; }
        activeQuestionData = qSnap.data();
        const q = localizedQuestion(activeQuestionData);
        questionShownAt = Number(quizState.questionStartedAt || Date.now());
        $("status").textContent = "LIVE";
        $("feedback").textContent = "";
        if (hostMode) {
          renderHostQuestion(activeQuestionData);
          $("status").textContent = "LIVE";
          hostMessage("", "");
        } else {
          $("question").textContent = q.question || "";
          clearOptions();
          (q.options || []).forEach((o, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.optionIndex = String(i);
            b.textContent = String.fromCharCode(65 + i) + ". " + o;
            b.addEventListener("click", () => submitAnswer(i));
            $("options").appendChild(b);
          });
        }
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
        console.error("Question listener failed", {
          code: e?.code || "unknown",
          message: e?.message || "No Firebase error message",
          quizCode: activeCode,
          questionIndex: idx,
          hostMode,
          authUid: auth.currentUser?.uid || null,
          authProvider: auth.currentUser?.providerData?.map(p => p.providerId) || []
        });
        if (hostMode) {
          hostMessage(
            e?.code === "permission-denied"
              ? "Firebase ने इस Admin session को questions पढ़ने की अनुमति नहीं दी। Admin login / deployed Firestore Rules जाँचें।"
              : "Question load failed (" + (e?.code || "unknown") + "). Internet/Firebase जाँचें।",
            "error"
          );
          $("status").textContent = "SYNC ERROR";
          $("hostQuestionEn").textContent = "Question could not be loaded";
          $("hostQuestionHi").textContent = "प्रश्न लोड नहीं हुआ";
          $("hostQuestionBn").textContent = "প্রশ্ন লোড হয়নি";
          $("hostFallbackEn").textContent = $("hostFallbackHi").textContent = $("hostFallbackBn").textContent = "";
          $("options").innerHTML = '<div class="host-board-empty host-option-error">Question data unavailable — Firebase access check required</div>';
        } else {
          waiting(e?.code === "permission-denied"
            ? "Question access denied: Admin/Player login और deployed Firebase Rules जाँचें।"
            : "Question load error (" + (e?.code || "unknown") + "): " + (e?.message || "Internet/Firebase जाँचें"));
        }
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
    const remaining = Math.max(0, Math.ceil((Number(quizState.startAt || 0) - Date.now()) / 1000));
    if (hostMode) renderHostTimer(remaining, Math.max(1, Number(quizState.settings?.startDelay || remaining || 1)));
    else $("timer").textContent = remaining;
    return;
  }
  if (quizState.status === "live") {
    const sec = Number(quizState.settings?.questionSeconds || 10);
    const remainingMs = Math.max(0, sec * 1000 - (Date.now() - Number(quizState.questionStartedAt || Date.now())));
    const remaining = Math.ceil(remainingMs / 1000);
    if (hostMode) renderHostTimer(remaining, sec);
    else $("timer").textContent = remaining + " sec";
  }
}
// Global default branding is public-read and Admin-write in Firestore; current quiz branding overrides it.
listenForDefaultBranding((branding, error) => {
  globalBranding = branding;
  refreshActiveBranding();
  if (error) console.warn("Default branding sync unavailable; using built-in theme:", error);
});
setInterval(updateTimer, 250);
