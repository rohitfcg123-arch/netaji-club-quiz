import { db } from "./firebase.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const hostMode=params.get("host")==="1";
const requestedCode=(params.get("code")||"").trim().toUpperCase();
let activeCode="", playerName="", lastToken="", quizState=null, unsubQuiz=null, unsubQuestion=null, score=0, answered=false;
function notice(t){$("notice").textContent=t}
function clearOptions(){$("options").innerHTML=""}
function waiting(text="Admin के Quiz शुरू करने का इंतज़ार है"){$("status").textContent="Waiting";$("timer").textContent="—";$("question").textContent=text;clearOptions();$("feedback").textContent=""}
function showGame(){ $("game").classList.remove("hidden"); if(!hostMode) $("joinForm").querySelector("button").disabled=true; }
function startListening(code){
  activeCode=String(code).toUpperCase();
  if(unsubQuiz)unsubQuiz();
  unsubQuiz=onSnapshot(doc(db,"quizzes",activeCode),snap=>{
    if(!snap.exists()){waiting("इस Quiz Code का Quiz नहीं मिला।");return}
    quizState=snap.data();
    if(quizState.status==="completed"){
      $("status").textContent="Completed";$("question").textContent="Quiz समाप्त हो गया।";$("timer").textContent="—";clearOptions();return;
    }
    if(quizState.status==="starting"){
      $("status").textContent="Starting";$("question").textContent="क्विज़ शुरू होने वाला है…";clearOptions();
      $("timer").textContent=Math.max(0,Math.ceil((Number(quizState.startAt||0)-Date.now())/1000));return;
    }
    if(quizState.status!=="live"){waiting("Admin के Quiz शुरू करने का इंतज़ार है");return}
    const idx=Number(quizState.currentIndex||0);
    if(unsubQuestion){unsubQuestion();unsubQuestion=null}
    const token=(quizState.runId||"")+":"+idx;
    if(token===lastToken){updateTimer();return}
    lastToken=token;answered=false;
    unsubQuestion=onSnapshot(doc(db,"quizzes",activeCode,"questions",String(idx)),qSnap=>{
      if(!qSnap.exists()){waiting("प्रश्न लोड हो रहा है…");return}
      const q=qSnap.data();
      $("status").textContent="LIVE";$("question").textContent=q.question||"";
      $("feedback").textContent="";clearOptions();
      (q.options||[]).forEach((o,i)=>{
        const b=document.createElement("button");b.type="button";b.textContent=String.fromCharCode(65+i)+". "+o;
        if(!hostMode)b.onclick=()=>{
          if(answered)return;answered=true;
          [...$("options").children].forEach(x=>x.disabled=true);
          $("feedback").textContent="आपका जवाब चुन लिया गया है।";
        };
        $("options").appendChild(b);
      });
      updateTimer();
    },e=>{console.error("Question listener:",e);waiting("Question access error: Firebase Rules जाँचें।")});
  },e=>{console.error("Quiz listener:",e);waiting("Firebase sync error: "+(e.message||"Rules/Internet जाँचें"))});
}
function updateTimer(){
 if(!quizState)return;
 if(quizState.status==="starting"){$("timer").textContent=Math.max(0,Math.ceil((Number(quizState.startAt||0)-Date.now())/1000));return}
 if(quizState.status==="live"){
  const sec=Number(quizState.settings?.questionSeconds||10);
  $("timer").textContent=Math.max(0,sec-Math.floor((Date.now()-Number(quizState.questionStartedAt||Date.now()))/1000));
 }
}
if(hostMode){
 document.body.classList.add("host-mode");document.querySelector(".hero")?.classList.add("hidden");$("game").classList.remove("hidden");
 $("score")?.closest("p")?.classList.add("hidden");$("feedback").classList.add("hidden");
 if(requestedCode)startListening(requestedCode);else waiting("Quiz Code नहीं मिला।");
}else{
 $("joinForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const code=$("quizCode").value.trim().toUpperCase();playerName=$("playerName").value.trim();
  if(!code||!playerName){notice("Quiz Code और नाम भरें।");return}
  notice("Firebase से Quiz जाँचा जा रहा है…");
  try{
   const snap=await getDoc(doc(db,"quizzes",code));
   if(!snap.exists()){notice("Quiz Code नहीं मिला। Admin से सही code लें।");return}
   const q=snap.data();
   if(q.status==="completed"){notice("यह क्विज़ समाप्त हो चुका है।");return}
   showGame();notice(playerName+", आप Quiz से जुड़ गए हैं।");startListening(code);
  }catch(err){console.error(err);notice("Firebase से जुड़ नहीं पाए: "+(err.message||"Rules/Internet जाँचें"))}
 });
}
setInterval(updateTimer,250);
