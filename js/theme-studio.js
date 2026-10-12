import { auth, db } from "./firebase.js";
import { onAuthStateChanged, getIdTokenResult } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { BRANDING_DEFAULTS, BRANDING_PRESETS, BRANDING_PRESET_TEXT, normalizeBranding, applyBranding } from "./branding.js?v=20261013-occasion-text-1";

const $ = id => document.getElementById(id);
const TEXT_FIELDS = {
  clubName:"txClubName", competitionLabel:"txCompetitionLabel", tagline:"txTagline",
  defaultQuizName:"txDefaultQuizName", roundName:"txRoundName", welcomeHeading:"txWelcomeHeading", welcomeText:"txWelcomeText",
  loginHeading:"txLoginHeading", loginText:"txLoginText", joinHeading:"txJoinHeading", joinText:"txJoinText",
  waitingText:"txWaitingText", rankingHeading:"txRankingHeading", participantsLabel:"txParticipantsLabel", progressLabel:"txProgressLabel", rankingSubtitle:"txRankingSubtitle",
  resultsHeading:"txResultsHeading", winnersHeading:"txWinnersHeading", winnersSubtitle:"txWinnersSubtitle",
  footerText:"txFooterText"
};
const COLOR_FIELDS = {
  primary:"tsPrimary", accent:"tsAccent", background:"tsBackground", surface:"tsSurface",
  text:"tsText", header:"tsHeader", border:"tsBorder", secondary:"tsSecondary"
};
let currentBranding = normalizeBranding(BRANDING_DEFAULTS);
let defaultBranding = normalizeBranding(BRANDING_DEFAULTS);
let authUser = null;
let busy = false;
let loadedCurrentQuizCode = "";
let formDirty = false;

const DRAFT_KEY = "themeStudioUnsavedDraft";
const TARGET_KEY = "themeStudioLastTarget";
function saveLocalDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ code: quizCode(), target: selectedTarget(), branding: collectForm(), savedAt: Date.now() })); } catch {}
}
function clearLocalDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
function restoreLocalDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft || !draft.branding || Date.now() - Number(draft.savedAt || 0) > 604800000) return false;
    // Restore the user's work, but start in global/default mode. This lets
    // admins update public portal branding without needing a quiz code.
    $("tsQuizCode").value = "";
    loadedCurrentQuizCode = "";
    fillForm(draft.branding);
    const target = document.querySelector('input[name="tsTarget"][value="default"]');
    if (target) target.checked = true;
    formDirty = true;
    updateSaveLabel();
    setStatus("⚠️ पिछला draft वापस लाया गया है। Default branding चुनी गई है—Quiz Code के बिना public portal update करने के लिए Save करें। Specific quiz के लिए code डालकर “Current quiz only” चुनें।");
    return true;
  } catch { return false; }
}


function setStatus(message, type = "") {
  const el = $("tsStatus");
  el.textContent = message;
  el.className = "notice ts-status" + (type ? " " + type : "");
}
function quizCode() { return String($("tsQuizCode").value || "").trim().toUpperCase(); }
$("tsQuizCode").addEventListener("input", () => { if (quizCode() !== loadedCurrentQuizCode) loadedCurrentQuizCode = ""; });
function selectedTarget() {
  return document.querySelector('input[name="tsTarget"]:checked')?.value || "default";
}
function setBusy(value) {
  busy = value;
  ["tsSaveSelected","tsLoadCurrent","tsLoadDefault","tsUseDefault","tsReset"].forEach(id => { if ($(id)) $(id).disabled = value; });
}
async function ensureAdmin(user) {
  if (!user || !user.email) throw new Error("Admin login with Google आवश्यक है।");
  const token = await getIdTokenResult(user);
  if (token.claims.firebase?.sign_in_provider !== "google.com") {
    throw new Error("Theme Studio के लिए Google account से login करें; email/password login स्वीकार नहीं है।");
  }
  const email = String(user.email).trim().toLowerCase();
  if (email === "rohit.fcg123@gmail.com") { authUser = user; return; }
  const snap = await getDoc(doc(db, "approvedAdminEmails", email));
  if (!snap.exists() || snap.data()?.active !== true || String(snap.data()?.email || "").toLowerCase() !== email) {
    throw new Error("इस Google account को Admin approval नहीं मिला है। Root Admin से approval लें।");
  }
  authUser = user;
}

