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

export const BRANDING_PRESET_TEXT = {
  netaji: {
    clubName:"नेताजी क्लब", competitionLabel:"QUIZ COMPETITION", tagline:"ज्ञान • संस्कृति • एकता",
    defaultQuizName:"Netaji Club Quiz", welcomeHeading:"नेताजी क्लब क्विज़ प्रतियोगिता",
    welcomeText:"नेताजी क्लब द्वारा आयोजित क्विज़ में आपका स्वागत है! अपनी जानकारी परखें और ज्ञान, संस्कृति व एकता का उत्सव मनाएँ।",
    loginHeading:"Player Login", loginText:"Quiz में शामिल होने के लिए अपने Google Account से सुरक्षित Login करें।",
    joinHeading:"Quiz में शामिल हों", joinText:"अपना नाम और Admin से मिला Quiz Code डालें। फिर Start Quiz दबाएँ।",
    waitingText:"Admin के Quiz शुरू करने का इंतज़ार है", rankingHeading:"LIVE RANKING",
    participantsLabel:"Participants Joined", progressLabel:"Questions Progress",
    rankingSubtitle:"Ranks update automatically as answers arrive", resultsHeading:"Quiz Results & Ranking",
    winnersHeading:"Congratulations! Top 3 Winners", winnersSubtitle:"आपकी मेहनत, आपका ज्ञान — आज का सम्मान।", footerText:"ज्ञान • संस्कृति • एकता"
  },
  independence: {
    clubName:"नेताजी क्लब", competitionLabel:"INDEPENDENCE DAY SPECIAL", tagline:"एकता • स्वतंत्रता • गौरव",
    defaultQuizName:"Independence Day Quiz", welcomeHeading:"🇮🇳 स्वतंत्रता दिवस क्विज़ प्रतियोगिता",
    welcomeText:"15 अगस्त के इस गौरवपूर्ण अवसर पर आपका स्वागत है! भारत के इतिहास, संविधान और स्वतंत्रता सेनानियों से जुड़े प्रश्नों के साथ अपने ज्ञान को परखें। जय हिन्द! 🇮🇳",
    loginHeading:"प्रतियोगिता में प्रवेश करें", loginText:"अपने Google Account से सुरक्षित Login करें और देशभक्ति क्विज़ में शामिल हों।",
    joinHeading:"क्विज़ में शामिल हों", joinText:"अपना नाम और Admin से मिला Quiz Code डालें, फिर Start Quiz दबाएँ।",
    waitingText:"क्विज़ शुरू होने का इंतज़ार करें — जय हिन्द!", rankingHeading:"🇮🇳 LIVE LEADERBOARD",
    participantsLabel:"देशभक्त प्रतिभागी", progressLabel:"प्रश्नों की प्रगति", rankingSubtitle:"हर सही उत्तर के साथ अपनी रैंक देखें",
    resultsHeading:"स्वतंत्रता दिवस परिणाम", winnersHeading:"🏆 आज के विजेता", winnersSubtitle:"ज्ञान और देशभक्ति को सलाम!", footerText:"जय हिन्द • वन्दे मातरम्"
  },
  diwali: {
    clubName:"नेताजी क्लब", competitionLabel:"DIWALI SPECIAL QUIZ", tagline:"रोशनी • खुशियाँ • ज्ञान",
    defaultQuizName:"Diwali Quiz", welcomeHeading:"🪔 दीपावली क्विज़ प्रतियोगिता",
    welcomeText:"दीपों और खुशियों के इस पावन त्योहार पर आपका स्वागत है! दीपावली की परंपराओं, संस्कृति और ज्ञान से जुड़े प्रश्नों का आनंद लें। शुभ दीपावली! ✨",
    loginHeading:"शुभ शुरुआत करें", loginText:"अपने Google Account से Login करके दीपावली क्विज़ में शामिल हों।",
    joinHeading:"क्विज़ में शामिल हों", joinText:"अपना नाम और Admin से मिला Quiz Code डालें, फिर Start Quiz दबाएँ।",
    waitingText:"क्विज़ शुरू होने तक दीपों की रोशनी का आनंद लें 🪔", rankingHeading:"🪔 LIVE RANKING",
    participantsLabel:"प्रतिभागी", progressLabel:"प्रश्नों की प्रगति", rankingSubtitle:"आपकी रैंक हर उत्तर के साथ अपडेट होती है",
    resultsHeading:"दीपावली क्विज़ परिणाम", winnersHeading:"✨ दीपावली के विजेता", winnersSubtitle:"आपके ज्ञान से जगमगाए जीत का उत्सव!", footerText:"शुभ दीपावली • खुशियाँ बाँटें"
  },
  saraswati: {
    clubName:"नेताजी क्लब", competitionLabel:"SARASWATI PUJA SPECIAL", tagline:"विद्या • बुद्धि • ज्ञान",
    defaultQuizName:"Saraswati Puja Quiz", welcomeHeading:"🌼 सरस्वती पूजा क्विज़ प्रतियोगिता",
    welcomeText:"माँ सरस्वती के आशीर्वाद और विद्या के उत्सव में आपका हार्दिक स्वागत है! अपने ज्ञान का प्रदर्शन करें और इस पावन अवसर को यादगार बनाएँ। 🙏",
    loginHeading:"विद्या उत्सव में प्रवेश करें", loginText:"अपने Google Account से सुरक्षित Login करके क्विज़ में शामिल हों।",
    joinHeading:"क्विज़ में शामिल हों", joinText:"अपना नाम और Admin से मिला Quiz Code डालें, फिर Start Quiz दबाएँ।",
    waitingText:"क्विज़ शुरू होने का इंतज़ार करें। माँ सरस्वती की कृपा बनी रहे।", rankingHeading:"🌼 LIVE RANKING",
    participantsLabel:"विद्यार्थी प्रतिभागी", progressLabel:"प्रश्नों की प्रगति", rankingSubtitle:"हर उत्तर के साथ रैंक अपडेट होती है",
    resultsHeading:"सरस्वती पूजा क्विज़ परिणाम", winnersHeading:"🏆 ज्ञान के विजेता", winnersSubtitle:"माँ सरस्वती का आशीर्वाद आप सब पर बना रहे।", footerText:"जय माँ सरस्वती • विद्या ददातु"
  },
  kali: {
    clubName:"नेताजी क्लब", competitionLabel:"KALI PUJA SPECIAL", tagline:"भक्ति • शक्ति • ज्ञान",
    defaultQuizName:"Kali Puja Quiz", welcomeHeading:"🔱 जय माँ काली! माँ के आशीर्वाद से रोशन हो जीवन।",
    welcomeText:"माँ काली की भक्ति, ज्ञान और उत्सव के इस पावन अवसर पर आपका हार्दिक स्वागत है! नेताजी क्लब द्वारा आयोजित विशेष काली पूजा क्विज़ प्रतियोगिता में भाग लें, अपने ज्ञान का प्रदर्शन करें और जीतें सम्मान एवं गौरव। आइए, भक्ति और उत्साह के साथ इस उत्सव को और भी यादगार बनाएँ। जय माँ काली! 🪔",
    loginHeading:"माँ के उत्सव में प्रवेश करें", loginText:"अपने Google Account से सुरक्षित Login करके काली पूजा क्विज़ में शामिल हों।",
    joinHeading:"काली पूजा क्विज़ में शामिल हों", joinText:"अपना नाम और Admin से मिला Quiz Code डालें, फिर Start Quiz दबाएँ।",
    waitingText:"माँ काली के आशीर्वाद के साथ क्विज़ शुरू होने का इंतज़ार करें।", rankingHeading:"🔱 LIVE RANKING",
    participantsLabel:"भक्त प्रतिभागी", progressLabel:"प्रश्नों की प्रगति", rankingSubtitle:"हर उत्तर के साथ आपकी रैंक अपडेट होती है",
    resultsHeading:"काली पूजा क्विज़ परिणाम", winnersHeading:"🏆 काली पूजा के विजेता", winnersSubtitle:"माँ काली का आशीर्वाद और शुभकामनाएँ!", footerText:"जय माँ काली! 🪔"
  },
  durga: {
    clubName:"नेताजी क्लब", competitionLabel:"DURGA PUJA SPECIAL", tagline:"शक्ति • संस्कृति • उत्सव",
    defaultQuizName:"Durga Puja Quiz", welcomeHeading:"🌺 दुर्गा पूजा क्विज़ प्रतियोगिता",
    welcomeText:"माँ दुर्गा के आगमन और उत्सव के इस शुभ अवसर पर आपका हार्दिक स्वागत है! संस्कृति, परंपराओं और ज्ञान से जुड़े प्रश्नों के साथ दुर्गा पूजा का आनंद लें। शुभो दुर्गोत्सव! 🌺",
    loginHeading:"उत्सव में प्रवेश करें", loginText:"अपने Google Account से सुरक्षित Login करके दुर्गा पूजा क्विज़ में शामिल हों।",
    joinHeading:"क्विज़ में शामिल हों", joinText:"अपना नाम और Admin से मिला Quiz Code डालें, फिर Start Quiz दबाएँ।",
    waitingText:"माँ दुर्गा के आगमन के उत्सव में क्विज़ शुरू होने का इंतज़ार करें।", rankingHeading:"🌺 LIVE RANKING",
    participantsLabel:"प्रतिभागी", progressLabel:"प्रश्नों की प्रगति", rankingSubtitle:"हर उत्तर के साथ रैंक अपडेट होती है",
    resultsHeading:"दुर्गा पूजा क्विज़ परिणाम", winnersHeading:"🏆 दुर्गोत्सव के विजेता", winnersSubtitle:"माँ दुर्गा की कृपा आप सभी पर बनी रहे।", footerText:"शुभो दुर्गोत्सव • जय माँ दुर्गा"
  },
  custom: {}
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
