import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { listenForDefaultBranding } from "./branding.js?v=20261013-branding-2";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, Timestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id),KEY="netajiQuizLiveState";
let questions=[],bankQuestions=[],current=0,quiz={id:"",name:"Saraswati Puja Quiz",status:"waiting",settings:{pointsPerCorrect:10,questionSeconds:10,questionLimit:100,startDelay:0},questions:[]},players=[],autoTimer=null,countdownTimer=null;
// Run fencing: stale Admin tabs must not overwrite a newer run or end a live quiz.
let allowRunTakeoverOnce=false, allowExplicitCompletion=false;
let lastStartError="", startPhase="तैयारी";
const languageNames={hi:"हिंदी",en:"English",bn:"বাংলা"};

let adminAudioContext = null;
let lastAdminTickKey = "";
function timerSoundEnabled() {
  const saved = localStorage.getItem("ncTimerSoundEnabled");
  if (saved !== null) return saved !== "false";
  return typeof quiz?.settings?.timerSoundEnabled === "boolean" ? quiz.settings.timerSoundEnabled : true;
}
function playAdminTimerTick(remaining, scope = "question") {
  if (!timerSoundEnabled() || Number(remaining) <= 0) return;
  const marker = String(scope) + ":" + String(current) + ":" + String(remaining);
  if (marker === lastAdminTickKey) return;
  lastAdminTickKey = marker;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!adminAudioContext) adminAudioContext = new AudioCtor();
    if (adminAudioContext.state === "suspended") adminAudioContext.resume().catch(() => {});
    const oscillator = adminAudioContext.createOscillator();
    const gain = adminAudioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, adminAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.04, adminAudioContext.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, adminAudioContext.currentTime + 0.055);
    oscillator.connect(gain);
    gain.connect(adminAudioContext.destination);
    oscillator.start();
    oscillator.stop(adminAudioContext.currentTime + 0.06);
  } catch (error) {
    console.debug("Admin timer sound unavailable:", error);
  }
}
function initTimerSoundToggle() {
  const toggle = $("timerSoundEnabled");
  if (!toggle) return;
  toggle.checked = timerSoundEnabled();
  toggle.addEventListener("change", () => {
    localStorage.setItem("ncTimerSoundEnabled", String(toggle.checked));
    quiz.settings = { ...(quiz.settings || {}), timerSoundEnabled: toggle.checked };
    if (quiz.id) persist().catch(error => console.error("Could not sync timer sound setting to Firebase:", error));
    if (toggle.checked) playAdminTimerTick(1, "toggle-preview");
  });
}
initTimerSoundToggle();
function primeAdminAudio() {
  if (!timerSoundEnabled()) return;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!adminAudioContext) adminAudioContext = new AudioCtor();
    if (adminAudioContext.state === "suspended") adminAudioContext.resume().catch(() => {});
  } catch (error) {
    console.debug("Could not prime Admin timer audio:", error);
  }
}
$("start")?.addEventListener("click", primeAdminAudio);
$("openLiveScreen")?.addEventListener("click", primeAdminAudio);