function collectForm() {
  const out = {
    ...currentBranding,
    preset: currentBranding.preset || "saraswati",
    colors: {},
    text: {},
    assets: { logoUrl: $("tsLogoUrl").value.trim(), backgroundUrl: $("tsBackgroundUrl").value.trim() },
    effects: { decorations: $("tsDecorations").checked, animations: $("tsAnimations").checked },
    useDefaultTheme: false
  };
  Object.entries(COLOR_FIELDS).forEach(([key,id]) => out.colors[key] = $(id).value);
  Object.entries(TEXT_FIELDS).forEach(([key,id]) => out.text[key] = $(id).value.trim());
  return normalizeBranding(out);
}
function fillForm(input) {
  formDirty = false;
  currentBranding = normalizeBranding(input || defaultBranding);
  Object.entries(COLOR_FIELDS).forEach(([key,id]) => $(id).value = currentBranding.colors[key]);
  Object.entries(TEXT_FIELDS).forEach(([key,id]) => $(id).value = currentBranding.text[key]);
  $("tsLogoUrl").value = currentBranding.assets.logoUrl || "";
  $("tsBackgroundUrl").value = currentBranding.assets.backgroundUrl || "";
  $("tsDecorations").checked = currentBranding.effects.decorations;
  $("tsAnimations").checked = currentBranding.effects.animations;
  document.querySelectorAll("[data-preset]").forEach(button => button.classList.toggle("active", button.dataset.preset === currentBranding.preset));
  renderPreview();
  updateSaveLabel();
}
function updateSaveLabel() {
  const current = selectedTarget() === "current";
  $("tsSaveSelected").textContent = current ? "🚀 Apply to Current Quiz" : "💾 Save as Default Branding";
}
function renderPreview() {
  const config = collectForm();
  currentBranding = config;
  applyBranding(config, $("themePreview"));
  $("tsPreviewQuizName").textContent = config.text.defaultQuizName || "Quiz Name";
  $("tsPreviewWelcome").textContent = config.text.welcomeHeading || "Welcome";
  $("tsPreviewDescription").textContent = config.text.welcomeText || "";
  $("themePreview").querySelector(".ts-prev-ranking").textContent = config.text.rankingHeading || "LIVE RANKING";
  $("themePreview").querySelector("#tsPreviewFooter")?.replaceChildren(document.createTextNode(config.text.footerText || ""));
  const logo = $("themePreview").querySelector("[data-brand-logo]");
  if (config.assets.logoUrl) {
    logo.style.backgroundImage = 'url("' + config.assets.logoUrl.replaceAll('"', "%22") + '")';
    logo.style.backgroundSize = "contain";
    logo.style.backgroundPosition = "center";
    logo.style.backgroundRepeat = "no-repeat";
    logo.textContent = "";
  } else {
    logo.style.backgroundImage = "";
    logo.textContent = "NC";
  }
}
async function loadDefault() {
  const snap = await getDoc(doc(db, "siteSettings", "branding"));
  defaultBranding = snap.exists() ? normalizeBranding(snap.data()) : normalizeBranding(BRANDING_DEFAULTS);
  fillForm(defaultBranding);
  document.querySelector('input[name="tsTarget"][value="default"]').checked = true;
  updateSaveLabel();
  setStatus(snap.exists() ? "Saved default branding loaded from Firebase." : "No saved default yet; built-in Saraswati Puja theme loaded.", "success");
}
async function findSavedQuizzes() {
  if (busy) return;
  setBusy(true);
  try {
    const select = $("tsQuizList");
    select.innerHTML = '<option value="">Choose a saved quiz…</option>';
    const snap = await getDocs(collection(db, "quizzes"));
    const quizzes = snap.docs.map(item => ({
      code: item.id,
      name: item.data()?.name || item.id
    })).sort((a,b) => a.name.localeCompare(b.name));
    for (const quiz of quizzes) {
      const option = document.createElement("option");
      option.value = quiz.code;
      option.textContent = quiz.name + " — " + quiz.code;
      select.appendChild(option);
    }
    if (!quizzes.length) throw new Error("Firebase में कोई saved quiz नहीं मिला। पहले Admin Dashboard में quiz Save करें।");
    setStatus(quizzes.length + " saved quiz मिले। Dropdown से सही quiz चुनें।", "success");
  } catch (error) {
    console.error("Find quizzes failed:", error);
    setStatus("Quiz list नहीं खुली: " + (error?.message || String(error)), "error");
  } finally { setBusy(false); }
}
$("tsFindQuizzes").addEventListener("click", findSavedQuizzes);
$("tsQuizList").addEventListener("change", () => {
  if ($("tsQuizList").value) {
    $("tsQuizCode").value = $("tsQuizList").value;
    loadedCurrentQuizCode = "";
  }
});

