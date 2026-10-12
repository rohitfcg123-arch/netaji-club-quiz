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
let formDirty = false;

const DRAFT_KEY = "themeStudioUnsavedDraft";
function saveLocalDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ branding: collectForm(), savedAt: Date.now() })); } catch {}
}
function clearLocalDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
function restoreLocalDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft || !draft.branding || Date.now() - Number(draft.savedAt || 0) > 604800000) return false;
    fillForm(draft.branding);
    formDirty = true;
    updateSaveLabel();
    setStatus("⚠️ पिछला unsaved draft वापस लाया गया है। बदलाव सुरक्षित रखने के लिए Save Theme दबाएँ।");
    return true;
  } catch { return false; }
}

function setStatus(message, type = "") {
  const el = $("tsStatus");
  el.textContent = message;
  el.className = "notice ts-status" + (type ? " " + type : "");
}
function setBusy(value) {
  busy = value;
  ["tsSaveSelected","tsLoadDefault","tsReset"].forEach(id => { if ($(id)) $(id).disabled = value; });
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
  $("tsSaveSelected").textContent = "💾 Save Theme";
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
  updateSaveLabel();
  setStatus(snap.exists() ? "Saved default branding loaded from Firebase." : "No saved default yet; built-in Saraswati Puja theme loaded.", "success");
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
async function saveSelected() {
  if (busy) return;
  setBusy(true);
  try {
    const config = collectForm();
    await saveDefault(config);
    formDirty = false;
  } catch (error) {
    console.error("Theme Studio save failed:", error);
    setStatus("❌ Save नहीं हुआ: " + (error?.message || String(error)), "error");
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
  if (formDirty && !window.confirm("Theme बदलने से form के unsaved changes replace हो सकते हैं। क्या आगे बढ़ना है?")) return;
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

$("tsSaveSelected").addEventListener("click", saveSelected);
$("tsLoadDefault").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try { await loadDefault(); }
  catch (e) { console.error(e); setStatus("Default load नहीं हुआ: " + (e?.message || String(e)) + " Firestore rules publish करना न भूलें।", "error"); }
  finally { setBusy(false); }
});
$("tsReset").addEventListener("click", () => {
  fillForm(defaultBranding);
  updateSaveLabel();
});


// Theme Studio always edits global/default branding; no quiz code is needed.
fillForm(BRANDING_DEFAULTS);
onAuthStateChanged(auth, user => {
  if (!user) { authUser = null; location.replace("admin.html"); return; }
  ensureAdmin(user).then(async () => {
    const restoredDraft = restoreLocalDraft();
    if (restoredDraft) return;
    $("tsStatus").textContent = "Admin verified. Loading saved branding…";
    await loadDefault();
    
    updateSaveLabel();
  }).catch(error => {
    console.error("Theme Studio authorization/load failed:", error);
    setStatus("Admin verification or Firebase read failed: " + (error?.message || String(error)), "error");
    if (error?.message?.includes("approval") || error?.message?.includes("Google account") || error?.message?.includes("Google से login")) setTimeout(() => location.replace("admin.html"), 1200);
  });
});