const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch{return {}}};
let syncChain=Promise.resolve();
let advancingQuestion=false;
let unsubPlayers=null, watchedPlayerCode="";
let reviewUnsubs=[];
function persist(){
  const s=read();s.quiz={...quiz,questions,currentIndex:current};s.questions=bankQuestions;s.questionBank=bankQuestions;s.players=players;
  try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){console.warn("Local cache unavailable",e)}
  if(!quiz.id)return Promise.resolve();
  const code=String(quiz.id).trim().toUpperCase();
  const quizDoc={id:code,name:quiz.name||"Quiz",status:quiz.status||"waiting",settings:quiz.settings||{questionSeconds:10,questionLimit:100,startDelay:0},currentIndex:current,runId:quiz.runId||"",startAt:Number(quiz.startAt||0),questionStartedAt:Number(quiz.questionStartedAt||0),endAt:Number(quiz.endAt||0),startedAt:quiz.startedAt instanceof Timestamp?quiz.startedAt:(quiz.startAt?Timestamp.fromMillis(Number(quiz.startAt)):null),lead:Number(quiz.settings?.startDelay||0),sec:Number(quiz.settings?.questionSeconds||10),count:questions.length,updatedAt:serverTimestamp()};
  // Serialize writes and fence stale tabs against the authoritative Firestore run.
  const queuedWrite=syncChain.catch(()=>undefined).then(async()=>{
    const quizRef=doc(db,"quizzes",code);
    const remoteSnap=await getDoc(quizRef);
    const remote=remoteSnap.exists()?remoteSnap.data():null;
    const remoteRun=String(remote?.runId||"");
    const localRun=String(quizDoc.runId||"");
    if(remote && remoteRun && localRun && remoteRun!==localRun && !allowRunTakeoverOnce){
      const msg="यह Admin tab पुराने Quiz Run का है। नए Run को overwrite करने से बचाया गया है। Active Admin tab ही इस्तेमाल करें।";
      console.warn(msg,{remoteRun,localRun,code});
      const el=$("liveStatus");if(el)el.textContent="⚠️ "+msg;
      throw new Error(msg);
    }
    if(remote && remote.status==="live" && quizDoc.status==="completed" && !allowExplicitCompletion){
      const msg="Stale Admin tab से Quiz को completed करने वाला update रोका गया; Firestore में live status सुरक्षित है।";
      console.warn(msg,{code,remoteRun,localRun});
      const el=$("liveStatus");if(el)el.textContent="⚠️ "+msg;
      throw new Error(msg);
    }
    await setDoc(quizRef,quizDoc,{merge:true});
    if(allowRunTakeoverOnce && remoteRun!==localRun) allowRunTakeoverOnce=false;
    if(allowExplicitCompletion && quizDoc.status==="completed") allowExplicitCompletion=false;
    await setDoc(doc(db,"quizzes",code,"publicReview","summary"),{status:quizDoc.status,currentIndex:quizDoc.currentIndex,startAt:quizDoc.startAt,questionStartedAt:quizDoc.questionStartedAt,questionSeconds:Number(quizDoc.settings?.questionSeconds||10),total:quizDoc.count,updatedAt:serverTimestamp()},{merge:true});
  });
  syncChain=queuedWrite;
  queuedWrite.catch(e=>{console.error("Firestore quiz sync failed",e);const el=$("quizStatus");if(el)el.textContent="Firebase sync error: "+(e.message||"Rules/connection जाँचें")});
  return queuedWrite;
}
async function syncQuestionBank(){
  if(!quiz.id) throw new Error("Quiz Code save नहीं है।");
  const code=String(quiz.id).trim().toUpperCase();
  await persist();
  const qs=collection(db,"quizzes",code,"questions");
  const existing=await getDocs(qs);
  
  const batch=writeBatch(db);
  for(let i=0;i<questions.length;i++){
    const q=questions[i];
    batch.set(doc(db,"quizzes",code,"questions",String(i)),{question:q.translations?.hi?.question||q.question,options:q.translations?.hi?.options||q.options,translations:q.translations||null,category:q.category||"Uncategorized"});
    batch.set(doc(db,"quizzes",code,"keys",String(i)),{correctIndex:Number(q.correctIndex)||0});
  }
  // Preserve question-bank documents outside the selected run limit.
  $("liveStatus").textContent="⏳ "+questions.length+" questions Firebase पर एक साथ sync हो रहे हैं…";
  await batch.commit();
}
async function clearRunCollection(name){
  const code=String(quiz.id||"").trim().toUpperCase();
  const snap=await getDocs(collection(db,"quizzes",code,name));
  for(let offset=0;offset<snap.docs.length;offset+=400){
    const batch=writeBatch(db);
    snap.docs.slice(offset,offset+400).forEach(d=>batch.delete(d.ref));
    await batch.commit();
  }
}
async function clearRunRecords(){
  // Reusing a Quiz Code must not carry answers, timings, or results from an older round.
  for(const name of ["answers","results","questionTiming"]) await clearRunCollection(name);
}
async function markQuestionStarted(index){
  const code=String(quiz.id||"").trim().toUpperCase();
  // Firestore assigns the timestamp; player-device clocks are not used in rankings.
  await setDoc(doc(db,"quizzes",code,"questionTiming",String(index)),{
    questionIndex:index,
    runId:quiz.runId||"",
    startedAt:serverTimestamp()
  });
}
// Recover questions already saved in Firestore for this quiz code. Older runs may have
// uploaded a larger bank; do not let a short local cache permanently cap the quiz.
async function restoreRemoteQuestionBank(){
  if(!quiz.id)return 0;
  try{
    const code=String(quiz.id).trim().toUpperCase();
    const [questionSnap,keySnap]=await Promise.all([
      getDocs(collection(db,"quizzes",code,"questions")),
      getDocs(collection(db,"quizzes",code,"keys"))
    ]);
    const keyMap=new Map(keySnap.docs.map(d=>[d.id,d.data()]));
    const remote=questionSnap.docs
      .sort((a,b)=>(Number(a.id)-Number(b.id)))
      .map(d=>{const x=d.data();const k=keyMap.get(d.id)||{};return {question:String(x.question||""),options:Array.isArray(x.options)?x.options.map(String):[],translations:x.translations&&typeof x.translations==="object"?x.translations:null,correctIndex:Number(k.correctIndex)||0,category:String(x.category||"Uncategorized")}})
      .filter(q=>q.question&&q.options.length===4);
    if(remote.length>bankQuestions.length){
      bankQuestions=remote;
      if(!["live","starting"].includes(quiz.status))questions=bankQuestions;
      const state=read();state.questions=bankQuestions;state.questionBank=bankQuestions;
      try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){console.warn("Could not cache recovered bank",e)}
      render();
      const status=$("liveStatus");if(status)status.textContent="✅ Firestore से "+remote.length+" saved questions restore हुए। अब quiz start करें।";
    }
    return remote.length;
  }catch(e){console.warn("Remote question-bank recovery unavailable",e);return 0}
}
function save(){persist();render()}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function escapeHtml(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function currentCategory(){const custom=$("customImportCategory")?.value.trim();return custom||$("importCategory")?.value||"Uncategorized"}
function selectedSingleCategory(){return $("customSingleCategory")?.value.trim()||$("singleCategory")?.value||"Uncategorized"}
function selectedQuestionLanguage(){return $("questionLanguageFilter")?.value||"hi"}
function localizedAdminQuestion(q){const lang=selectedQuestionLanguage(),t=q?.translations?.[lang];return t&&typeof t.question==="string"&&Array.isArray(t.options)&&t.options.length===4?{question:t.question,options:t.options,translated:true}:{question:q?.question||"",options:q?.options||[],translated:false}}
function visibleQuestionIndexes(){const filter=$("categoryFilter").value;return bankQuestions.map((q,i)=>({q,i})).filter(x=>filter==="__all"||(x.q.category||"Uncategorized")===filter).map(x=>x.i)}
function refreshCategoryFilter(){const select=$("categoryFilter"),previous=select.value;const cats=[...new Set(bankQuestions.map(q=>q.category||"Uncategorized"))].sort((a,b)=>a.localeCompare(b));const signature="__all|"+bankQuestions.length+"|"+cats.map(c=>c+":"+bankQuestions.filter(q=>(q.category||"Uncategorized")===c).length).join("|");if(select.dataset.signature===signature)return;select.dataset.signature=signature;select.innerHTML="<option value='__all'>All Categories ("+bankQuestions.length+")</option>"+cats.map(c=>"<option value='"+escapeHtml(c)+"'>"+escapeHtml(c)+" ("+bankQuestions.filter(q=>(q.category||"Uncategorized")===c).length+")</option>").join("");select.value=cats.includes(previous)?previous:"__all"}
function formatElapsed(ms){const t=Math.max(0,Math.floor(ms/1000));return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0")}
function watchPlayers(){
  const code=String(quiz.id||"").trim().toUpperCase();
  if(!code)return;
  if(watchedPlayerCode===code&&unsubPlayers)return;
  if(unsubPlayers){unsubPlayers();unsubPlayers=null;}
  reviewUnsubs.forEach(fn=>fn()); reviewUnsubs=[];
  watchedPlayerCode=code;
  let reviewPlayers=[], reviewAnswers=[], reviewKeys=new Map();
  const publishPublicReview=async()=>{
    try{
      const total=Math.max(0,Number(quiz.count||questions.length||0));
      const points=Number(quiz.settings?.pointsPerCorrect||10);
      const rows=reviewPlayers.map(p=>{
        const mine=reviewAnswers.filter(a=>a.uid===p.uid);
        const correct=mine.filter(a=>reviewKeys.has(String(a.q))&&reviewKeys.get(String(a.q))===Number(a.sel)).length;
        return {id:String(p.uid),name:String(p.name||"Participant").slice(0,40),score:correct*points,correct,answered:mine.length};
      }).sort((a,b)=>b.correct-a.correct||a.name.localeCompare(b.name));
      await setDoc(doc(db,"quizzes",code,"publicReview","summary"),{
        leaderboard:rows.slice(0,50),total:Number(quiz.count||questions.length||0),
        status:String(quiz.status||"waiting"),currentIndex:Number(current||0),
        questionStartedAt:Number(quiz.questionStartedAt||0),startAt:Number(quiz.startAt||0),
        questionSeconds:Number(quiz.settings?.questionSeconds||10),updatedAt:serverTimestamp()
      },{merge:true});
    }catch(e){console.error("Public Review summary publish failed",e)}
  };
  unsubPlayers=onSnapshot(collection(db,"quizzes",code,"players"),snap=>{
    const previous=new Map(players.map(p=>[String(p.uid||p.id||""),p]));
    players=snap.docs.map(d=>{const old=previous.get(d.id)||{};return {...old,...d.data(),uid:d.id,score:Number(old.score||0)}});
    reviewPlayers=players.map(p=>({uid:p.uid,name:p.name||"Participant"}));
    const state=read();state.players=players;
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){console.warn("Could not cache player list",e)}
    render(); void publishPublicReview();
  },error=>{
    console.error("Live participant sync failed",error);
    const status=$("liveStatus");if(status)status.textContent="Participant sync error: "+(error.message||"Firebase Rules जाँचें।");
  });
  reviewUnsubs.push(onSnapshot(collection(db,"quizzes",code,"answers"),snap=>{
    reviewAnswers=snap.docs.map(d=>({id:d.id,...d.data()})); void publishPublicReview();
  },error=>console.error("Live answers sync failed",error)));
  reviewUnsubs.push(onSnapshot(collection(db,"quizzes",code,"keys"),snap=>{
    reviewKeys=new Map(snap.docs.map(d=>[d.id,Number(d.data().correctIndex)])); void publishPublicReview();
  },error=>console.error("Live answer keys sync failed",error)));
}

function renderPlayersIfChanged(){
 const list=$("players");
 if(!list)return;
 const signature=JSON.stringify((players||[]).map(p=>[p.uid||"",p.name||"",p.email||"",Number(p.score||0)]));
 if(signature===lastRenderedPlayerSignature)return;
 lastRenderedPlayerSignature=signature;
 list.innerHTML=(players||[]).map(p=>"<li>"+escapeHtml(p.name)+" <small>"+escapeHtml(p.email||"")+"</small> — "+(p.score||0)+" points</li>").join("");
}
let lastRenderedPlayerSignature="";
function render(){
 refreshCategoryFilter();
 const visible=visibleQuestionIndexes();
 const lang=selectedQuestionLanguage();const translatedCount=bankQuestions.filter(q=>q.translations&&q.translations[lang]&&typeof q.translations[lang].question==="string"&&Array.isArray(q.translations[lang].options)&&q.translations[lang].options.length===4).length;
 $("count").textContent=bankQuestions.length+" questions total • "+visible.length+" shown • "+languageNames[lang]+": "+translatedCount+"/"+bankQuestions.length+" translated";
 $("questions").innerHTML=visible.map(i=>{const q=bankQuestions[i],t=localizedAdminQuestion(q);return "<li class='question-item'><label class='question-select'><input type='checkbox' class='question-checkbox' data-select='"+i+"'><span><b>["+escapeHtml(q.category||"Uncategorized")+"]</b> Q"+(i+1)+". "+escapeHtml(t.question)+" <small>"+(t.translated?"✓ "+languageNames[lang]:"⚠ Translation missing — Hindi fallback")+"</small></span></label><button type='button' data-del='"+i+"' class='danger small-button'>Delete</button></li>"}).join("");
 $("quizStatus").textContent="Quiz Code: "+(quiz.id||"generate a code")+" • "+quiz.status;
 $("liveStatus").textContent=lastStartError?("❌ "+lastStartError):(quiz.status==="live"?"🟢 QUIZ LIVE — शुरू हो चुका है • प्रश्न "+Math.min(current+1,questions.length)+" / "+questions.length+" • चलने का समय "+formatElapsed(Date.now()-Number(quiz.startAt||Date.now())):quiz.status==="starting"?"⏳ Quiz "+Math.max(0,Math.ceil((Number(quiz.startAt||0)-Date.now())/1000))+" सेकंड में शुरू होगा…":quiz.status==="completed"?"Quiz समाप्त हो गया है।":"Quiz अभी शुरू नहीं हुआ है।");
 $("preview").textContent=localizedAdminQuestion(questions[current]||{}).question||"Question preview";
 $("questionProgress").textContent=questions.length?Math.min(current+1,questions.length)+" / "+questions.length:"0 / 0";
 const secs=Number(quiz.settings?.questionSeconds||10),started=Number(quiz.questionStartedAt||0);
 $("adminTimer").textContent=quiz.status==="live"?(Math.max(0,secs*1000-(Date.now()-started))/1000).toFixed(1)+" sec":"—";
 $("participants").textContent=players.length;
 renderPlayersIfChanged();
 $("questions").querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.del);if(i<0||i>=questions.length)return;if(!confirm("यह प्रश्न हटाना है?"))return;bankQuestions.splice(i,1);questions=bankQuestions;$("deleteStatus").textContent="एक प्रश्न हटा दिया गया।";save()});
 $("questions").querySelectorAll(".question-checkbox").forEach(box=>box.onchange=()=>{const n=$("questions").querySelectorAll(".question-checkbox:checked").length;$("deleteStatus").textContent=n?n+" प्रश्न चुने गए हैं।":"कोई प्रश्न चुना नहीं गया।";updateSelectionButton()});
 $("selectAllQuestions").disabled=!visible.length;
 $("bulkDeleteQuestions").disabled=!visible.length;
 updateSelectionButton();
}
function updateSelectionButton(){const boxes=[...$("questions").querySelectorAll(".question-checkbox")];const all=boxes.length>0&&boxes.every(b=>b.checked);$("selectAllQuestions").textContent=all?"Unselect all":"Select all visible"}
function publish(){persist();render()}
function parseQuestions(data){
 const list=Array.isArray(data)?data:(data&&Array.isArray(data.questions)?data.questions:null);
 if(!list)throw new Error('JSON में questions नाम की array नहीं मिली।');
 const fallback=currentCategory();
 return list.map((item,i)=>{
  let translations=null,question="",opts=[];
  if(item.translations&&typeof item.translations==="object"){
   translations={};
   for(const lang of ["hi","en","bn"]){
    const t=item.translations[lang];
    if(!t||typeof t.question!=="string"||!Array.isArray(t.options)||t.options.length!==4||t.options.some(x=>String(x).trim()===""))
     throw new Error("Question "+(i+1)+": हिंदी, English और বাংলা में question तथा चारों options जरूरी हैं।");
    translations[lang]={question:t.question.trim(),options:t.options.map(x=>String(x).trim())};
   }
   question=translations.hi.question;opts=translations.hi.options;
  }else{
   question=String(item.q??item.question??item.text??"").trim();
   opts=item.options??item.choices;
   if(!Array.isArray(opts)&&item.options&&typeof item.options==="object")opts=Object.values(item.options);
   if(!Array.isArray(opts)&&["A","B","C","D"].every(k=>item[k]!==undefined))opts=[item.A,item.B,item.C,item.D];
  }
  if(!question)throw new Error("Question "+(i+1)+": q/question खाली है।");
  if(!Array.isArray(opts)||opts.length!==4||opts.some(x=>String(x).trim()===""))throw new Error("Question "+(i+1)+": चार options जरूरी हैं।");
  const raw=item.correctIndex??item.answerIndex??item.correctOptionIndex??item.correctAnswer??item.answer??item.correct;
  let idx=-1;
  if(Number.isInteger(raw))idx=raw;
  else if(typeof raw==="string"){
   const x=raw.trim();
   if(/^[0-3]$/.test(x))idx=Number(x);
   else if(/^[A-D]$/i.test(x))idx=x.toUpperCase().charCodeAt(0)-65;
   else if(/^option\s*[A-D]$/i.test(x))idx=x.slice(-1).toUpperCase().charCodeAt(0)-65;
   else if(/^option\s*[1-4]$/i.test(x))idx=Number(x.slice(-1))-1;
   else{const found=opts.findIndex(o=>String(o).trim()===x);if(found>=0)idx=found}
  }
  if(idx<0||idx>3)throw new Error("Question "+(i+1)+": answer A/B/C/D या 0/1/2/3 होना चाहिए।");
  const category=String(item.category??item.categoryName??item.batch??item.tag??fallback).trim()||fallback;
  return{question,options:opts.map(x=>String(x).trim()),translations,correctIndex:idx,category};
 });
}
async function importJson(){const status=$("importStatus"),button=$("importJson");try{status.textContent="JSON पढ़ा जा रहा है…";button.disabled=true;let raw=$("jsonText").value.trim();const input=$("jsonFile"),file=input.files&&input.files[0];if(file)raw=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("फ़ाइल पढ़ी नहीं जा सकी।"));reader.readAsText(file)});if(!raw)throw new Error("पहले JSON file चुनें या JSON text paste करें।");let data;try{data=JSON.parse(raw)}catch(e){throw new Error("JSON format गलत है: "+e.message)}const parsed=parseQuestions(data);if(!parsed.length)throw new Error("फ़ाइल में कोई question नहीं मिला।");bankQuestions.push(...parsed);questions=bankQuestions;save();status.textContent="✅ "+parsed.length+" प्रश्न import हुए। कुल प्रश्न: "+bankQuestions.length+"।";$("jsonText").value="";input.value=""}catch(e){console.error(e);status.textContent="❌ Import नहीं हुआ: "+(e.message||String(e))}finally{button.disabled=false}}
$("categoryFilter").addEventListener("change",()=>{$("deleteStatus").textContent="Category: "+$("categoryFilter").selectedOptions[0].textContent;render()});
$("questionLanguageFilter").addEventListener("change",()=>{render();$("deleteStatus").textContent="Preview language: "+languageNames[selectedQuestionLanguage()]+" — सिर्फ Admin preview बदलेगा।"});
$("selectAllQuestions").onclick=()=>{const boxes=[...$("questions").querySelectorAll(".question-checkbox")];const all=boxes.length>0&&boxes.every(b=>b.checked);boxes.forEach(b=>b.checked=!all);$("deleteStatus").textContent=all?"चयन हटाया गया।":boxes.length+" visible प्रश्न चुने गए।";updateSelectionButton()};
$("bulkDeleteQuestions").onclick=()=>{const selected=[...$("questions").querySelectorAll(".question-checkbox:checked")].map(b=>Number(b.dataset.select)).filter(Number.isInteger).sort((a,b)=>b-a);if(!selected.length){$("deleteStatus").textContent="पहले हटाने के लिए प्रश्न चुनें।";return}if(!confirm("क्या आप "+selected.length+" चुने हुए प्रश्न स्थायी रूप से हटाना चाहते हैं?"))return;selected.forEach(i=>{if(i>=0&&i<bankQuestions.length)bankQuestions.splice(i,1)});questions=bankQuestions;$("deleteStatus").textContent=selected.length+" प्रश्न हटा दिए गए।";save()};

