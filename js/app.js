const $=id=>document.getElementById(id),KEY="netajiQuizLiveState";
const params=new URLSearchParams(location.search),hostMode=params.get("host")==="1",requestedCode=(params.get("code")||"").trim().toUpperCase();
let player=null,lastToken="",score=0;
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch{return {}}};
function notice(t){$("notice").textContent=t}
function clearOptions(){$("options").innerHTML=""}
function showWaiting(text="Admin के Quiz शुरू करने का इंतज़ार है"){
  lastToken="";
  $("status").textContent="Waiting";
  $("timer").textContent="—";
  $("question").textContent=text;
  clearOptions();
  $("feedback").textContent="";
}
function showQuestion(s){
  const quiz=s.quiz||{};
  if(hostMode&&requestedCode&&(!quiz.id||String(quiz.id).toUpperCase()!==requestedCode)){
    showWaiting("Quiz शुरू होने का इंतज़ार है…");
    return;
  }
  if(quiz.status==="starting"){
    lastToken="";
    $("status").textContent="Starting";
    $("question").textContent="क्विज़ शुरू होने वाला है…";
    clearOptions();
    $("timer").textContent=Math.max(0,Math.ceil((Number(quiz.startAt||0)-Date.now())/1000));
    $("feedback").textContent="";
    return;
  }
  if(quiz.status==="completed"){
    lastToken="";
    $("status").textContent="Completed";
    $("question").textContent="Quiz समाप्त हो गया।";
    clearOptions();
    $("timer").textContent="—";
    $("feedback").textContent="";
    return;
  }
  const q=quiz.questions?.[quiz.currentIndex];
  if(quiz.status!=="live"||!q){
    showWaiting();
    return;
  }
  const token=(quiz.runId||"")+":"+quiz.currentIndex;
  if(token!==lastToken){
    lastToken=token;
    $("question").textContent=q.question;
    $("status").textContent="LIVE";
    $("feedback").textContent="";
    clearOptions();
    q.options.forEach((o,i)=>{
      const b=document.createElement("button");
      b.type="button";
      b.textContent=String.fromCharCode(65+i)+". "+o;
      if(!hostMode){
        b.onclick=()=>{
          if(b.dataset.answered)return;
          [...$("options").children].forEach(x=>x.disabled=true);
          b.dataset.answered="1";
          const correct=i===q.correctIndex;
          if(correct){score+=Number(quiz.settings?.pointsPerCorrect||10);$("score").textContent=score}
          $("feedback").textContent=correct?"सही जवाब!":"गलत जवाब।";
          const state=read();
          state.players=state.players||[];
          const p=state.players.find(x=>x.id===player?.id);
          if(p){
            p.score=score;
            p.answers=p.answers||[];
            p.answers.push({questionIndex:quiz.currentIndex,correct,selectedIndex:i});
            localStorage.setItem(KEY,JSON.stringify(state));
          }
        };
      }
      $("options").appendChild(b);
    });
  }
  $("status").textContent="LIVE";
  const sec=Number(quiz.settings?.questionSeconds||10);
  $("timer").textContent=Math.max(0,sec-Math.floor((Date.now()-Number(quiz.questionStartedAt||Date.now()))/1000));
}
if(hostMode){
  document.body.classList.add("host-mode");
  document.querySelector(".hero")?.classList.add("hidden");
  $("game").classList.remove("hidden");
  $("status").textContent="Waiting";
  $("question").textContent="Quiz शुरू होने का इंतज़ार है…";
  $("score")?.closest("p")?.classList.add("hidden");
  $("feedback").classList.add("hidden");
  showQuestion(read());
}
$("joinForm").addEventListener("submit",e=>{
  e.preventDefault();
  const code=$("quizCode").value.trim().toUpperCase(),name=$("playerName").value.trim(),s=read();
  if(!s.quiz||String(s.quiz.id).toUpperCase()!==code){notice("Quiz Code नहीं मिला। Admin से सही code लें।");return}
  if(s.quiz.status==="completed"){notice("यह क्विज़ समाप्त हो चुका है।");return}
  player={id:crypto.randomUUID(),name,score:0,answers:[]};
  s.players=s.players||[];
  s.players.push({...player,status:"Connected"});
  localStorage.setItem(KEY,JSON.stringify(s));
  $("game").classList.remove("hidden");
  notice(name+", आप क्विज़ में शामिल हैं।");
  $("joinForm").querySelector("button").disabled=true;
  showQuestion(s);
});
setInterval(()=>{
  const s=read();
  if(hostMode){showQuestion(s);return}
  if(player)showQuestion(s);
},250);
