/* Netaji Club UI language switcher. Intentionally excludes quiz questions and live review/projection screens. */
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get("host") === "1" || document.body.classList.contains("host-mode")) return;
  const KEY = "ncUiLanguage";
  const dict = {
    "नेताजी क्लब":"Netaji Club","नेताजी क्लब क्विज़":"Netaji Club Quiz","ज्ञान • संस्कृति • एकता":"Devotion • Strength • Knowledge",
    "Organized by":"Organized by","KALI PUJA SPECIAL":"KALI PUJA SPECIAL","CONTROL CENTRE":"CONTROL CENTRE",
    "Admin Dashboard":"Admin Dashboard","Admin Panel":"Admin Panel","Player Portal":"Player Portal","Logout":"Logout",
    "Winners Celebration":"Winners Celebration","Theme Studio":"Theme Studio","Registration Settings":"Registration Settings",
    "Yahan se registration page ka quiz/contest name, fee aur payment UPI ID update karein. Save karte hi public registration page par settings sync hongi.":"Update the quiz/contest name, fee and payment UPI ID for the registration page. Saved settings sync to the public registration page.",
    "Registration / Quiz Name":"Registration / Quiz Name","Registration Fee (₹)":"Registration Fee (₹)","Club UPI ID":"Club UPI ID","Registration Email Recipient":"Registration Email Recipient",
    "Save Registration Settings":"Save Registration Settings","Open Registration Page":"Open Registration Page","Settings Firebase se load ho rahi hain…":"Loading settings from Firebase…",
    "Create Quiz":"Create Quiz","Quiz Name":"Quiz Name","Quiz Code":"Quiz Code","Generate Quiz Code":"Generate Quiz Code","Save Quiz":"Save Quiz",
    "Quiz not started":"Quiz not started","Question Bank":"Question Bank","Upload Questions using JSON":"Upload Questions using JSON",
    "JSON file चुनें या नीचे JSON paste करें। Valid questions current question bank में जुड़ेंगे.":"Choose a JSON file or paste JSON below. Valid questions will be added to the current question bank.",
    "JSON file चुनें या नीचे JSON paste करें। Valid questions current question bank में जुड़ेंगे।":"Choose a JSON file or paste JSON below. Valid questions will be added to the current question bank.",
    "Questions की Category / Batch":"Question Category / Batch","Saraswati Maa":"Saraswati Maa","Kali Maa":"Kali Maa","General Knowledge":"General Knowledge","Math":"Math","Other (manually type)":"Other (enter manually)",
    "Import JSON Questions":"Import JSON Questions","Download Sample JSON":"Download Sample JSON","अभी कोई JSON import नहीं हुआ।":"No JSON has been imported yet.",
    "Add Single Question":"Add Single Question","Question Category":"Question Category","Correct option":"Correct option","Add Question":"Add Question",
    "Category के अनुसार Questions देखें":"Filter questions by category","All Categories":"All Categories","Language के अनुसार Questions Preview करें":"Preview questions by language",
    "ऊपर Category और Language दोनों चुनकर प्रश्न देखें। Count में चुनी भाषा के translated questions भी दिखेंगे.":"Choose both category and language above to preview questions. Counts include translated questions.",
    "ऊपर Category और Language दोनों चुनकर प्रश्न देखें। Count में चुनी भाषा के translated questions भी दिखेंगे।":"Choose both category and language above to preview questions. Counts include translated questions.",
    "Select all visible":"Select all visible","Delete selected":"Delete selected","प्रश्न हटाने के लिए सूची खोलें।":"Open the list to delete questions.",
    "View Questions / प्रश्नों की सूची खोलें":"View Questions","Live Control":"Live Control","Quiz Settings":"Quiz Settings",
    "हर प्रश्न का समय (सेकंड में)":"Time per question (seconds)","Projection timer ticking sound (Admin control)":"Projection timer ticking sound (Admin control)",
    "यह sound setting सिर्फ Admin Portal पर दिखाई देगी। Projector screen पर कोई control नहीं होगा.":"This sound setting is only available in the Admin Portal. No controls appear on the projector screen.",
    "यह sound setting सिर्फ Admin Portal पर दिखाई देगी। Projector screen पर कोई control नहीं होगा।":"This sound setting is only available in the Admin Portal. No controls appear on the projector screen.",
    "कुल प्रश्नों की सीमा":"Question limit","Quiz शुरू करने का तरीका":"Quiz start mode","तुरंत शुरू करें":"Start immediately","5 सेकंड की उलटी गिनती":"5-second countdown","10 सेकंड की उलटी गिनती":"10-second countdown","30 सेकंड की उलटी गिनती":"30-second countdown",
    "Start Quiz":"Start Quiz","Review Quiz":"Review Quiz","Next Question":"Next Question","End Quiz":"End Quiz","Quiz अभी शुरू नहीं हुआ है।":"The quiz has not started yet.",
    "Question preview":"Question preview","Current question:":"Current question:","Question timer:":"Question timer:","Participants:":"Participants:",
    "Note: Admin login Firebase से verify होता है। timer और live ranking Firebase से सभी clients पर sync होते हैं.":"Note: Admin login is verified by Firebase. The timer and live rankings sync to all clients.",
    "Note: Admin login Firebase से verify होता है। timer और live ranking Firebase से सभी clients पर sync होते हैं।":"Note: Admin login is verified by Firebase. The timer and live rankings sync to all clients.",
    "Quiz Results & Ranking":"Quiz Results & Ranking","Open Winners Celebration Page":"Open Winners Celebration Page","Quiz समाप्त होने पर प्रतिभागियों की सूची और ranking यहाँ दिखेगी।":"Participants and rankings will appear here when the quiz ends.",
    "Refresh Results":"Refresh Results","Admin Access Approval":"Admin Access Approval","Sirf Root Admin (rohit.fcg123@gmail.com) yahan se Google email approve ya revoke kar sakta hai.":"Only the Root Admin (rohit.fcg123@gmail.com) can approve or revoke Google emails here.",
    "Approve Google Email":"Approve Google Email","Approve Admin Access":"Approve Admin Access","Refresh Approved List":"Refresh Approved List","Approved Admin list load ho rahi hai…":"Loading approved admins…",
    "Admin Login":"Admin Login","केवल अधिकृत Admin":"Authorized admins only","Continue with Google":"Continue with Google",
    "Google से login करें। केवल rohit.fcg123@gmail.com और Root Admin द्वारा approved email IDs को access मिलेगा.":"Sign in with Google. Access is limited to rohit.fcg123@gmail.com and email IDs approved by the Root Admin.",
    "Google से login करें। केवल rohit.fcg123@gmail.com और Root Admin द्वारा approved email IDs को access मिलेगा।":"Sign in with Google. Access is limited to rohit.fcg123@gmail.com and email IDs approved by the Root Admin.",
    "Email/password login बंद है। Additional Admin approval केवल Root Admin दे सकता है.":"Email/password login is disabled. Only the Root Admin can approve additional admins.",
    "Email/password login बंद है। Additional Admin approval केवल Root Admin दे सकता है।":"Email/password login is disabled. Only the Root Admin can approve additional admins.",
    "Quiz में शामिल हों":"Join the Quiz",
    "Admin के Quiz शुरू करने का इंतज़ार है":"Waiting for the admin to start the quiz",
    "Admin के Quiz शुरू करने का इंतज़ार है।":"Waiting for the admin to start the quiz",
    "Quiz शुरू होने वाला है…":"The quiz is about to start…",
    "क्विज़ शुरू होने वाला है…":"The quiz is about to start…",
    "प्रश्न लोड हो रहा है…":"Loading question…",
    "Quiz समाप्त हो गया। अब आप Logout कर सकते हैं।":"The quiz has ended. You can now log out.",
    "Quiz चल रहा है। Quiz समाप्त होने तक इसी पेज पर रहें। Refresh करने पर भी आपका Quiz यहीं खुलेगा।":"The quiz is in progress. Stay on this page until it ends. Your quiz will reopen here if you refresh.",
    "Quiz शुरू हो चुका है। Quiz समाप्त होने तक Logout नहीं कर सकते।":"The quiz has started. You cannot log out until it ends.",
    "Exam चल रहा है":"Quiz in progress",
    "Correct answers / सही जवाब:":"Correct answers:",
    "प्रश्नों की भाषा / Question Language":"Question Language",
    "अभी Login नहीं हुआ है। Continue with Google दबाएँ।":"You are not logged in. Press Continue with Google.","अपना नाम और Admin से मिला Quiz Code डालें। फिर Start Quiz दबाएँ।":"Enter your name and the Quiz Code from the admin, then press Start Quiz.",
    "प्रश्नों की भाषा / Question Language":"Question Language","आपका नाम":"Your Name","Admin से Quiz Code लें। Start Quiz दबाने के बाद Waiting स्क्रीन खुलेगी।":"Get the Quiz Code from the admin. After you press Start Quiz, the waiting screen will open.",
    "Login verify नहीं हो पाया। Internet connection जाँचें और फिर कोशिश करें।":"Login verification failed. Check your internet connection and try again.",
    "अभी Login नहीं हुआ है। Continue with Google दबाएँ।":"You are not logged in. Press Continue with Google.",
    "Quiz में शामिल होने के लिए अपने Google Account से सुरक्षित Login करें। Login के बाद नए पेज पर अपना नाम और Quiz Code डालें.":"Sign in securely with your Google Account to join the quiz. After login, enter your name and Quiz Code on the next page.",
    "Quiz में शामिल होने के लिए अपने Google Account से सुरक्षित Login करें। Login के बाद नए पेज पर अपना नाम और Quiz Code डालें।":"Sign in securely with your Google Account to join the quiz. After login, enter your name and Quiz Code on the next page.",
    "🪷 ज्ञान का उत्सव, साथ मिलकर 🪷":"🪷 A Celebration of Knowledge 🪷","सरस्वती पूजा क्विज़ प्रतियोगिता":"Saraswati Puja Quiz Competition",
    "अपनी जानकारी परखें, दोस्तों के साथ खेलें और विजेता बनें।":"Test your knowledge, play with friends and become a winner.",
    "माँ के उत्सव में प्रवेश करें":"Enter the Festival","अपना Google Account से सुरक्षित Login करके काली पूजा क्विज़ में शामिल हों।":"Sign in securely with your Google Account to join the Kali Puja Quiz.",
    "जय माँ काली! माँ के आशीर्वाद से रोशन हो जीवन।":"Hail Maa Kali! May her blessings brighten your life.",
    "माँ काली की भक्ति, ज्ञान और उत्सव के इस पावन अवसर पर आपका हार्दिक स्वागत है! नेताजी क्लब द्वारा आयोजित विशेष काली पूजा क्विज़ प्रतियोगिता में भाग लें, अपने ज्ञान का प्रदर्शन करें और":"You are warmly welcomed to this sacred celebration of devotion, knowledge and Maa Kali. Join the special Kali Puja Quiz organised by Netaji Club and showcase your knowledge.",
    "माँ काली की भक्ति, ज्ञान और उत्सव के इस पावन अवसर पर आपका हार्दिक स्वागत है! नेताजी क्लब द्वारा आयोजित विशेष काली पूजा क्विज़ प्रतियोगिता में भाग लें, अपने ज्ञान का प्रदर्शन करें और":"You are warmly welcomed to this sacred celebration of devotion, knowledge and Maa Kali. Join the special Kali Puja Quiz organised by Netaji Club and showcase your knowledge.",
    "Quiz Registration":"Quiz Registration","Register for a Quiz":"Register for a Quiz","Fill in your details below. After payment, enter the UPI reference number and submit your registration by email to the club.":"Fill in your details below. After payment, enter the UPI reference number and email your registration to the club.",
    "Contestant Full Name":"Contestant Full Name","Email ID":"Email ID","Quiz / Contest":"Quiz / Contest","UPI Reference Number / UTR":"UPI Reference Number / UTR",
    "Amount Paid (₹)":"Amount Paid (₹)","Payment Date":"Payment Date","Payment note (optional)":"Payment note (optional)","Pay Now using UPI":"Pay Now using UPI",
    "Submit Registration by Email":"Submit Registration by Email","No account or Google login is required.":"No account or Google login is required.",
    "Check your details before opening your email app.":"Check your details before opening your email app.",
    "← Admin Dashboard":"← Admin Dashboard","Congratulations!":"Congratulations!","Top 3 Winners":"Top 3 Winners","आपकी मेहनत, आपका ज्ञान — आज का सम्मान।":"Your effort, your knowledge — today's honour.",
    "Results loading":"Loading results","🎉 Celebrate Again":"🎉 Celebrate Again","Admin Results खोलें":"Open Admin Results","🏅 Complete Results":"🏅 Complete Results",
    "Results और winners लोड हो रहे हैं…":"Loading results and winners…","Results Firebase से लोड हो रहे हैं।":"Loading results from Firebase.",
    "THEME STUDIO & QUIZ BRANDING":"THEME STUDIO & QUIZ BRANDING","One place to customise your quiz":"One place to customise your quiz",
    "Festival preset चुनें, colours बदलें, logo/background image URL डालें और वेबसाइट पर दिखाई देने वाला text edit करें।":"Choose a festival preset, change colours, add logo/background image URLs and edit the text displayed on the website.",
    "Theme Studio से save करने पर global branding Firebase में save होगी और connected pages पर लागू होगी।":"Saving in Theme Studio stores global branding in Firebase and applies it to connected pages.",
    "Quiz बनाने या join करने के लिए Quiz Code की सुविधा अलग से बनी रहेगी।":"The Quiz Code feature for creating or joining quizzes remains unchanged.",
    "Load Saved Default":"Load Saved Default","Reset Form":"Reset Form","Save as Default Branding":"Save as Default Branding",
    "Login securely":"Login securely","Firebase से Admin permission जाँची जाएगी।":"Admin permissions will be checked by Firebase.",
    "सिर्फ वही account खुलेगा जिसका UID Firestore के admins collection में active: true है।":"Only accounts with active: true in the Firestore admins collection can access this page."
  };
  let language = localStorage.getItem(KEY) || "en";
  const reverse = Object.fromEntries(Object.entries(dict).map(([hi,en]) => [en,hi]));
  const englishOnly = new Set(["NC","A","B","C","D","—","0","1","2","3","4","5","6","7","8","9","10","100","₹","%"]);
  const excluded = el => {
    if (!el) return false;
    if (el.closest('#options,.host-board,[data-keep-language],#resultDetail,#resultsBoard')) return true;
    // Keep the actual live question untouched, but translate waiting/status text in the game card.
    if (el.closest('#question')) {
      const status = document.getElementById('status')?.textContent?.trim().toLowerCase() || '';
      if (/live|question|प्रश्न|चल रहा/.test(status)) return true;
    }
    return false;
  };
  function translateText(value, lang) {
    const raw = value;
    const trimmed = raw.trim();
    if (!trimmed || englishOnly.has(trimmed)) return raw;
    const map = lang === "en" ? dict : reverse;
    if (map[trimmed]) return raw.replace(trimmed, map[trimmed]);
    return raw;
  }
  function translateElement(root=document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode(node) {
      if (excluded(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (!node.__ncLangOriginal) node.__ncLangOriginal = node.nodeValue;
      node.nodeValue = translateText(node.__ncLangOriginal, language);
    });
    root.querySelectorAll?.("input[placeholder],textarea[placeholder],option,label[for]").forEach(el => {
      if (excluded(el)) return;
      const attr = el.hasAttribute("placeholder") ? "placeholder" : null;
      if (attr) {
        if (!el.dataset.ncOriginalPlaceholder) el.dataset.ncOriginalPlaceholder=el.getAttribute(attr);
        const orig=el.dataset.ncOriginalPlaceholder;
        el.setAttribute(attr, translateText(orig, language));
      }
      if (el.tagName === "OPTION") {
        if (!el.dataset.ncOriginalText) el.dataset.ncOriginalText=el.textContent;
        el.textContent=translateText(el.dataset.ncOriginalText, language);
      }
    });
  }
  function addSwitcher() {
    if (document.getElementById("ncUiLanguageSwitcher")) return;
    const wrap=document.createElement("label");
    wrap.id="ncUiLanguageSwitcher";
    wrap.innerHTML='<span aria-hidden="true">🌐</span><span class="nc-language-label">Language</span><select aria-label="Website language"><option value="en">English</option><option value="hi">हिन्दी</option></select>';
    const style=document.createElement("style");
    style.textContent='#ncUiLanguageSwitcher{display:inline-flex;align-items:center;gap:8px;z-index:9998;background:linear-gradient(135deg,#fff8e8,#ffe9b8);color:#552d22;border:1px solid #d7ad50;border-radius:999px;padding:7px 12px;font:600 13px/1.2 system-ui;box-shadow:0 3px 10px #0002;margin:8px 0;white-space:nowrap}#ncUiLanguageSwitcher>span:first-child{font-size:16px}#ncUiLanguageSwitcher select{appearance:none;-webkit-appearance:none;max-width:110px;border:0;border-radius:999px;background:#fffdf6;color:#552d22;padding:6px 24px 6px 10px;font:700 13px/1.2 system-ui;outline-offset:2px;box-shadow:inset 0 0 0 1px #e7d09a;background-image:linear-gradient(45deg,transparent 50%,#552d22 50%),linear-gradient(135deg,#552d22 50%,transparent 50%);background-position:calc(100% - 12px) 50%,calc(100% - 8px) 50%;background-size:4px 4px,4px 4px;background-repeat:no-repeat}#ncUiLanguageSwitcher select:focus-visible{outline:2px solid #a86b12}header.top #ncUiLanguageSwitcher{margin-left:auto;flex-shrink:0}#ncUiLanguageSwitcher .nc-language-label{white-space:nowrap}@media(max-width:480px){#ncUiLanguageSwitcher{gap:5px;padding:6px 8px;font-size:12px}#ncUiLanguageSwitcher select{max-width:98px;padding:6px 22px 6px 8px;font-size:12px}#ncUiLanguageSwitcher .nc-language-label{display:none}header.top #ncUiLanguageSwitcher{order:10}}';
    document.head.appendChild(style);
    const header=document.querySelector("header.top");
    if(header) header.appendChild(wrap); else document.body.prepend(wrap);
    const select=wrap.querySelector("select"); select.value=language;
    select.addEventListener("change",()=>{language=select.value;localStorage.setItem(KEY,language);translateElement();});
  }
  function init(){addSwitcher();translateElement();}
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
  const translating = new WeakSet();
  const observer=new MutationObserver(records=>{
    for(const record of records) {
      if(record.type==="childList") record.addedNodes.forEach(node=>{if(node.nodeType===1 && node.id!=="ncUiLanguageSwitcher") translateElement(node); else if(node.nodeType===3) translateElement(node.parentElement);});
      else if(record.type==="characterData") {
        const node=record.target, parent=node.parentElement;
        if(!parent || excluded(parent) || parent.closest("#ncUiLanguageSwitcher") || translating.has(node)) continue;
        const displayed=node.nodeValue;
        if(node.__ncLangLastApplied !== undefined && displayed === node.__ncLangLastApplied) continue;
        node.__ncLangOriginal=displayed;
        const next=translateText(displayed,language);
        node.__ncLangLastApplied=next;
        if(next!==displayed) { translating.add(node); node.nodeValue=next; queueMicrotask(()=>translating.delete(node)); }
      }
    }
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
})();