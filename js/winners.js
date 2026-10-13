import { auth, db } from "./firebase.js";
import { BRANDING_DEFAULTS, normalizeBranding, resolveBranding, applyBranding, listenForDefaultBranding } from "./branding.js?v=20261013-branding-2";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id);
const KEY="netajiQuizLiveState";
let activeRows=[];
let globalBranding=normalizeBranding(BRANDING_DEFAULTS);
let activeQuizBranding=null;
function refreshBranding(){applyBranding(resolveBranding(globalBranding,activeQuizBranding));}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function readLocal(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch{return {}}}
function duration(ms){ms=Math.max(0,Number(ms)||0);const s=ms/1000;return s>=60?Math.floor(s/60)+"m "+(s%60).toFixed(1)+"s":s.toFixed(1)+"s"}
function avatar(p){const url=p.photoURL||p.photoUrl||p.photo||"";return url?'<img src="'+esc(url)+'" alt="'+esc(p.name||"Winner")+'" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.textContent=\''+esc((p.name||"?").trim().charAt(0).toUpperCase())+'\'">':esc((p.name||"?").trim().charAt(0).toUpperCase())}
let celebrationAudioContext=null;
function playCelebrationSound(){
 try{
  const AudioCtor=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtor)return;
  if(!celebrationAudioContext)celebrationAudioContext=new AudioCtor();
  const ctx=celebrationAudioContext;
  const begin=()=>scheduleCelebrationAudio(ctx);
  if(ctx.state==="suspended")ctx.resume().then(begin).catch(error=>console.debug("Celebration audio blocked:",error));
  else begin();
 }catch(error){console.debug("Celebration audio unavailable:",error)}
}
function scheduleCelebrationAudio(ctx){
 const now=ctx.currentTime,duration=3.2,sampleRate=ctx.sampleRate;
 // A soft, layered crowd roar, synthesized locally so no external audio file is required.
 const length=Math.ceil(sampleRate*duration),buffer=ctx.createBuffer(1,length,sampleRate),data=buffer.getChannelData(0);
 for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(.55+Math.random()*.45);
 const crowdSource=ctx.createBufferSource();crowdSource.buffer=buffer;
 const crowdBand=ctx.createBiquadFilter();crowdBand.type="bandpass";crowdBand.frequency.value=850;crowdBand.Q.value=.65;
 const crowdLow=ctx.createBiquadFilter();crowdLow.type="lowpass";crowdLow.frequency.value=1900;
 const crowdGain=ctx.createGain();crowdGain.gain.setValueAtTime(.0001,now);crowdGain.gain.linearRampToValueAtTime(.11,now+.28);crowdGain.gain.setValueAtTime(.095,now+2.25);crowdGain.gain.exponentialRampToValueAtTime(.0001,now+duration);
 crowdSource.connect(crowdBand);crowdBand.connect(crowdLow);crowdLow.connect(crowdGain);crowdGain.connect(ctx.destination);crowdSource.start(now);crowdSource.stop(now+duration);
 // A few warm, distant cheering tones make the crowd layer feel less like plain noise.
 [390,520,660].forEach((frequency,index)=>{const osc=ctx.createOscillator(),gain=ctx.createGain(),lfo=ctx.createOscillator(),lfoGain=ctx.createGain();osc.type="sine";osc.frequency.value=frequency;lfo.type="sine";lfo.frequency.value=.7+index*.23;lfoGain.gain.value=frequency*.025;lfo.connect(lfoGain);lfoGain.connect(osc.frequency);gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(.012,now+.45);gain.gain.setValueAtTime(.01,now+2.2);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(gain);gain.connect(ctx.destination);lfo.start(now);osc.start(now);osc.stop(now+duration);lfo.stop(now+duration)});
 // Rapid, irregular noise bursts create the clapping/applause layer.
 for(let i=0;i<42;i++){
  const at=now+.08+Math.random()*2.45,clapBuffer=ctx.createBuffer(1,Math.ceil(sampleRate*.095),sampleRate),samples=clapBuffer.getChannelData(0);
  for(let j=0;j<samples.length;j++)samples[j]=(Math.random()*2-1)*(1-j/samples.length);
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=clapBuffer;filter.type="highpass";filter.frequency.value=900+Math.random()*1300;
  const volume=.025+Math.random()*.075;gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(volume,at+.003);gain.gain.exponentialRampToValueAtTime(.0001,at+.085);
  source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);source.start(at);source.stop(at+.095);
 }
}
function replayWinnerAnimation(){
 document.querySelectorAll(".w-winner").forEach(el=>{el.style.animation="none";void el.offsetWidth;el.style.animation="";});
 const hero=document.querySelector(".w-hero");
 if(hero){hero.style.animation="none";void hero.offsetWidth;hero.style.animation="";}
}
function confetti(){for(let i=0;i<90;i++){const el=document.createElement("i");el.className="w-confetti";el.style.left=Math.random()*100+"vw";el.style.setProperty("--drift",(Math.random()*220-110)+"px");el.style.animationDuration=(3+Math.random()*4)+"s";el.style.animationDelay=(Math.random()*1.5)+"s";el.style.background=["#ffd15c","#fff0b2","#df7eaa","#8ed9f2","#f48a52","#ffffff"][i%6];document.body.appendChild(el);setTimeout(()=>el.remove(),9000)}}
function showMessage(t){$("wMessage").textContent=t}
function showRows(rows,total){const podium=$("wPodiums");if(!rows.length){podium.innerHTML='<div class="w-empty">अभी कोई result नहीं मिला। Quiz समाप्त होने और answers sync होने के बाद Refresh करें।</div>'; $("wRows").innerHTML='<tr><td colspan="6">अभी कोई result उपलब्ध नहीं।</td></tr>';return}
 const order=[rows[1],rows[0],rows[2]].filter(Boolean),classes=["second","first","third"],medals=["🥈","🥇","🥉"],heights=["second","first","third"];
 podium.innerHTML=order.map((p,i)=>{const rank=p.rank,cls=rank===1?"first":rank===2?"second":"third",medal=rank===1?"🥇":rank===2?"🥈":"🥉";return '<article class="w-winner '+cls+'"><div class="w-avatar" aria-label="Participant photo">'+avatar(p)+'</div><div class="w-medal">'+medal+'</div><div class="w-name">'+esc(p.name||"Participant")+'</div><div class="w-score">'+p.correct+'/'+total+' correct · '+p.score+' pts</div><div class="w-plinth">'+rank+'</div></article>'}).join("");
 $("wRows").innerHTML=rows.map(p=>'<tr class="'+(p.rank<=3?'top-three':'')+'"><td class="w-rank">#'+p.rank+(p.rank===1?' 🥇':p.rank===2?' 🥈':p.rank===3?' 🥉':'')+'</td><td>'+esc(p.name||"Participant")+(p.email?'<br><small>'+esc(p.email)+'</small>':'')+'</td><td>'+p.score+'</td><td>'+p.correct+'</td><td>'+p.answered+'/'+total+'</td><td>'+duration(p.totalMs)+'</td></tr>').join("");
 $("wSummary").textContent="Participants: "+rows.length+" · Total questions: "+total+" · Ranking: correct answers first, then fastest total answer time.";
 confetti();
}
async function loadResults(){
 $("wRefresh").disabled=true;showMessage("Results load हो रहे हैं…");
 try{
  const local=readLocal(),code=String(new URLSearchParams(location.search).get("code")||local.quiz?.id||"").trim().toUpperCase();
  if(!code)throw new Error("Quiz Code नहीं मिला। पहले Admin Dashboard में Quiz Code save करें।");
  const qref=doc(db,"quizzes",code),quizSnap=await getDoc(qref);
  if(!quizSnap.exists())throw new Error("Firebase में Quiz "+code+" नहीं मिला।");
  const quiz=quizSnap.data();
  activeQuizBranding=quiz.settings?.branding||null;
  refreshBranding();
  const [playerSnap,answerSnap,keySnap,questionSnap,resultSnap]=await Promise.all([
   getDocs(collection(db,"quizzes",code,"players")),getDocs(collection(db,"quizzes",code,"answers")),getDocs(collection(db,"quizzes",code,"keys")),getDocs(collection(db,"quizzes",code,"questions")),getDocs(collection(db,"quizzes",code,"results"))
  ]);
  const players=playerSnap.docs.map(d=>({uid:d.id,...d.data()})),answers=answerSnap.docs.map(d=>d.data());
  const keys=new Map(keySnap.docs.map(d=>[String(d.id),Number(d.data().correctIndex)]));
  const savedResults=new Map(resultSnap.docs.map(d=>[d.id,d.data()]));
  const total=Math.max(1,Number(quiz.count||questionSnap.size||local.questions?.length||0));
  const rows=players.map(p=>{
    const mine=answers.filter(a=>a.uid===p.uid);
    const saved=savedResults.get(p.uid);
    const correct=saved?Number(saved.correct||0):mine.filter(a=>keys.get(String(a.q))===Number(a.sel)).length;
    const answered=saved?Number(saved.answered||0):mine.length;
    const totalMs=saved?Number(saved.totalSolveMs||0):mine.reduce((s,a)=>s+Math.max(0,Number(a.elapsedMs||0)),0);
    const completed=saved?Boolean(saved.completed):mine.length>=total;
    const score=saved?Number(saved.score||0):correct*Number(quiz.settings?.pointsPerCorrect||10);
    return {...p,correct,answered,totalMs,completed,score};
  }).sort((a,b)=>b.correct-a.correct||(a.completed!==b.completed?(a.completed?-1:1):a.totalMs-b.totalMs)||String(a.name||"").localeCompare(String(b.name||""))).map((p,i)=>({...p,rank:i+1}));
  activeRows=rows;$("wQuizStatus").textContent=(quiz.name||"Quiz")+" · "+code+" · "+(quiz.status==="completed"?"Quiz completed":"Current results");
  showRows(rows,total);showMessage("Results verified from Firebase. Admin-only view.");
 }catch(e){console.error(e);$("wPodiums").innerHTML='<div class="w-empty">⚠️ '+esc(e.message||"Results load नहीं हुए")+'</div>';$("wRows").innerHTML='<tr><td colspan="6">Results load नहीं हुए।</td></tr>';showMessage(e.message||"Firebase Rules और Quiz Code जाँचें।")}
 finally{$("wRefresh").disabled=false}
}
async function verify(user){const email=String(user?.email||"").trim().toLowerCase();if(email==="rohit.fcg123@gmail.com")return;const s=await getDoc(doc(db,"approvedAdminEmails",email));if(!email||!s.exists()||s.data()?.active!==true||String(s.data()?.email||"").trim().toLowerCase()!==email){const e=new Error("इस Google account को Admin permission नहीं मिली। Root Admin से approval जाँचें।");e.code="admin/not-authorized";throw e;}}
onAuthStateChanged(auth,async user=>{
 if(!user){showMessage("Admin login आवश्यक है। Admin Login पर वापस जा रहे हैं…");location.replace("admin.html");return;}
 try{
  await verify(user);
  await loadResults();
 }catch(e){
  console.error("Winners admin verification failed:",e);
  if(e?.code==="admin/not-authorized"){
   showMessage(e.message);
   try{await signOut(auth)}catch(signOutError){console.error("Unauthorized session cleanup failed:",signOutError);}
   setTimeout(()=>location.replace("admin.html"),1500);
  }else{
   // A network/Firestore error is not proof that the account is unauthorized.
   // Keep Firebase session intact; rules still protect all results data.
   showMessage("Admin session मौजूद है, लेकिन permission अभी verify नहीं हो सकी। Internet/Firestore Rules जाँचकर Refresh Results करें। Session logout नहीं किया गया। विवरण: "+(e?.message||"Unknown error"));
  }
 }
});
listenForDefaultBranding((branding,error)=>{globalBranding=branding;refreshBranding();if(error)console.warn("Default branding sync unavailable:",error)});
$("wRefresh").addEventListener("click",loadResults);$("wCelebrate").addEventListener("click",()=>{playCelebrationSound();confetti();replayWinnerAnimation();document.querySelector(".w-hero").animate([{transform:"scale(.98)",opacity:.75},{transform:"scale(1)",opacity:1}],{duration:650,easing:"ease-out"});document.querySelector(".w-stage").scrollIntoView({behavior:"smooth",block:"center"})});