async function loadCurrentQuiz() {
  if (formDirty) {
    const discard = window.confirm("इस form में कुछ unsaved बदलाव हैं। Current Quiz की saved settings लोड करने पर ये बदलाव हट जाएंगे। क्या आप आगे बढ़ना चाहते हैं?");
    if (!discard) return;
    clearLocalDraft();
  }
  const code = quizCode();
  if (!code) throw new Error("Current Quiz Code भरें। Admin Dashboard में Save Quiz करने के बाद यहाँ code डालें।");
  const snap = await getDoc(doc(db, "quizzes", code));
  if (!snap.exists()) throw new Error("Firebase में Quiz Code " + code + " नहीं मिला।");
  const quiz = snap.data();
  loadedCurrentQuizCode = code;
  localStorage.setItem("themeStudioLastQuizCode", code);
  const config = quiz.settings?.branding?.useDefaultTheme
    ? defaultBranding
    : quiz.settings?.branding || defaultBranding;
  const formConfig = normalizeBranding({
    ...config,
    text: { ...(config.text || {}), defaultQuizName: quiz.name || config.text?.defaultQuizName || "" }
  });
  fillForm(formConfig);
  document.querySelector('input[name="tsTarget"][value="current"]').checked = true;
  updateSaveLabel();
  setStatus('Quiz "' + (quiz.name || code) + '" loaded from Firebase. Edits will apply only to this quiz.', "success");
}
async function saveDefault(config) {
  await setDoc(doc(db, "siteSettings", "branding"), {
    preset: config.preset, colors: config.colors, text: config.text,
    assets: config.assets, effects: config.effects, updatedAt: serverTimestamp()
  }, { merge: true });
  defaultBranding = normalizeBranding({ ...config, updatedAt: new Date() });
  currentBranding = defaultBranding;
  localStorage.setItem(TARGET_KEY, "default");
  clearLocalDraft();
  setStatus("✅ Default branding saved to Firebase. Connected screens will receive the theme in real time.", "success");
}
async function saveCurrent(config) {
  const code = quizCode();
  if (!code) throw new Error("Current Quiz Code भरें या Admin Dashboard से code copy करें।");
  const quizRef = doc(db, "quizzes", code);
  const snap = await getDoc(quizRef);
  if (!snap.exists()) throw new Error("Quiz " + code + " Firebase में नहीं मिला। पहले Admin Dashboard में Save Quiz करें।");
  const old = snap.data();
  const loadedForRename = loadedCurrentQuizCode === code;
  const nextQuizName = loadedForRename ? (config.text.defaultQuizName || old.name || code) : (old.name || code);
  await setDoc(quizRef, {
    name: nextQuizName,
    settings: { ...(old.settings || {}), branding: {
      preset: config.preset, colors: config.colors, text: config.text,
      assets: config.assets, effects: config.effects, useDefaultTheme: false
    }},
    updatedAt: serverTimestamp()
  }, { merge: true });
  localStorage.setItem(TARGET_KEY, "current");
  localStorage.setItem("themeStudioLastQuizCode", code);
  clearLocalDraft();
  setStatus(loadedForRename ? ('✅ Branding and quiz name saved for "' + nextQuizName + '". Other quizzes are unchanged.') : ('✅ Branding saved for "' + nextQuizName + '". Existing quiz name was kept; load this quiz first to rename it.'), "success");
}
async function saveSelected() {
  if (busy) return;
  setBusy(true);
  try {
    const config = collectForm();
    if (selectedTarget() === "default") await saveDefault(config);
    else await saveCurrent(config);
    formDirty = false;
  } catch (error) {
    console.error("Theme Studio save failed:", error);
    setStatus("❌ Save नहीं हुआ: " + (error?.message || String(error)), "error");
  } finally { setBusy(false); }
}
async function useDefaultForCurrent() {
  if (busy) return;
  const code = quizCode();
  if (!code) { setStatus("Current Quiz Code भरें।", "error"); return; }
  setBusy(true);
  try {
    const ref = doc(db, "quizzes", code);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Quiz " + code + " Firebase में नहीं मिला।");
    const old = snap.data();
    await setDoc(ref, {
      settings: { ...(old.settings || {}), branding: { useDefaultTheme: true } },
      updatedAt: serverTimestamp()
    }, { merge: true });
    localStorage.setItem(TARGET_KEY, "current");
    localStorage.setItem("themeStudioLastQuizCode", code);
    clearLocalDraft();
    setStatus("✅ This quiz will now follow the saved default branding in real time.", "success");
  } catch (error) {
    console.error(error);
    setStatus("❌ Default theme apply नहीं हुआ: " + (error?.message || String(error)), "error");
  } finally { setBusy(false); }
}

