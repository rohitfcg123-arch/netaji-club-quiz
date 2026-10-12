import { auth, db } from "./firebase.js";
import { onAuthStateChanged, getIdTokenResult } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { BRANDING_DEFAULTS, BRANDING_PRESETS, normalizeBranding, applyBranding } from "./branding.js?v=20261013-branding-2";

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
function saveLocalDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ code: quizCode(), target: selectedTarget(), branding: collectForm(), savedAt: Date.now() })); } catch {}
}
function clearLocalDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
function restoreLocalDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft || !draft.branding || Date.now() - Number(draft.savedAt || 0) > 604800000) return false;
    if (draft.code) $("tsQuizCode").value = draft.code;
    fillForm(draft.branding);
    const target = document.querySelector("input[name=tsTarget][value=" + (draft.target === "current" ? "current" : "default") + "]");
    if (target) target.checked = true;
    formDirty = true;
    updateSaveLabel();
    setStatus("⚠️ पिछला draft वापस लाया गया है। स्थायी रूप से सेव करने के लिए Apply/Save पर क्लिक करें।");
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
function ensureAdmin(user) {
  if (!user) throw new Error("Admin login आवश्यक है। Admin Dashboard से login करें।");
  return getIdTokenResult(user).then(async token => {
    if (token.claims.firebase?.sign_in_provider !== "password") throw new Error("Theme Studio सिर्फ Admin password account से खुलता है।");
    const snap = await getDoc(doc(db, "admins", user.uid));
    if (!snap.exists() || snap.data()?.active !== true) throw new Error("इस account को active Admin permission नहीं है।");
    authUser = user;
  });
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
async function loadCurrentQuiz() {
  if (formDirty) {
    throw new Error("आपके कुछ बदलाव अभी सेव नहीं हुए हैं। बदलाव बचाने के लिए Apply to Current Quiz पर क्लिक करें। पुरानी सेटिंग्स फिर से लोड करने के लिए पहले बदलाव सेव करें या पेज रीफ्रेश करें।");
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
    setStatus("✅ This quiz will now follow the saved default branding in real time.", "success");
  } catch (error) {
    console.error(error);
    setStatus("❌ Default theme apply नहीं हुआ: " + (error?.message || String(error)), "error");
  } finally { setBusy(false); }
}

document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => {
  formDirty = true;
  const preset = BRANDING_PRESETS[button.dataset.preset];
  if (!preset) return;
  const old = collectForm();
  fillForm({
    ...old,
    preset: button.dataset.preset,
    colors: { ...preset.colors },
    effects: { ...preset.effects }
  });
  saveLocalDraft();
  setStatus(preset.label + " preset selected. Preview देखो और फिर save/apply करो.");
}));
Object.values(COLOR_FIELDS).forEach(id => $(id).addEventListener("input", () => { formDirty = true; currentBranding = { ...collectForm(), preset: "custom" }; saveLocalDraft(); document.querySelectorAll("[data-preset]").forEach(b => b.classList.toggle("active", b.dataset.preset === "custom")); renderPreview(); }));
Object.values(TEXT_FIELDS).forEach(id => $(id).addEventListener("input", () => { formDirty = true; renderPreview(); saveLocalDraft(); }));
["tsLogoUrl","tsBackgroundUrl","tsDecorations","tsAnimations"].forEach(id => $(id).addEventListener("input", () => { formDirty = true; renderPreview(); saveLocalDraft(); }));
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

try {
  const local = JSON.parse(localStorage.getItem("netajiQuizLiveState") || "{}");
  if (local.quiz?.id) $("tsQuizCode").value = String(local.quiz.id).toUpperCase();
} catch {}
fillForm(BRANDING_DEFAULTS);
onAuthStateChanged(auth, user => {
  if (!user) { authUser = null; return; }
  ensureAdmin(user).then(async () => {
    const restoredDraft = restoreLocalDraft();
    if (restoredDraft) return;
    const lastQuizCode = String(localStorage.getItem("themeStudioLastQuizCode") || "").trim().toUpperCase();
    const code = quizCode() || lastQuizCode;
    if (code) {
      $("tsQuizCode").value = code;
      try {
        await loadDefault();
        await loadCurrentQuiz();
        return;
      } catch (error) {
        console.warn("Could not restore last Theme Studio quiz; loading default branding instead.", error);
      }
    }
    $("tsStatus").textContent = "Admin verified. Loading saved default branding…";
    await loadDefault();
  }).catch(error => {
    console.error("Theme Studio authorization/load failed:", error);
    setStatus("Admin verification or Firebase read failed: " + (error?.message || String(error)), "error");
  });
});
