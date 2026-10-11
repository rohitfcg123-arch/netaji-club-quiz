import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id);
const KEY="netajiQuizLiveState";
let activeRows=[];
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function readLocal(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch{return {}}}
function duration(ms){ms=Math.max(0,Number(ms)||0);const s=ms/1000;return s>=60?Math.floor(s/60)+"m "+(s%60).toFixed(1)+"s":s.toFixed(1)+"s"}
function avatar(p){const url=p.photoURL||p.photoUrl||p.photo||"";return url?'<img src="'+esc(url)+'" alt="'+esc(p.name||"Winner")+'" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.textContent=\''+esc((p.name||"?").trim().charAt(0).toUpperCase())+'\'">':esc((p.name||"?").trim().charAt(0).toUpperCase())}
function confetti(){for(let i=0;i<90;i++){const el=document.createElement("i");el.className="w-confetti";el.style.left=Math.random()*100+"vw";el.style.setProperty("--drift",(Math.random()*220-110)+"px");el.style.animationDuration=(3+Math.random()*4)+"s";el.style.animationDelay=(Math.random()*1.5)+"s";el.style.background=["#ffd15c","#fff0b2","#df7eaa","#8ed9f2","#f48a52","#ffffff"][i%6];document.body.appendChild(el);setTimeout(()=>el.remove(),9000)}}
function showMessage(t){$("wMessage").textContent=t}
function showRows(rows,total){const podium=$("wPodiums");if(!rows.length){podium.innerHTML='<div class="w-empty">अभी कोई result नहीं मिला। Quiz समाप्त होने और answers sync होने के बाद Refresh करें।</div>'; $("wRows").innerHTML='<tr><td colspan="6">अभी कोई result उपलब्ध नहीं।</td></tr>';return}
 const order=[rows[1],rows[0],rows[2]].filter(Boolean),classes=["second","first","third"],medals=["🥈","🥇","🥉"],heights=["second","first","third"];
 podium.innerHTML=order.map((p,i)=>{const rank=p.rank,cls=rank===1?"first":rank===2?"second":"third",medal=rank===1?"🥇":rank===2?"🥈":"🥉";return '<article class="w-winner '+cls+'"><div class="w-avatar" aria-label="Participant photo">'+avatar(p)+'</div><div class="w-medal">'+medal+'</div><div class="w-name">'+esc(p.name||"Participant")+'</div><div class="w-score">'+p.correct+'/'+total+' correct · '+p.score+' pts</div><div class="w-plinth">'+rank+'</div></article>'}).join("");
 $("wRows").innerHTML=rows.map(p=>'<tr class="'+(p.rank<=3?'top-three':'')+'"><td class="w-rank">#'+p.rank+(p.rank===1?' 🥇':p.rank===2?' 🥈':p.rank===3?' 🥉':'')+'</td><td>'+esc(p.name||"Participant")+'</td><td>'+p.score+'</td><td>'+p.correct+'</td><td>'+p.answered+'/'+total+'</td><td>'+duration(p.totalMs)+'</td></tr>').join("");
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
  const [playerSnap,answerSnap,keySnap,questionSnap]=await Promise.all([
   getDocs(collection(db,"quizzes",code,"players")),getDocs(collection(db,"quizzes",code,"answers")),getDocs(collection(db,"quizzes",code,"keys")),getDocs(collection(db,"quizzes",code,"questions"))
  ]);
  const players=playerSnap.docs.map(d=>({uid:d.id,...d.data()})),answers=answerSnap.docs.map(d=>d.data());
  const keys=new Map(keySnap.docs.map(d=>[String(d.id),Number(d.data().correctIndex)]));
  const total=Math.max(1,Number(quiz.count||questionSnap.size||local.questions?.length||0));
  const rows=players.map(p=>{const mine=answers.filter(a=>a.uid===p.uid);const correct=mine.filter(a=>keys.get(String(a.q))===Number(a.sel)).length;const totalMs=mine.reduce((s,a)=>s+Math.max(0,Number(a.elapsedMs||0)),0);return {...p,correct,answered:mine.length,totalMs,score:correct*Number(quiz.settings?.pointsPerCorrect||10)}}).sort((a,b)=>b.correct-a.correct||a.totalMs-b.totalMs||String(a.name||"").localeCompare(String(b.name||""))).map((p,i)=>({...p,rank:i+1}));
  activeRows=rows;$("wQuizStatus").textContent=(quiz.name||"Quiz")+" · "+code+" · "+(quiz.status==="completed"?"Quiz completed":"Current results");
  showRows(rows,total);showMessage("Results verified from Firebase. Admin-only view.");
 }catch(e){console.error(e);$("wPodiums").innerHTML='<div class="w-empty">⚠️ '+esc(e.message||"Results load नहीं हुए")+'</div>';$("wRows").innerHTML='<tr><td colspan="6">Results load नहीं हुए।</td></tr>';showMessage(e.message||"Firebase Rules और Quiz Code जाँचें।")}
 finally{$("wRefresh").disabled=false}
}
async function verify(user){const s=await getDoc(doc(db,"admins",user.uid));if(!s.exists()||s.data()?.active!==true)throw new Error("इस account को Admin permission नहीं मिली।");}
onAuthStateChanged(auth,async user=>{if(!user){showMessage("Admin login आवश्यक है। Redirecting…");location.replace("admin.html");return}try{await verify(user);await loadResults()}catch(e){showMessage(e.message||"Admin verification failed.");try{await signOut(auth)}catch{}setTimeout(()=>location.replace("admin.html"),1200)}});
$("wRefresh").addEventListener("click",loadResults);$("wCelebrate").addEventListener("click",()=>{confetti();document.querySelector(".w-hero").animate([{transform:"scale(.98)",opacity:.75},{transform:"scale(1)",opacity:1}],{duration:650,easing:"ease-out"});document.querySelector(".w-stage").scrollIntoView({behavior:"smooth",block:"center"})});