let warnedAboutFestivalEdit = false;
function applyPresetToForm(presetKey) {
  const preset = BRANDING_PRESETS[presetKey];
  if (!preset) return;
  const old = collectForm();
  const presetText = BRANDING_PRESET_TEXT[presetKey] || {};
  fillForm({
    ...old,
    preset: presetKey,
    colors: { ...preset.colors },
    effects: { ...preset.effects },
    text: presetKey === "custom" ? old.text : { ...old.text, ...presetText }
  });
  formDirty = true;
  warnedAboutFestivalEdit = false;
  updateSaveLabel();
  saveLocalDraft();
  setStatus(preset.label + " theme selected: colours and occasion-specific text loaded. Preview देखें और Save/Apply करें.", "success");
}
document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => {
  const presetKey = button.dataset.preset;
  if (formDirty && selectedTarget() === "current" && !window.confirm("Theme बदलने से इस form के unsaved changes replace हो सकते हैं। क्या आगे बढ़ना है?")) return;
  applyPresetToForm(presetKey);
}));
function allowFestivalEdit() {
  if (currentBranding.preset === "custom" || warnedAboutFestivalEdit) return true;
  const ok = window.confirm("⚠️ आप एक predefined festival theme edit कर रहे हैं। बदलाव इस saved theme/quiz की branding को बदल सकते हैं। Continue Editing?");
  if (ok) { warnedAboutFestivalEdit = true; return true; }
  return false;
}
Object.values(COLOR_FIELDS).forEach(id => $(id).addEventListener("input", () => { if (!allowFestivalEdit()) { applyPresetToForm(currentBranding.preset); return; } formDirty = true; currentBranding = { ...collectForm(), preset: "custom" }; saveLocalDraft(); document.querySelectorAll("[data-preset]").forEach(b => b.classList.toggle("active", b.dataset.preset === "custom")); renderPreview(); }));
Object.values(TEXT_FIELDS).forEach(id => $(id).addEventListener("input", () => { if (!allowFestivalEdit()) { applyPresetToForm(currentBranding.preset); return; } formDirty = true; renderPreview(); saveLocalDraft(); }));
["tsLogoUrl","tsBackgroundUrl","tsDecorations","tsAnimations"].forEach(id => $(id).addEventListener("input", () => { if (!allowFestivalEdit()) { applyPresetToForm(currentBranding.preset); return; } formDirty = true; renderPreview(); saveLocalDraft(); }));
document.querySelectorAll('input[name="tsTarget"]').forEach(el => el.addEventListener("change", updateSaveLabel));
$("tsSaveSelected").addEventListener("click", saveSelected);
$("tsLoadDefault").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try { await loadDefault(); }
  catch (e) { console.error(e); setStatus("Default load नहीं हुआ: " + (e?.message || String(e)) + " Firestore rules publish करना न भूलें।", "error"); }
  finally { setBusy(false); }
});
$("tsLoadCurrent").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try { await loadCurrentQuiz(); }
  catch (e) { console.error(e); setStatus("Current Quiz load नहीं हुआ: " + (e?.message || String(e)), "error"); }
  finally { setBusy(false); }
});
$("tsUseDefault").addEventListener("click", useDefaultForCurrent);
$("tsReset").addEventListener("click", () => {
  fillForm(defaultBranding);
  document.querySelector('input[name="tsTarget"][value="default"]').checked = true;
  updateSaveLabel();
});
document.querySelectorAll('input[name="tsTarget"]').forEach(el => el.addEventListener("change", updateSaveLabel));

