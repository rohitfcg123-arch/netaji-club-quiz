import { db } from "./firebase.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const BRANDING_DEFAULTS = {
  preset: "saraswati",
  colors: {
    primary: "#8c2026", accent: "#a87a24", background: "#fff8e8",
    surface: "#fffdf6", text: "#552d22", header: "#fff2d2",
    border: "#e4ce94", secondary: "#ffc938"
  },
  text: {
    clubName: "नेताजी क्लब",
    competitionLabel: "QUIZ COMPETITION",
    tagline: "ज्ञान • संस्कृति • एकता",
    defaultQuizName: "Saraswati Puja Quiz",
    roundName: "Round 1",
    welcomeHeading: "सरस्वती पूजा क्विज़ प्रतियोगिता",
    welcomeText: "अपनी जानकारी परखें, दोस्तों के साथ खेलें और विजेता बनें।",
    loginHeading: "Player Login",
    loginText: "Quiz में शामिल होने के लिए अपने Google Account से सुरक्षित Login करें।",
    joinHeading: "Quiz में शामिल हों",
    joinText: "अपना नाम और Admin से मिला Quiz Code डालें। फिर Start Quiz दबाएँ।",
    waitingText: "Admin के Quiz शुरू करने का इंतज़ार है",
    rankingHeading: "LIVE RANKING",
    participantsLabel: "Participants Joined",
    progressLabel: "Questions Progress",
    rankingSubtitle: "Ranks update automatically as answers arrive",
    resultsHeading: "Quiz Results & Ranking",
    winnersHeading: "Congratulations! Top 3 Winners",
    winnersSubtitle: "आपकी मेहनत, आपका ज्ञान — आज का सम्मान।",
    footerText: "ज्ञान • संस्कृति • एकता"
  },
  assets: { logoUrl: "", backgroundUrl: "" },
  effects: { decorations: true, animations: true },
  updatedAt: null
};

export const BRANDING_PRESETS = {
  netaji: {
    label: "Netaji Club",
    colors: { primary:"#8c2026", accent:"#c18a26", background:"#fff8e8", surface:"#fffdf6", text:"#552d22", header:"#fff2d2", border:"#e4ce94", secondary:"#ffc938" },
    effects: { decorations:true, animations:true }
  },
  independence: {
    label: "Independence Day",
    colors: { primary:"#174889", accent:"#e87924", background:"#f3f8ff", surface:"#ffffff", text:"#17304d", header:"#ffffff", border:"#c8d8ea", secondary:"#138808" },
    effects: { decorations:true, animations:false }
  },
  diwali: {
    label: "Diwali",
    colors: { primary:"#e8b447", accent:"#ffcc54", background:"#160d29", surface:"#24163b", text:"#fff3d0", header:"#1b102e", border:"#77562b", secondary:"#a675ff" },
    effects: { decorations:true, animations:true }
  },
  saraswati: {
    label: "Saraswati Puja",
    colors: { primary:"#9c5f12", accent:"#c88913", background:"#fff9e8", surface:"#fffef8", text:"#51331b", header:"#fff0bd", border:"#e7d49c", secondary:"#f6ce4f" },
    effects: { decorations:true, animations:true }
  },
  kali: {
    label: "Kali Puja",
    colors: { primary:"#db3045", accent:"#f4c65a", background:"#100b12", surface:"#25121c", text:"#fff1ef", header:"#1a0c14", border:"#6c303b", secondary:"#7b1930" },
    effects: { decorations:true, animations:true }
  },
  durga: {
    label: "Durga Puja",
    colors: { primary:"#b52a39", accent:"#dca44d", background:"#fff5f2", surface:"#fffdfb", text:"#482024", header:"#fff0eb", border:"#e6c3bd", secondary:"#f4d6bc" },
    effects: { decorations:true, animations:true }
  },
  custom: {
    label: "Custom",
    colors: { primary:"#5145cd", accent:"#e09b37", background:"#f5f5fb", surface:"#ffffff", text:"#25233a", header:"#ebeaff", border:"#cfcee9", secondary:"#22a58c" },
    effects: { decorations:false, animations:false }
  }
};

