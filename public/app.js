// Configure the public Supabase URL and anon/publishable key in config.js.
const cfg = window.APP_CONFIG || {};
const hasBackend = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
const sb = hasBackend ? window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey) : null;
const $ = id => document.getElementById(id);
const screens = ["home","quiz","parent","finish"];
let attemptId=null, nickname="", accessCode="", questions=[], currentIndex=0, score=0, answered=new Set(), dashboardTimer=null;
const moduleNames={1:"Infográficos",2:"Relato pessoal",3:"Substantivos e verbos",4:"Artigos",5:"Adjetivos e locuções",6:"Numerais",7:"Pronomes",8:"Coesão e revisão"};
function show(id){screens.forEach(s=>$(s).classList.toggle("hidden",s!==id));}
function note(msg){$("configNote").textContent=msg;}
async function api(action,payload={}) {
  if(!sb) throw new Error("O aplicativo ainda não está conectado ao Supabase. O responsável precisa concluir a configuração do serviço.");
  const {data,error}=await sb.functions.invoke("quiz-api",{body:{action,...payload}});
  if(error) throw error;
  if(data?.error) throw new Error(data.error);
  return data;
}
function letter(i){return "ABCD"[i]}
function renderQuestion(){
  if(currentIndex>=questions.length){finish();return}
  const q=questions[currentIndex];
  $("moduleLabel").textContent=`MÓDULO ${q.module} • ${moduleNames[q.module]}`;
  $("studentGreeting").textContent=`Vamos lá, ${nickname}!`;
  $("scoreBox").textContent=`${score} pontos`;
  $("progressText").textContent=`Questão ${answered.size+1} de 100`;
  $("progressBar").style.width=`${answered.size/100*100}%`;
  $("difficulty").textContent=q.difficulty;
  $("questionNumber").textContent=`QUESTÃO ${q.id}`;
  $("prompt").textContent=q.prompt;
  $("feedback").className="feedback hidden"; $("feedback").textContent="";
  $("nextBtn").classList.add("hidden");
  $("options").innerHTML="";
  q.options.forEach((opt,i)=>{
    const b=document.createElement("button");b.className="option";b.type="button";
    const tag=document.createElement("span");tag.className="letter";tag.textContent=letter(i);
    const label=document.createElement("span");label.textContent=opt;
    b.append(tag,label);b.onclick=()=>answer(i,b);$("options").appendChild(b);
  });
}
async function answer(choice,button){
  [...$("options").children].forEach(b=>b.disabled=true);
  const q=questions[currentIndex];
  try{
    const result=await api("answer",{attempt_id:attemptId,question_id:q.id,choice});
    answered.add(q.id);
    if(result.correct){score++;button.classList.add("correct");$("feedback").className="feedback good";$("feedback").innerHTML="<strong>✓ Muito bem!</strong> Você acertou!";}
    else{button.classList.add("wrong");$("feedback").className="feedback bad";$("feedback").innerHTML=`<strong>Quase lá!</strong> A resposta correta é ${letter(result.correct_index)}. ${escapeHtml(result.explanation)}`;}
    if(result.correct){$("feedback").innerHTML+=`<br>${escapeHtml(result.explanation)}`;}
    $("scoreBox").textContent=`${score} pontos`;
    $("progressText").textContent=`Questão ${answered.size} de 100 respondidas`;
    $("progressBar").style.width=`${answered.size/100*100}%`;
    $("nextBtn").classList.remove("hidden");
  }catch(e){alert(e.message||"Não foi possível registrar a resposta.");[...$("options").children].forEach(b=>b.disabled=false);}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function start(){
  nickname=$("nickname").value.trim();accessCode=$("studentCode").value.trim();
  if(!nickname||!accessCode){alert("Preencha seu apelido e o código da prova.");return}
  try{
    const data=await api("start",{nickname,access_code:accessCode});
    attemptId=data.attempt_id;answered=new Set(data.answered_ids||[]);
    questions=(data.questions||[]).filter(q=>!answered.has(q.id));
    currentIndex=0;score=data.score||0;
    if(questions.length===0){await finish();return;}
    renderQuestion();show("quiz");
  }catch(e){alert(e.message||"Não foi possível iniciar.");}
}
async function finish(){
  $("finalScore").textContent=`${score}/100`;$("finalPercent").textContent=`${Math.round(score/100*100)}%`;
  $("finalMessage").textContent=score>=90?"Excelente trabalho! Você dominou muito bem o conteúdo.":score>=70?"Muito bom! Revise os assuntos em que teve mais dificuldade.":"Você concluiu o desafio. Revise as explicações e tente novamente para melhorar!";
  $("progressBar").style.width="100%";show("finish");
  if(attemptId){try{await api("finish",{attempt_id:attemptId});}catch(e){console.warn("Não foi possível finalizar a tentativa:",e);}}
}
async function loadParent(){
  const pin=$("parentPin").value.trim();if(!pin){alert("Informe o PIN do responsável.");return}
  try{await refreshParent(pin);show("parent");if(dashboardTimer)clearInterval(dashboardTimer);dashboardTimer=setInterval(()=>refreshParent(pin).catch(e=>console.warn("Falha na atualização do painel:",e)),3000);}
  catch(e){alert(e.message||"Não foi possível abrir o painel.");}
}
async function refreshParent(pin=$("parentPin").value.trim()){
  const d=await api("dashboard",{parent_pin:pin});
  $("parentStatus").textContent=d.nickname?`Aluno: ${d.nickname} • Atualização automática a cada 3 segundos`:"Aguardando o aluno iniciar a prova.";
  $("answeredCount").textContent=d.answered;$("correctCount").textContent=d.correct;$("percentCount").textContent=`${d.percent}%`;
  $("moduleStats").innerHTML="";
  Object.entries(d.modules||{}).forEach(([n,v])=>{
    const row=document.createElement("div");row.className="moduleRow";
    row.innerHTML=`<span>${n}. ${moduleNames[n]}</span><div class="bar"><i style="width:${v.total?100*v.correct/v.total:0}%"></i></div><strong>${v.correct}/${v.total}</strong>`;$("moduleStats").appendChild(row);
  });
  $("answerRows").innerHTML="";
  (d.answers||[]).slice().reverse().forEach(a=>{
    const tr=document.createElement("tr");
    const cells=[a.question_id,moduleNames[a.module],letter(a.choice),a.correct?"Acertou":"Errou",new Date(a.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})];
    cells.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.appendChild(td);});
    $("answerRows").appendChild(tr);
  });
}
$("startBtn").onclick=start;$("parentBtn").onclick=loadParent;
$("nextBtn").onclick=()=>{currentIndex++;renderQuestion()};
$("backHomeBtn").onclick=()=>show("home");$("parentHomeBtn").onclick=()=>{if(dashboardTimer)clearInterval(dashboardTimer);dashboardTimer=null;show("home")};
$("refreshBtn").onclick=()=>refreshParent().catch(e=>alert(e.message||"Não foi possível atualizar."));
$("finishHomeBtn").onclick=()=>show("home");
if(!hasBackend)note("Prévia não conectada: o site está publicado, mas as provas e o painel só funcionarão depois que o responsável configurar o Supabase.");
else note("Serviço de exercícios configurado.");
if(new URLSearchParams(window.location.search).get("mode")==="parent"){
  $("parentPin").focus();
  $("parentPin").scrollIntoView({behavior:"smooth",block:"center"});
}
