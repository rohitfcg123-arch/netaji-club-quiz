import { db } from "./firebase.js";
import { collection, deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, setDoc, Timestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id),KEY="netajiQuizLiveState";
let questions=[],bankQuestions=[],current=0,quiz={id:"",name:"Saraswati Puja Quiz",status:"waiting",settings:{pointsPerCorrect:10,questionSeconds:10,questionLimit:100,startDelay:0},questions:[]},players=[],autoTimer=null,countdownTimer=null;
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch{return {}}};
let syncChain=Promise.resolve();
function persist(){
  const s=read();s.quiz={...quiz,questions,currentIndex:current};s.questions=bankQuestions;s.questionBank=bankQuestions;s.players=players;
  try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){console.warn("Local cache unavailable",e)}
  if(!quiz.id)return Promise.resolve();
  const code=String(quiz.id).trim().toUpperCase();
  const quizDoc={id:code,name:quiz.name||"Quiz",status:quiz.status||"waiting",settings:quiz.settings||{questionSeconds:10,questionLimit:100,startDelay:0},currentIndex:current,runId:quiz.runId||"",startAt:Number(quiz.startAt||0),questionStartedAt:Number(quiz.questionStartedAt||0),endAt:Number(quiz.endAt||0),startedAt:quiz.startedAt instanceof Timestamp?quiz.startedAt:(quiz.startAt?Timestamp.fromMillis(Number(quiz.startAt)):null),lead:Number(quiz.settings?.startDelay||0),sec:Number(quiz.settings?.questionSeconds||10),count:questions.length,updatedAt:serverTimestamp()};
  syncChain=syncChain.then(()=>setDoc(doc(db,"quizzes",code),quizDoc,{merge:true}));
  syncChain.catch(e=>{console.error("Firestore quiz sync failed",e);const el=$("quizStatus");if(el)el.textContent="Firebase sync error: "+(e.message||"Rules/connection जाँचें")});
  return syncChain;
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
    batch.set(doc(db,"quizzes",code,"questions",String(i)),{question:q.question,options:q.options,category:q.category||"Uncategorized"});
    batch.set(doc(db,"quizzes",code,"keys",String(i)),{correctIndex:Number(q.correctIndex)||0});
  }
  // Preserve question-bank documents outside the selected run limit.
  $("liveStatus").textContent="⏳ "+questions.length+" questions Firebase पर एक साथ sync हो रहे हैं…";
  await batch.commit();
}
function save(){persist();render()}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function escapeHtml(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function currentCategory(){const custom=$("customImportCategory")?.value.trim();return custom||$("importCategory")?.value||"Uncategorized"}
function selectedSingleCategory(){return $("customSingleCategory")?.value.trim()||$("singleCategory")?.value||"Uncategorized"}
function visibleQuestionIndexes(){const filter=$("categoryFilter").value;return bankQuestions.map((q,i)=>({q,i})).filter(x=>filter==="__all"||(x.q.category||"Uncategorized")===filter).map(x=>x.i)}
function refreshCategoryFilter(){const select=$("categoryFilter"),previous=select.value;const cats=[...new Set(bankQuestions.map(q=>q.category||"Uncategorized"))].sort((a,b)=>a.localeCompare(b));const signature="__all|"+bankQuestions.length+"|"+cats.map(c=>c+":"+bankQuestions.filter(q=>(q.category||"Uncategorized")===c).length).join("|");if(select.dataset.signature===signature)return;select.dataset.signature=signature;select.innerHTML="<option value='__all'>All Categories ("+bankQuestions.length+")</option>"+cats.map(c=>"<option value='"+escapeHtml(c)+"'>"+escapeHtml(c)+" ("+bankQuestions.filter(q=>(q.category||"Uncategorized")===c).length+")</option>").join("");select.value=cats.includes(previous)?previous:"__all"}
function formatElapsed(ms){const t=Math.max(0,Math.floor(ms/1000));return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0")}
function render(){
 refreshCategoryFilter();
 const visible=visibleQuestionIndexes();
 $("count").textContent=bankQuestions.length+" questions total • "+visible.length+" shown";
 $("questions").innerHTML=visible.map(i=>{const q=bankQuestions[i];return "<li class='question-item'><label class='question-select'><input type='checkbox' class='question-checkbox' data-select='"+i+"'><span><b>["+escapeHtml(q.category||"Uncategorized")+"]</b> Q"+(i+1)+". "+escapeHtml(q.question)+"</span></label><button type='button' data-del='"+i+"' class='danger small-button'>Delete</button></li>"}).join("");
 $("quizStatus").textContent="Quiz Code: "+(quiz.id||"generate a code")+" • "+quiz.status;
 $("liveStatus").textContent=quiz.status==="live"?"🟢 QUIZ LIVE — शुरू हो चुका है • प्रश्न "+Math.min(current+1,questions.length)+" / "+questions.length+" • चलने का समय "+formatElapsed(Date.now()-Number(quiz.startAt||Date.now())):quiz.status==="starting"?"⏳ Quiz "+Math.max(0,Math.ceil((Number(quiz.startAt||0)-Date.now())/1000))+" सेकंड में शुरू होगा…":quiz.status==="completed"?"Quiz समाप्त हो गया है।":"Quiz अभी शुरू नहीं हुआ है।";
 $("preview").textContent=questions[current]?.question||"Question preview";
 $("questionProgress").textContent=questions.length?Math.min(current+1,questions.length)+" / "+questions.length:"0 / 0";
 const secs=Number(quiz.settings?.questionSeconds||10),started=Number(quiz.questionStartedAt||0);
 $("adminTimer").textContent=quiz.status==="live"?(Math.max(0,secs*1000-(Date.now()-started))/1000).toFixed(1)+" sec":"—";
 $("participants").textContent=players.length;
 $("players").innerHTML=players.map(p=>"<li>"+escapeHtml(p.name)+" — "+(p.score||0)+" points</li>").join("");
 $("questions").querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.del);if(i<0||i>=questions.length)return;if(!confirm("यह प्रश्न हटाना है?"))return;bankQuestions.splice(i,1);questions=bankQuestions;$("deleteStatus").textContent="एक प्रश्न हटा दिया गया।";save()});
 $("questions").querySelectorAll(".question-checkbox").forEach(box=>box.onchange=()=>{const n=$("questions").querySelectorAll(".question-checkbox:checked").length;$("deleteStatus").textContent=n?n+" प्रश्न चुने गए हैं।":"कोई प्रश्न चुना नहीं गया।";updateSelectionButton()});
 $("selectAllQuestions").disabled=!visible.length;
 $("bulkDeleteQuestions").disabled=!visible.length;
 updateSelectionButton();
}
function updateSelectionButton(){const boxes=[...$("questions").querySelectorAll(".question-checkbox")];const all=boxes.length>0&&boxes.every(b=>b.checked);$("selectAllQuestions").textContent=all?"Unselect all":"Select all visible"}
function publish(){persist();render()}
function parseQuestions(data){const list=Array.isArray(data)?data:(data&&Array.isArray(data.questions)?data.questions:null);if(!list)throw new Error('JSON में questions नाम की array नहीं मिली।');const fallback=currentCategory();return list.map((item,i)=>{const question=String(item.q??item.question??item.text??'').trim();let opts=item.options??item.choices;if(!Array.isArray(opts)&&item.options&&typeof item.options==='object')opts=Object.values(item.options);if(!Array.isArray(opts)&&['A','B','C','D'].every(k=>item[k]!==undefined))opts=[item.A,item.B,item.C,item.D];if(!question)throw new Error('Question '+(i+1)+': q/question खाली है।');if(!Array.isArray(opts)||opts.length!==4||opts.some(x=>String(x).trim()===''))throw new Error('Question '+(i+1)+': चार options जरूरी हैं।');const raw=item.correctIndex??item.answerIndex??item.correctOptionIndex??item.correctAnswer??item.answer??item.correct;let idx=-1;if(Number.isInteger(raw))idx=raw;else if(typeof raw==='string'){const x=raw.trim();if(/^[0-3]$/.test(x))idx=Number(x);else if(/^[A-D]$/i.test(x))idx=x.toUpperCase().charCodeAt(0)-65;else if(/^option\s*[A-D]$/i.test(x))idx=x.slice(-1).toUpperCase().charCodeAt(0)-65;else if(/^option\s*[1-4]$/i.test(x))idx=Number(x.slice(-1))-1;else{const found=opts.findIndex(o=>String(o).trim()===x);if(found>=0)idx=found}}if(idx<0||idx>3)throw new Error('Question '+(i+1)+': answer A/B/C/D या 0/1/2/3 होना चाहिए।');const category=String(item.category??item.categoryName??item.batch??item.tag??fallback).trim()||fallback;return{question,options:opts.map(x=>String(x).trim()),correctIndex:idx,category}})}
async function importJson(){const status=$("importStatus"),button=$("importJson");try{status.textContent="JSON पढ़ा जा रहा है…";button.disabled=true;let raw=$("jsonText").value.trim();const input=$("jsonFile"),file=input.files&&input.files[0];if(file)raw=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("फ़ाइल पढ़ी नहीं जा सकी।"));reader.readAsText(file)});if(!raw)throw new Error("पहले JSON file चुनें या JSON text paste करें।");let data;try{data=JSON.parse(raw)}catch(e){throw new Error("JSON format गलत है: "+e.message)}const parsed=parseQuestions(data);if(!parsed.length)throw new Error("फ़ाइल में कोई question नहीं मिला।");bankQuestions.push(...parsed);questions=bankQuestions;save();status.textContent="✅ "+parsed.length+" प्रश्न import हुए। कुल प्रश्न: "+bankQuestions.length+"।";$("jsonText").value="";input.value=""}catch(e){console.error(e);status.textContent="❌ Import नहीं हुआ: "+(e.message||String(e))}finally{button.disabled=false}}
$("categoryFilter").addEventListener("change",()=>{$("deleteStatus").textContent="Category: "+$("categoryFilter").selectedOptions[0].textContent;render()});
$("selectAllQuestions").onclick=()=>{const boxes=[...$("questions").querySelectorAll(".question-checkbox")];const all=boxes.length>0&&boxes.every(b=>b.checked);boxes.forEach(b=>b.checked=!all);$("deleteStatus").textContent=all?"चयन हटाया गया।":boxes.length+" visible प्रश्न चुने गए।";updateSelectionButton()};
$("bulkDeleteQuestions").onclick=()=>{const selected=[...$("questions").querySelectorAll(".question-checkbox:checked")].map(b=>Number(b.dataset.select)).filter(Number.isInteger).sort((a,b)=>b-a);if(!selected.length){$("deleteStatus").textContent="पहले हटाने के लिए प्रश्न चुनें।";return}if(!confirm("क्या आप "+selected.length+" चुने हुए प्रश्न स्थायी रूप से हटाना चाहते हैं?"))return;selected.forEach(i=>{if(i>=0&&i<bankQuestions.length)bankQuestions.splice(i,1)});questions=bankQuestions;$("deleteStatus").textContent=selected.length+" प्रश्न हटा दिए गए।";save()};