const HEX = /^#[0-9a-fA-F]{6}$/;
function safeColor(value, fallback) { return HEX.test(String(value || "")) ? String(value) : fallback; }
function safeUrl(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  try { const u = new URL(s); return ["https:", "http:"].includes(u.protocol) ? u.href : ""; }
  catch { return ""; }
}
export function normalizeBranding(input) {
  const value = input && typeof input === "object" ? input : {};
  const preset = BRANDING_PRESETS[value.preset] ? value.preset : "saraswati";
  const colors = { ...BRANDING_DEFAULTS.colors, ...BRANDING_PRESETS[preset].colors, ...(value.colors || {}) };
  for (const key of Object.keys(BRANDING_DEFAULTS.colors)) colors[key] = safeColor(colors[key], BRANDING_DEFAULTS.colors[key]);
  const text = {};
  for (const [key, fallback] of Object.entries(BRANDING_DEFAULTS.text)) {
    const candidate = value.text && value.text[key];
    text[key] = typeof candidate === "string" && candidate.trim() ? candidate.slice(0, 180) : fallback;
  }
  return {
    preset,
    colors,
    text,
    assets: {
      logoUrl: safeUrl(value.assets?.logoUrl),
      backgroundUrl: safeUrl(value.assets?.backgroundUrl)
    },
    effects: {
      decorations: value.effects?.decorations !== false,
      animations: value.effects?.animations !== false
    },
    updatedAt: value.updatedAt || null,
    useDefaultTheme: value.useDefaultTheme === true
  };
}
export function resolveBranding(defaultConfig, quizOverride) {
  const base = normalizeBranding(defaultConfig || BRANDING_DEFAULTS);
  if (!quizOverride || typeof quizOverride !== "object" || quizOverride.useDefaultTheme === true) return base;
  const override = normalizeBranding({
    ...base,
    ...quizOverride,
    colors: { ...base.colors, ...(quizOverride.colors || {}) },
    text: { ...base.text, ...(quizOverride.text || {}) },
    assets: { ...base.assets, ...(quizOverride.assets || {}) },
    effects: { ...base.effects, ...(quizOverride.effects || {}) }
  });
  return override;
}
function writeVariables(element, config) {
  const c = config.colors;
  element.style.setProperty("--theme-primary", c.primary);
  element.style.setProperty("--theme-accent", c.accent);
  element.style.setProperty("--theme-background", c.background);
  element.style.setProperty("--theme-surface", c.surface);
  element.style.setProperty("--theme-text", c.text);
  element.style.setProperty("--theme-header", c.header);
  element.style.setProperty("--theme-border", c.border);
  element.style.setProperty("--theme-secondary", c.secondary);
  element.style.setProperty("--theme-background-image", config.assets.backgroundUrl ? 'url("' + config.assets.backgroundUrl.replaceAll('"', "%22") + '")' : "none");
}
export function applyBranding(input, root = document.documentElement) {
  const config = normalizeBranding(input);
  writeVariables(root, config);
  if (root === document.documentElement) {
    const body = document.body;
    if (body) {
      body.classList.add("brand-themed");
      body.classList.toggle("brand-decorations-on", config.effects.decorations);
      body.classList.toggle("brand-animations-on", config.effects.animations);
      for (const name of Object.keys(BRANDING_PRESETS)) body.classList.remove("brand-preset-" + name);
      body.classList.add("brand-preset-" + config.preset);
    }
    document.documentElement.style.colorScheme = ["diwali", "kali"].includes(config.preset) ? "dark" : "light";
    applyBrandText(config, document);
    document.querySelectorAll("[data-brand-logo]").forEach(el => {
      const url = config.assets.logoUrl;
      if (el.tagName === "IMG") {
        if (url) { el.src = url; el.hidden = false; }
        else { el.removeAttribute("src"); el.hidden = true; }
      } else if (url) {
        el.style.backgroundImage = 'url("' + url.replaceAll('"', "%22") + '")';
        el.style.backgroundPosition = "center";
        el.style.backgroundRepeat = "no-repeat";
        el.style.backgroundSize = "contain";
        el.textContent = "";
        el.classList.add("brand-logo-custom");
      } else {
        el.style.backgroundImage = "";
        el.classList.remove("brand-logo-custom");
        if (!el.textContent.trim()) el.textContent = el.dataset.brandLogoFallback || "NC";
      }
    });
  } else {
    root.classList.add("brand-themed");
    root.classList.add("brand-preset-" + config.preset);
    root.querySelectorAll?.("[data-brand-text]").forEach(el => {
      const text = config.text[el.dataset.brandText];
      if (typeof text === "string") el.textContent = text;
    });
  }
  return config;
}
export function applyBrandText(config, root = document) {
  root.querySelectorAll?.("[data-brand-text]").forEach(el => {
    const value = config?.text?.[el.dataset.brandText];
    if (typeof value === "string") el.textContent = value;
  });
}
export function listenForDefaultBranding(callback) {
  return onSnapshot(doc(db, "siteSettings", "branding"), snap => {
    callback(snap.exists() ? normalizeBranding(snap.data()) : normalizeBranding(BRANDING_DEFAULTS), null);
  }, error => callback(normalizeBranding(BRANDING_DEFAULTS), error));
}