$("importJson").addEventListener("click",importJson);
$("jsonFile").addEventListener("change",e=>{const file=e.target.files&&e.target.files[0];if(file)$("importStatus").textContent="फ़ाइल चुनी गई: "+file.name+" ("+Math.round(file.size/1024)+" KB)। अब Import JSON Questions दबाएँ।"});
$("downloadSample").onclick=()=>{const sample={exam:"Sample Quiz",questions:[{q:"भारत की राजधानी क्या है?",options:["दिल्ली","मुंबई","कोलकाता","चेन्नई"],answer:"A"}]};const a=document.createElement("a"),url=URL.createObjectURL(new Blob([JSON.stringify(sample,null,2)],{type:"application/json"}));a.href=url;a.download="netaji-quiz-sample.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$("generate").onclick=()=>{$("quizCode").value="NC"+Math.random().toString(36).slice(2,8).toUpperCase()};
$("quizForm").onsubmit=e=>{e.preventDefault();const newCode=$("quizCode").value.trim().toUpperCase();if(!newCode){alert("Quiz Code generate करें।");return}const codeChanged=newCode!==quiz.id;quiz.id=newCode;quiz.name=$("quizName").value.trim();quiz.status="waiting";quiz.startAt=0;quiz.startedAt=null;quiz.questionStartedAt=0;quiz.endAt=0;quiz.runId=crypto.randomUUID();
  allowRunTakeoverOnce=true;current=0;stopTimers();save();persist();watchPlayers();$("liveStatus").textContent="Quiz तैयार है। Start Quiz दबाकर शुरू करें।";alert("Quiz saved. Code: "+quiz.id+" — Status reset to waiting.")};
$("questionForm").onsubmit=e=>{e.preventDefault();bankQuestions.push({question:$("qText").value.trim(),options:[$("a").value.trim(),$("b").value.trim(),$("c").value.trim(),$("d").value.trim()],correctIndex:+$("correct").value,category:selectedSingleCategory()});questions=bankQuestions;e.target.reset();save()};
function stopTimers(){if(autoTimer)clearInterval(autoTimer);if(countdownTimer)clearInterval(countdownTimer);autoTimer=countdownTimer=null}
async function beginLive(){
  stopTimers();
  if(!quiz.id) throw new Error("पहले Quiz Code generate करके Save Quiz करें।");
  if(!questions.length) throw new Error("पहले JSON से questions import करें।");
  // Theme Studio can update the current quiz in a different tab/device. Refresh the
  // persisted name/branding before starting so this dashboard cannot overwrite them
  // with an older local cache. Current Admin timing inputs remain authoritative.
  try {
    const remoteSnap = await getDoc(doc(db, "quizzes", String(quiz.id).trim().toUpperCase()));
    if (remoteSnap.exists()) {
      const remote = remoteSnap.data();
      const localSettings = { ...(quiz.settings || {}) };
      quiz.name = remote.name || quiz.name;
      quiz.settings = {
        ...localSettings,
        ...(remote.settings || {}),
        questionSeconds: localSettings.questionSeconds,
        questionLimit: localSettings.questionLimit,
        startDelay: localSettings.startDelay,
        timerSoundEnabled: $("timerSoundEnabled") ? $("timerSoundEnabled").checked : timerSoundEnabled()
      };
      if ($("quizName") && quiz.name) $("quizName").value = quiz.name;
    }
  } catch (syncError) {
    console.error("Unable to refresh remote quiz settings before start:", syncError);
    showStartError(syncError);
    return;
  }
  const delay=Math.max(0,Number(quiz.settings?.startDelay||0));
  const seconds=Math.max(5,Number(quiz.settings?.questionSeconds||10));
  quiz.status="waiting";
  quiz.settings={...(quiz.settings||{}),questionSeconds:seconds,timerSoundEnabled:$("timerSoundEnabled")?$("timerSoundEnabled").checked:timerSoundEnabled()};
  quiz.count=questions.length;
  current=0;
  quiz.runId=crypto.randomUUID();
  // A deliberate Start Quiz action creates a new run for this code. Permit this
  // one intentional run takeover so the stale-run fence does not reject its first
  // Firebase write against the previous runId.
  allowRunTakeoverOnce=true;
  $("liveStatus").textContent="⏳ पहले "+questions.length+" questions Firebase पर sync हो रहे हैं…";
  $("adminTimer").textContent="Preparing…";
  render();
  try {
    await clearRunRecords();
    await syncQuestionBank();
    const plannedStart=Date.now()+delay*1000;
    quiz.status=delay>0?"starting":"live";
    quiz.startAt=plannedStart;
    quiz.startedAt=Timestamp.fromMillis(plannedStart);
    quiz.lead=0;
    quiz.sec=seconds;
    quiz.count=questions.length;
    quiz.currentIndex=0;
    quiz.questionStartedAt=delay>0?plannedStart:Date.now();
    if(delay===0) await markQuestionStarted(0);
    await persist();
    render();

    if(delay>0){
      $("liveStatus").textContent="⏳ Player Portal पर countdown चल रहा है…";
      const tick=async()=>{
        const remaining=Math.max(0,Math.ceil((Number(quiz.startAt)-Date.now())/1000));
        playAdminTimerTick(remaining, "start");
        $("adminTimer").textContent=remaining+" sec";
        $("liveStatus").textContent=remaining>0
          ?"⏳ Quiz "+remaining+" सेकंड में शुरू होगा — Player Portal पर भी countdown चल रहा है"
          :"🚀 Quiz शुरू हो रहा है…";
        if(Date.now()>=Number(quiz.startAt)){
          clearInterval(countdownTimer);countdownTimer=null;
          quiz.status="live";
          quiz.startedAt=Timestamp.fromMillis(Number(quiz.startAt));
          await markQuestionStarted(0);
          quiz.questionStartedAt=Date.now();
          await persist();
          render();
          $("liveStatus").textContent="🟢 QUIZ LIVE — प्रश्न 1 / "+questions.length;
          runQuestionTimer();
        }
      };
      countdownTimer=setInterval(()=>{tick().catch(e=>showStartError(e))},200);
      await tick();
    } else {
      $("liveStatus").textContent="🟢 QUIZ LIVE — प्रश्न 1 / "+questions.length;
      $("adminTimer").textContent=seconds+" sec";
      runQuestionTimer();
    }
  } catch(e) {
    showStartError(e);
  }
}
function showStartError(e){
  console.error("Quiz start failed",e);
  stopTimers();
  quiz.status="waiting";
  persist().catch(console.error);
  $("liveStatus").textContent="❌ Quiz start नहीं हुआ: "+(e.message||"Firebase sync error");
  $("quizStatus").textContent="Firebase sync error: "+(e.message||"Rules/connection जाँचें");
  $("adminTimer").textContent="—";
}
function runQuestionTimer(){
  if(autoTimer)clearInterval(autoTimer);
  autoTimer=setInterval(async()=>{
    if(quiz.status!=="live"){clearInterval(autoTimer);autoTimer=null;return}
    if(advancingQuestion)return;
    const duration=Number(quiz.settings?.questionSeconds||10)*1000;
    const remaining=Math.max(0,Math.ceil((duration-(Date.now()-Number(quiz.questionStartedAt||0)))/1000));
    playAdminTimerTick(remaining, "question");
    if(Date.now()-Number(quiz.questionStartedAt||0)>=duration){
      if(current<questions.length-1){
        await advanceQuestion(current+1);
      }else{
        clearInterval(autoTimer);autoTimer=null;
        $("end").click();
      }
    }else {
      // Avoid rebuilding the whole question bank on every 250ms timer tick.
      const remainingMs=Math.max(0,duration-(Date.now()-Number(quiz.questionStartedAt||0)));
      const timerEl=$("adminTimer");
      if(timerEl){
        const value=(remainingMs/1000).toFixed(1)+" sec";
        if(timerEl.textContent!==value)timerEl.textContent=value;
      }
    }
  },250);
}
async function advanceQuestion(nextIndex){
  if(advancingQuestion||quiz.status!=="live"||nextIndex<=current||nextIndex>=questions.length)return false;
  advancingQuestion=true;
  const previous={current,questionStartedAt:quiz.questionStartedAt};
  try{
    // Publish the next question first so a timing-marker permission issue can never
    // freeze the exam at 0 seconds. Keep the server marker as a separate best-effort write.
    current=nextIndex;
    quiz.currentIndex=nextIndex;
    quiz.questionStartedAt=Date.now();
    await persist();
    render();
    try{
      await markQuestionStarted(nextIndex);
    }catch(timingError){
      console.error("Server timing marker unavailable for question "+nextIndex,timingError);
      const status=$("liveStatus");
      if(status)status.textContent="🟢 प्रश्न आगे बढ़ गया है। समय के सटीक रिकॉर्ड के लिए Firebase Rules जाँचें।";
    }
    return true;
  }catch(error){
    current=previous.current;
    quiz.currentIndex=previous.current;
    quiz.questionStartedAt=previous.questionStartedAt;
    console.error("Question advance failed; timer will retry:",error);
    const status=$("liveStatus");
    if(status)status.textContent="⚠️ अगला प्रश्न sync हो रहा है; कृपया कुछ क्षण रुकें…";
    return false;
  }finally{
    advancingQuestion=false;
  }
}
// When a throttled background tab becomes visible again, reconcile immediately
// instead of waiting for the next throttled interval callback.
document.addEventListener("visibilitychange",()=>{
  if(document.hidden||quiz.status!=="live"||advancingQuestion)return;
  const duration=Number(quiz.settings?.questionSeconds||10)*1000;
  if(Date.now()-Number(quiz.questionStartedAt||0)>=duration){
    if(current<questions.length-1) void advanceQuestion(current+1);
    else $("end")?.click();
  }else{
    const remainingMs=Math.max(0,duration-(Date.now()-Number(quiz.questionStartedAt||0)));
    const timerEl=$("adminTimer");
    if(timerEl)timerEl.textContent=(remainingMs/1000).toFixed(1)+" sec";
  }
});
function openLiveScreen(){if(!quiz.id){alert("पहले Quiz Code generate करके Save Quiz करें।");return null}try{sessionStorage.setItem("ncAdminReviewReturn","1")}catch(e){}location.href="index.html?host=1&code="+encodeURIComponent(quiz.id);return null}
$("openLiveScreen").onclick=()=>openLiveScreen();
$("start").onclick=async()=>{const sec=Number($("questionSeconds").value),limit=Number($("questionLimit").value),delay=Number($("startDelay").value);if(!quiz.id){alert("पहले Quiz Code generate करके Save Quiz करें।");return}if(!Number.isFinite(sec)||sec<5||sec>600){alert("हर प्रश्न का समय 5 से 600 सेकंड के बीच रखें।");return}if(!Number.isInteger(limit)||limit<1){alert("Question limit कम से कम 1 होना चाहिए।");return}lastStartError="";await restoreRemoteQuestionBank();watchPlayers();if(!bankQuestions.length){alert("Question Bank खाली है। JSON से प्रश्न import करें या प्रश्न जोड़ें।");return}stopTimers();quiz.status="waiting";quiz.endAt=0;quiz.settings={...(quiz.settings||{}),questionSeconds:sec,questionLimit:limit,startDelay:delay};const questionBank=[...bankQuestions];const selectedQuestions=shuffle(questionBank).slice(0,Math.min(limit,questionBank.length));if(selectedQuestions.length<limit){alert("ध्यान दें: आपने "+limit+" प्रश्न चुने हैं, लेकिन अभी उपलब्ध Question Bank में केवल "+selectedQuestions.length+" प्रश्न मिले। प्रश्न सूची के ऊपर कुल संख्या जाँचें और जरूरत हो तो पूरा JSON फिर से Import करें।");}questions=selectedQuestions;current=0;players=read().players||[];$("liveStatus").textContent="Question Bank: "+bankQuestions.length+" • इस Quiz में चुने गए: "+questions.length;render();await beginLive();if(!lastStartError)alert(delay>0?"Questions sync होने के बाद "+delay+" सेकंड का countdown Admin और Player दोनों पर चलेगा।":"Questions sync होने के बाद Quiz शुरू होगा।");};
$("next").onclick=async()=>{if(quiz.status!=="live")return;if(current<questions.length-1){await advanceQuestion(current+1)}else $("end").click()};
$("end").onclick=async()=>{stopTimers();allowExplicitCompletion=true;quiz.status="completed";quiz.endAt=Date.now();await persist();render();$("liveStatus").textContent="Quiz समाप्त हो गया है। Results तैयार हो रहे हैं…";await loadResults()};
async function loadResults(){
  const code=String(quiz.id||"").trim().toUpperCase();
  if(!code)return;
  const status=$("resultsStatus"),board=$("resultsBoard"),detail=$("resultDetail");
  if(status)status.textContent="Results Firebase से लोड हो रहे हैं…";
  if(board)board.innerHTML="";
  if(detail)detail.innerHTML="";
  try{
    const [playerSnap,answerSnap,keySnap,questionSnap,timingSnap]=await Promise.all([
      getDocs(collection(db,"quizzes",code,"players")),
      getDocs(collection(db,"quizzes",code,"answers")),
      getDocs(collection(db,"quizzes",code,"keys")),
      getDocs(collection(db,"quizzes",code,"questions")),
      getDocs(collection(db,"quizzes",code,"questionTiming"))
    ]);
    const playerRows=playerSnap.docs.map(d=>({uid:d.id,...d.data()}));
    const timingStarts=new Map(timingSnap.docs.map(d=>{
      const data=d.data();
      const stamp=data.startedAt&&typeof data.startedAt.toMillis==="function"?data.startedAt.toMillis():0;
      return [d.id,data.runId===quiz.runId?stamp:0];
    }));
    // Both are server-generated timestamps. Quantize to centiseconds (1/100 sec = 10 ms).
    const answers=answerSnap.docs.map(d=>{
      const data=d.data();
      const start=timingStarts.get(String(data.q))||0;
      const received=data.at&&typeof data.at.toMillis==="function"?data.at.toMillis():0;
      const measured=start>0&&received>0
        ?Math.floor(Math.max(0,received-start)/10)*10
        :Math.floor(Math.max(0,Number(data.elapsedMs||0))/10)*10;
      return {id:d.id,...data,serverElapsedMs:measured};
    });
    const keys=new Map(keySnap.docs.map(d=>[d.id,Number(d.data().correctIndex)]));
    const qs=new Map(questionSnap.docs.map(d=>[d.id,d.data()]));
    const total=Number(quiz.count||questions.length||questionSnap.size);
    const rows=playerRows.map(p=>{
      const mine=answers.filter(a=>a.uid===p.uid);
      const correct=mine.filter(a=>keys.get(String(a.q))===Number(a.sel)).length;
      const elapsed=mine.reduce((sum,a)=>sum+Math.max(0,Number(a.serverElapsedMs||0)),0);
      const completed=mine.length>=total;
      const totalSolveMs=elapsed;
      return {...p,mine,correct,answered:mine.length,elapsed,totalSolveMs,completed};
    }).sort((a,b)=>b.correct-a.correct||(a.completed!==b.completed?(a.completed?-1:1):a.totalSolveMs-b.totalSolveMs)||String(a.name||"").localeCompare(String(b.name||"")));
    if(quiz.status==="completed"){
      const points=Number(quiz.settings?.pointsPerCorrect||10);
      for(let offset=0;offset<rows.length;offset+=400){
        const batch=writeBatch(db);
        rows.slice(offset,offset+400).forEach(p=>batch.set(doc(db,"quizzes",code,"results",p.uid),{
          uid:p.uid,name:p.name||"",email:p.email||"",photoURL:p.photoURL||"",
          score:p.correct*points,correct:p.correct,answered:p.answered,totalQuestions:total,
          totalSolveMs:p.totalSolveMs,totalSolveCentiseconds:Math.floor(p.totalSolveMs/10),completed:p.completed,quizCode:code,updatedAt:serverTimestamp()
        },{merge:true}));
        await batch.commit();
      }
    }
    if(status)status.textContent="कुल प्रतिभागी: "+rows.length+" • उत्तर जमा करने वाले: "+answers.length+" • कुल प्रश्न: "+total+" • "+(quiz.status==="completed"?"Scores Firebase में save हो गए।":"Scores submitted answers से calculate हुए।");
    if(board)board.innerHTML=rows.length?rows.map((p,i)=>'<li class="result-row"><button type="button" class="result-name" data-result-uid="'+escapeHtml(p.uid)+'">#'+(i+1)+' '+escapeHtml(p.name||"नाम नहीं")+'</button> <small>'+escapeHtml(p.email||"")+'</small> — Score: <b>'+(p.correct*Number(quiz.settings?.pointsPerCorrect||10))+'</b> • सही: <b>'+p.correct+'</b>/'+total+' • जवाब: '+p.answered+'/'+total+' • समय: '+formatPrecise(p.totalSolveMs)+(p.completed?' • पूरा किया':' • अधूरा')+'</li>').join(""):"कोई प्रतिभागी नहीं मिला।";
    board?.querySelectorAll("[data-result-uid]").forEach(btn=>btn.onclick=()=>{
      const p=rows.find(x=>x.uid===btn.dataset.resultUid);
      if(!p||!detail)return;
      detail.innerHTML='<h3>'+escapeHtml(p.name||"Player")+' — उत्तर विवरण</h3><p>Email: '+escapeHtml(p.email||"—")+'</p><p>Score: '+(p.correct*Number(quiz.settings?.pointsPerCorrect||10))+' • सही उत्तर: '+p.correct+'/'+total+' • जमा किए: '+p.answered+'/'+total+' • कुल समय: '+formatPrecise(p.totalSolveMs)+'</p><ol>'+Array.from({length:total},(_,i)=>{
        const a=p.mine.find(x=>Number(x.q)===i),q=qs.get(String(i)),correct=keys.get(String(i));
        const selected=a?Number(a.sel):-1;
        const at=a&&a.at&&typeof a.at.toDate==="function"?a.at.toDate().toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"medium"}):"जवाब नहीं दिया";
        const spent=a?formatPrecise(Number(a.serverElapsedMs||0)):"—";
        const chosen=a?(q?.options?.[selected]??("Option "+String.fromCharCode(65+selected))):"उत्तर नहीं दिया";
        const right=q?.options?.[correct]??(correct===undefined?"—":"Option "+String.fromCharCode(65+correct));
        return '<li><b>Q'+(i+1)+':</b> '+escapeHtml(q?.question||"प्रश्न उपलब्ध नहीं")+'<br>चुना गया: '+escapeHtml(chosen)+'<br>सही उत्तर: '+escapeHtml(right)+'<br>परिणाम: '+(a?(selected===correct?'✅ सही':'❌ गलत'):'—')+'<br>जवाब जमा समय: '+escapeHtml(at)+'<br>इस प्रश्न पर समय: '+escapeHtml(spent)+'</li>';
      }).join("")+'</ol>';
      detail.scrollIntoView({behavior:"smooth",block:"start"});
    });
  }catch(e){
    console.error("Results load failed",e);
    if(status)status.textContent="Results नहीं लोड हुए: "+(e.message||"Firebase Rules जाँचें");
  }
}
function formatPrecise(ms){return (Math.max(0,Number(ms)||0)/1000).toFixed(2)+" sec"}
if($("refreshResults"))$("refreshResults").onclick=loadResults;