$("importJson").addEventListener("click",importJson);
$("jsonFile").addEventListener("change",e=>{const file=e.target.files&&e.target.files[0];if(file)$("importStatus").textContent="फ़ाइल चुनी गई: "+file.name+" ("+Math.round(file.size/1024)+" KB)। अब Import JSON Questions दबाएँ।"});
$("downloadSample").onclick=()=>{const sample={exam:"Sample Quiz",questions:[{q:"भारत की राजधानी क्या है?",options:["दिल्ली","मुंबई","कोलकाता","चेन्नई"],answer:"A"}]};const a=document.createElement("a"),url=URL.createObjectURL(new Blob([JSON.stringify(sample,null,2)],{type:"application/json"}));a.href=url;a.download="netaji-quiz-sample.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$("generate").onclick=()=>{$("quizCode").value="NC"+Math.random().toString(36).slice(2,8).toUpperCase()};
$("quizForm").onsubmit=e=>{e.preventDefault();const newCode=$("quizCode").value.trim().toUpperCase();if(!newCode){alert("Quiz Code generate करें।");return}const codeChanged=newCode!==quiz.id;quiz.id=newCode;quiz.name=$("quizName").value.trim();quiz.status="waiting";quiz.startAt=0;quiz.startedAt=null;quiz.questionStartedAt=0;quiz.endAt=0;quiz.runId=crypto.randomUUID();current=0;stopTimers();save();persist();$("liveStatus").textContent="Quiz तैयार है। Start Quiz दबाकर शुरू करें।";alert("Quiz saved. Code: "+quiz.id+" — Status reset to waiting.")};
$("questionForm").onsubmit=e=>{e.preventDefault();bankQuestions.push({question:$("qText").value.trim(),options:[$("a").value.trim(),$("b").value.trim(),$("c").value.trim(),$("d").value.trim()],correctIndex:+$("correct").value,category:selectedSingleCategory()});questions=bankQuestions;e.target.reset();save()};
function stopTimers(){if(autoTimer)clearInterval(autoTimer);if(countdownTimer)clearInterval(countdownTimer);autoTimer=countdownTimer=null}
async function beginLive(){
  stopTimers();
  if(!quiz.id) throw new Error("पहले Quiz Code generate करके Save Quiz करें।");
  if(!questions.length) throw new Error("पहले JSON से questions import करें।");
  const delay=Math.max(0,Number(quiz.settings?.startDelay||0));
  const seconds=Math.max(5,Number(quiz.settings?.questionSeconds||10));
  quiz.status="waiting";
  quiz.settings={...(quiz.settings||{}),questionSeconds:seconds};
  quiz.count=questions.length;
  current=0;
  quiz.runId=crypto.randomUUID();
  $("liveStatus").textContent="⏳ पहले "+questions.length+" questions Firebase पर sync हो रहे हैं…";
  $("adminTimer").textContent="Preparing…";
  render();
  try {
    await syncQuestionBank();
    const plannedStart=Date.now()+delay*1000;
    quiz.status=delay>0?"starting":"live";
    quiz.startAt=plannedStart;
    quiz.startedAt=Timestamp.fromMillis(plannedStart);
    quiz.lead=0;
    quiz.sec=seconds;
    quiz.count=questions.length;
    quiz.currentIndex=0;
    quiz.questionStartedAt=plannedStart;
    await persist();
    render();

    if(delay>0){
      $("liveStatus").textContent="⏳ Player Portal पर countdown चल रहा है…";
      const tick=async()=>{
        const remaining=Math.max(0,Math.ceil((Number(quiz.startAt)-Date.now())/1000));
        $("adminTimer").textContent=remaining+" sec";
        $("liveStatus").textContent=remaining>0
          ?"⏳ Quiz "+remaining+" सेकंड में शुरू होगा — Player Portal पर भी countdown चल रहा है"
          :"🚀 Quiz शुरू हो रहा है…";
        if(Date.now()>=Number(quiz.startAt)){
          clearInterval(countdownTimer);countdownTimer=null;
          quiz.status="live";
          quiz.startedAt=Timestamp.fromMillis(Number(quiz.startAt));
          quiz.questionStartedAt=Number(quiz.startAt);
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
  autoTimer=setInterval(()=>{
    if(quiz.status!=="live"){clearInterval(autoTimer);autoTimer=null;return}
    const duration=Number(quiz.settings?.questionSeconds||10)*1000;
    if(Date.now()-Number(quiz.questionStartedAt||0)>=duration){
      if(current<questions.length-1){
        current++;
        quiz.currentIndex=current;
        quiz.questionStartedAt=Date.now();
        persist().then(render).catch(showStartError);
      }else{
        clearInterval(autoTimer);autoTimer=null;
        $("end").click();
      }
    }else render();
  },250);
}
function openLiveScreen(){if(!quiz.id){alert("पहले Quiz Code generate करके Save Quiz करें।");return null}const tab=window.open("index.html?host=1&code="+encodeURIComponent(quiz.id),"_blank");if(!tab){$("liveStatus").textContent="Live screen popup block हो गया। Open Live Screen बटन दबाएँ या browser में popups allow करें।"}return tab}
$("openLiveScreen").onclick=()=>openLiveScreen();
$("start").onclick=()=>{const sec=Number($("questionSeconds").value),limit=Number($("questionLimit").value),delay=Number($("startDelay").value);if(!quiz.id){alert("पहले Quiz Code generate करके Save Quiz करें।");return}if(!questions.length){alert("पहले JSON से प्रश्न import करें या प्रश्न जोड़ें।");return}if(!Number.isFinite(sec)||sec<5||sec>600){alert("हर प्रश्न का समय 5 से 600 सेकंड के बीच रखें।");return}if(!Number.isInteger(limit)||limit<1){alert("Question limit कम से कम 1 होना चाहिए।");return}stopTimers();quiz.status="waiting";quiz.endAt=0;quiz.settings={...(quiz.settings||{}),questionSeconds:sec,questionLimit:limit,startDelay:delay};const questionBank=[...questions];const selectedQuestions=shuffle(questionBank).slice(0,Math.min(limit,questionBank.length));if(selectedQuestions.length<limit){alert("ध्यान दें: आपने "+limit+" प्रश्न चुने हैं, लेकिन Question Bank में केवल "+selectedQuestions.length+" प्रश्न उपलब्ध हैं। पहले और प्रश्न जोड़ें।");}questions=selectedQuestions;current=0;players=read().players||[];beginLive();alert(delay>0?"Questions sync होने के बाद "+delay+" सेकंड का countdown Admin और Player दोनों पर चलेगा।":"Questions sync होने के बाद Quiz शुरू होगा।")};
$("next").onclick=()=>{if(quiz.status!=="live")return;if(current<questions.length-1){current++;quiz.questionStartedAt=Date.now();publish()}else $("end").click()};
$("end").onclick=async()=>{stopTimers();quiz.status="completed";quiz.endAt=Date.now();await persist();render();$("liveStatus").textContent="Quiz समाप्त हो गया है। Results तैयार हो रहे हैं…";await loadResults()};
async function loadResults(){
  const code=String(quiz.id||"").trim().toUpperCase();
  if(!code)return;
  const status=$("resultsStatus"),board=$("resultsBoard"),detail=$("resultDetail");
  if(status)status.textContent="Results Firebase से लोड हो रहे हैं…";
  if(board)board.innerHTML="";
  if(detail)detail.innerHTML="";
  try{
    const [playerSnap,answerSnap,keySnap,questionSnap]=await Promise.all([
      getDocs(collection(db,"quizzes",code,"players")),
      getDocs(collection(db,"quizzes",code,"answers")),
      getDocs(collection(db,"quizzes",code,"keys")),
      getDocs(collection(db,"quizzes",code,"questions"))
    ]);
    const playerRows=playerSnap.docs.map(d=>({uid:d.id,...d.data()}));
    const answers=answerSnap.docs.map(d=>({id:d.id,...d.data()}));
    const keys=new Map(keySnap.docs.map(d=>[d.id,Number(d.data().correctIndex)]));
    const qs=new Map(questionSnap.docs.map(d=>[d.id,d.data()]));
    const total=Number(quiz.count||questions.length||questionSnap.size);
    const rows=playerRows.map(p=>{
      const mine=answers.filter(a=>a.uid===p.uid);
      const correct=mine.filter(a=>keys.get(String(a.q))===Number(a.sel)).length;
      const elapsed=mine.reduce((sum,a)=>sum+Math.max(0,Number(a.elapsedMs||0)),0);
      const times=mine.map(a=>a.at&&typeof a.at.toMillis==="function"?a.at.toMillis():0).filter(Boolean);
      const completed=mine.length>=total;
      const totalSolveMs=completed&&times.length?Math.max(0,Math.max(...times)-Number(quiz.startAt||0)):elapsed;
      return {...p,mine,correct,answered:mine.length,elapsed,totalSolveMs,completed};
    }).sort((a,b)=>b.correct-a.correct||(a.completed!==b.completed?(a.completed?-1:1):a.totalSolveMs-b.totalSolveMs)||String(a.name||"").localeCompare(String(b.name||"")));
    if(status)status.textContent="कुल प्रतिभागी: "+rows.length+" • उत्तर जमा करने वाले: "+answers.length+" • कुल प्रश्न: "+total;
    if(board)board.innerHTML=rows.length?rows.map((p,i)=>'<li class="result-row"><button type="button" class="result-name" data-result-uid="'+escapeHtml(p.uid)+'">#'+(i+1)+' '+escapeHtml(p.name||"नाम नहीं")+'</button> — सही: <b>'+p.correct+'</b>/'+total+' • जवाब: '+p.answered+'/'+total+' • समय: '+formatPrecise(p.totalSolveMs)+(p.completed?' • पूरा किया':' • अधूरा')+'</li>').join(""):"कोई प्रतिभागी नहीं मिला।";
    board?.querySelectorAll("[data-result-uid]").forEach(btn=>btn.onclick=()=>{
      const p=rows.find(x=>x.uid===btn.dataset.resultUid);
      if(!p||!detail)return;
      detail.innerHTML='<h3>'+escapeHtml(p.name||"Player")+' — उत्तर विवरण</h3><p>सही उत्तर: '+p.correct+'/'+total+' • जमा किए: '+p.answered+'/'+total+' • कुल समय: '+formatPrecise(p.totalSolveMs)+'</p><ol>'+Array.from({length:total},(_,i)=>{
        const a=p.mine.find(x=>Number(x.q)===i),q=qs.get(String(i)),correct=keys.get(String(i));
        const selected=a?Number(a.sel):-1;
        const at=a&&a.at&&typeof a.at.toDate==="function"?a.at.toDate().toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"medium"}):"जवाब नहीं दिया";
        const spent=a?formatPrecise(Number(a.elapsedMs||0)):"—";
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

const s=read();if(s.quiz){quiz={...quiz,...s.quiz,settings:{questionSeconds:10,questionLimit:100,startDelay:0,...(s.quiz.settings||{})}};bankQuestions=s.questionBank||s.questions||s.quiz.questions||[];questions=bankQuestions;players=s.players||[];$("quizCode").value=quiz.id||"";$("quizName").value=quiz.name||"";current=s.quiz.currentIndex||0;$("questionSeconds").value=quiz.settings.questionSeconds;$("questionLimit").value=quiz.settings.questionLimit;$("startDelay").value=String(quiz.settings.startDelay||0)}
render();
function updateLiveOnly(){const s=read();if(s.quiz?.id===quiz.id){players=s.players||[];if(s.quiz.status==="live"&&s.quiz.runId!==quiz.runId){quiz={...quiz,...s.quiz};questions=s.quiz.questions||[];current=s.quiz.currentIndex||0} $("liveStatus").textContent=quiz.status==="live"?"🟢 QUIZ LIVE — शुरू हो चुका है • प्रश्न "+Math.min(current+1,questions.length)+" / "+questions.length+" • चलने का समय "+formatElapsed(Date.now()-Number(quiz.startAt||Date.now())):quiz.status==="starting"?"⏳ Quiz "+Math.max(0,Math.ceil((Number(quiz.startAt||0)-Date.now())/1000))+" सेकंड में शुरू होगा…":quiz.status==="completed"?"Quiz समाप्त हो गया है।":"Quiz अभी शुरू नहीं हुआ है।";const secs=Number(quiz.settings?.questionSeconds||10),started=Number(quiz.questionStartedAt||0);$("adminTimer").textContent=quiz.status==="live"?Math.max(0,secs-Math.floor((Date.now()-started)/1000))+" sec":"—";$("participants").textContent=players.length;$("players").innerHTML=players.map(p=>"<li>"+escapeHtml(p.name)+" — "+(p.score||0)+" points</li>").join("")}}
setInterval(()=>{updateLiveOnly();if(quiz.status==="live"){$("liveStatus").textContent="🟢 QUIZ LIVE — शुरू हो चुका है • प्रश्न "+Math.min(current+1,questions.length)+" / "+questions.length+" • चलने का समय "+formatElapsed(Date.now()-Number(quiz.startAt||Date.now()));}},500);