// Keep the editor in global/default mode, but prefill a useful quiz code
// from the last explicitly opened quiz or the current admin live state.
// We never auto-load that quiz, so it cannot overwrite default branding edits.
try {
  const live = JSON.parse(localStorage.getItem("netajiQuizLiveState") || "{}");
  const savedCode = String(localStorage.getItem("themeStudioLastQuizCode") || live.quiz?.id || "").trim().toUpperCase();
  if (savedCode) $("tsQuizCode").value = savedCode;
} catch {}
fillForm(BRANDING_DEFAULTS);
onAuthStateChanged(auth, user => {
  if (!user) { authUser = null; location.replace("admin.html"); return; }
  ensureAdmin(user).then(async () => {
    const restoredDraft = restoreLocalDraft();
    if (restoredDraft) return;
    $("tsStatus").textContent = "Admin verified. Loading saved branding…";
    await loadDefault();
    const savedTarget = localStorage.getItem(TARGET_KEY) || "default";
    const savedCode = String($("tsQuizCode").value || "").trim().toUpperCase();
    if (savedTarget === "current" && savedCode) {
      document.querySelector('input[name="tsTarget"][value="current"]').checked = true;
      try {
        await loadCurrentQuiz();
      } catch (error) {
        document.querySelector('input[name="tsTarget"][value="default"]').checked = true;
        updateSaveLabel();
        setStatus("Saved default branding loaded. Previous quiz settings could not be loaded: " + (error?.message || String(error)), "error");
      }
    } else {
      document.querySelector('input[name="tsTarget"][value="default"]').checked = true;
      updateSaveLabel();
    }
  }).catch(error => {
    console.error("Theme Studio authorization/load failed:", error);
    setStatus("Admin verification or Firebase read failed: " + (error?.message || String(error)), "error");
    if (error?.message?.includes("approval") || error?.message?.includes("Google account") || error?.message?.includes("Google से login")) setTimeout(() => location.replace("admin.html"), 1200);
  });
});