const s=read();if(s.quiz){quiz={...quiz,...s.quiz,settings:{questionSeconds:10,questionLimit:100,startDelay:0,...(s.quiz.settings||{})}};const savedBanks=[s.questionBank,s.questions,s.quiz.questions].filter(Array.isArray);bankQuestions=savedBanks.sort((a,b)=>b.length-a.length)[0]||[];questions=bankQuestions;players=s.players||[];$("quizCode").value=quiz.id||"";$("quizName").value=quiz.name||"";current=s.quiz.currentIndex||0;$("questionSeconds").value=quiz.settings.questionSeconds;$("questionLimit").value=quiz.settings.questionLimit;$("startDelay").value=String(quiz.settings.startDelay||0)}
render();
restoreRemoteQuestionBank().catch(e=>console.warn("Startup question-bank recovery failed",e));
function updateLiveOnly(){const s=read();if(s.quiz?.id===quiz.id){players=s.players||[];if(s.quiz.status==="live"&&s.quiz.runId!==quiz.runId){const incoming=Array.isArray(s.quiz.questions)?s.quiz.questions:[];if(incoming.length>=questions.length||!questions.length){quiz={...quiz,...s.quiz};questions=incoming;current=s.quiz.currentIndex||0}else{console.warn("Ignored stale/short live snapshot",incoming.length,"vs current",questions.length)}} if(lastStartError){$("liveStatus").textContent="❌ "+lastStartError;$("quizStatus").textContent="Start Error: "+lastStartError;}else $("liveStatus").textContent=quiz.status==="live"?"🟢 QUIZ LIVE — शुरू हो चुका है • प्रश्न "+Math.min(current+1,questions.length)+" / "+questions.length+" • चलने का समय "+formatElapsed(Date.now()-Number(quiz.startAt||Date.now())):quiz.status==="starting"?"⏳ Quiz "+Math.max(0,Math.ceil((Number(quiz.startAt||0)-Date.now())/1000))+" सेकंड में शुरू होगा…":quiz.status==="completed"?"Quiz समाप्त हो गया है।":"Quiz अभी शुरू नहीं हुआ है।";const secs=Number(quiz.settings?.questionSeconds||10),started=Number(quiz.questionStartedAt||0);$("adminTimer").textContent=quiz.status==="live"?Math.max(0,secs-Math.floor((Date.now()-started)/1000))+" sec":"—";$("participants").textContent=players.length;renderPlayersIfChanged()}}
let defaultBrandingForAdmin = null;
let quizNameTouched = false;
$("quizName")?.addEventListener("input", () => { quizNameTouched = true; });
listenForDefaultBranding((branding, error) => {
  defaultBrandingForAdmin = branding;
  if (!quiz.id && !quizNameTouched && $("quizName") && branding?.text?.defaultQuizName) {
    $("quizName").value = branding.text.defaultQuizName;
  }
  if (error) console.warn("Default branding load unavailable; keeping current Quiz Name:", error);
});
setInterval(()=>{updateLiveOnly();if(quiz.status==="live"){$("liveStatus").textContent="🟢 QUIZ LIVE — शुरू हो चुका है • प्रश्न "+Math.min(current+1,questions.length)+" / "+questions.length+" • चलने का समय "+formatElapsed(Date.now()-Number(quiz.startAt||Date.now()));}},500);



/* Registration-page public settings. */
const registrationSettingsForm = $("registrationSettingsForm");
const registrationSettingsStatus = $("registrationSettingsStatus");
const registrationTitleInput = $("registrationTitleInput");
const registrationFeeInput = $("registrationFeeInput");
const registrationUpiInput = $("registrationUpiInput");
const registrationEmailInput = $("registrationEmailInput");
const registrationSettingsRef = doc(db, "siteSettings", "registrationConfig");
function showRegistrationSettingsStatus(message, error = false) {
  if (!registrationSettingsStatus) return;
  registrationSettingsStatus.textContent = message;
  registrationSettingsStatus.className = "notice" + (error ? " error" : " success");
}
onSnapshot(registrationSettingsRef, snapshot => {
  const data = snapshot.exists() ? snapshot.data() : {};
  if (registrationTitleInput && !registrationTitleInput.dataset.edited) registrationTitleInput.value = String(data.title || "Saraswati Puja Quiz 2027");
  if (registrationFeeInput && !registrationFeeInput.dataset.edited) registrationFeeInput.value = data.feeInr ? String(data.feeInr) : "";
  if (registrationUpiInput && !registrationUpiInput.dataset.edited) registrationUpiInput.value = String(data.upiId || "");
  if (registrationEmailInput && !registrationEmailInput.dataset.edited) registrationEmailInput.value = String(data.adminEmail || "netajiswt@gmail.com");
  showRegistrationSettingsStatus(snapshot.exists() ? "Saved registration settings load ho gayi." : "Abhi settings save nahi hui hain. Name, fee aur UPI ID bhar kar Save karein.");
}, error => {
  console.error("Registration settings load failed:", error);
  showRegistrationSettingsStatus("Settings load nahi hui: " + (error.message || "Firestore Rules check karein."), true);
});
for (const field of [registrationTitleInput, registrationFeeInput, registrationUpiInput, registrationEmailInput]) {
  field?.addEventListener("input", () => { field.dataset.edited = "true"; });
}
registrationSettingsForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const title = String(registrationTitleInput?.value || "").trim();
  const feeInr = Number(registrationFeeInput?.value);
  const upiId = String(registrationUpiInput?.value || "").trim();
  const adminEmail = String(registrationEmailInput?.value || "").trim().toLowerCase();
  if (!title || title.length > 120 || !Number.isFinite(feeInr) || feeInr <= 0 || !upiId || !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(upiId) || !adminEmail.includes("@") || !adminEmail.includes(".")) {
    showRegistrationSettingsStatus("Quiz/contest name, valid fee, UPI ID aur registration email enter karein.", true);
    return;
  }
  const button = $("saveRegistrationSettings");
  if (button) button.disabled = true;
  try {
    await setDoc(registrationSettingsRef, { title, feeInr, upiId, adminEmail, updatedAt: serverTimestamp(), updatedBy: String(auth.currentUser?.email || "") }, { merge: true });
    for (const field of [registrationTitleInput, registrationFeeInput, registrationUpiInput]) if (field) delete field.dataset.edited;
    showRegistrationSettingsStatus("✅ Registration settings save ho gayi. Public registration page par auto-update hogi.");
  } catch (error) {
    console.error("Registration settings save failed:", error);
    showRegistrationSettingsStatus("Save nahi hua: " + (error.message || "Firestore Rules publish karein aur Admin login check karein."), true);
  } finally { if (button) button.disabled = false; }
});

/* Root-admin Google email approvals. Firestore Rules enforce root-only writes. */
const ROOT_ADMIN_EMAIL = "rohit.fcg123@gmail.com";
const approvalSection = $("adminApprovalSection");
const approvalForm = $("adminApprovalForm");
const approvalEmailInput = $("adminApprovalEmail");
const approvalStatus = $("adminApprovalStatus");
const approvalList = $("approvedAdminList");
const approveButton = $("adminApproveButton");

function approvalMessage(message, isError = false) {
  if (!approvalStatus) return;
  approvalStatus.textContent = message;
  approvalStatus.className = "notice" + (isError ? " error" : " success");
}
async function loadApprovedAdmins() {
  if (!approvalList) return;
  approvalList.replaceChildren();
  try {
    const snapshot = await getDocs(collection(db, "approvedAdminEmails"));
    const entries = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.id.toLowerCase() !== ROOT_ADMIN_EMAIL)
      .sort((a,b) => a.id.localeCompare(b.id));
    if (!entries.length) {
      const li = document.createElement("li");
      li.textContent = "Abhi koi additional Admin email approved nahi hai.";
      approvalList.appendChild(li);
    }
    for (const entry of entries) {
      const li = document.createElement("li");
      li.style.cssText = "display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid #eadbb5";
      const label = document.createElement("span");
      label.textContent = entry.id + (entry.active === true ? " — Approved" : " — Disabled");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = entry.active === true ? "Revoke Access" : "Approve Again";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          if (entry.active === true) {
            await setDoc(doc(db, "approvedAdminEmails", entry.id), {
              email: entry.id, active: false, approvedAt: serverTimestamp(), approvedBy: ROOT_ADMIN_EMAIL
            }, { merge: true });
          } else {
            await setDoc(doc(db, "approvedAdminEmails", entry.id), {
              email: entry.id, active: true, approvedAt: serverTimestamp(), approvedBy: ROOT_ADMIN_EMAIL
            }, { merge: true });
          }
          approvalMessage("Admin approval list update ho gayi.");
          await loadApprovedAdmins();
        } catch (error) {
          console.error("Admin approval update failed:", error);
          approvalMessage("Update fail: " + (error?.message || String(error)) + " Firestore Rules publish hui hain?", true);
        } finally { button.disabled = false; }
      });
      li.append(label, button);
      approvalList.appendChild(li);
    }
    approvalMessage("Approved email list Firebase se load ho gayi.");
  } catch (error) {
    console.error("Could not load approved admins:", error);
    approvalMessage("List load nahi hui: " + (error?.message || String(error)) + " Firestore Rules publish karni hongi.", true);
  }
}
approvalForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const email = String(approvalEmailInput?.value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    approvalMessage("Valid Google email address enter karein.", true);
    return;
  }
  if (email === ROOT_ADMIN_EMAIL) {
    approvalMessage("Root Admin ko alag se approve karne ki zarurat nahi hai.", true);
    return;
  }
  if (approveButton) approveButton.disabled = true;
  try {
    await setDoc(doc(db, "approvedAdminEmails", email), {
      email, active: true, approvedAt: serverTimestamp(), approvedBy: ROOT_ADMIN_EMAIL
    }, { merge: true });
    approvalEmailInput.value = "";
    approvalMessage(email + " ko Admin access approve ho gaya.");
    await loadApprovedAdmins();
  } catch (error) {
    console.error("Admin email approval failed:", error);
    approvalMessage("Approval save nahi hua: " + (error?.message || String(error)) + " Firestore Rules publish hui hain?", true);
  } finally { if (approveButton) approveButton.disabled = false; }
});
$("refreshAdminApprovals")?.addEventListener("click", loadApprovedAdmins);
onAuthStateChanged(auth, user => {
  const isRoot = String(user?.email || "").trim().toLowerCase() === ROOT_ADMIN_EMAIL;
  if (approvalSection) approvalSection.hidden = !isRoot;
  if (isRoot) void loadApprovedAdmins();
});
