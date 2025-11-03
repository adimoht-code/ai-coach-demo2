
let video, overlay, ctx, detector, running=false, preview=false, usingFront=true;
let repCount=0, setCount=1, lastPhase='up'; let accuracyAvg=[];
let restTimer, restSec=60; let currentExercise='squat'; let streamRef=null;

function showTab(name){
  ['home','coach','report','profile'].forEach(id=>{
    document.getElementById(id).classList.toggle('hidden', id!==name);
  });
  document.querySelectorAll('.tab').forEach(el=> el.classList.toggle('active', el.dataset.tab===name));
  document.querySelectorAll('.footer-tabs button').forEach(el=> el.classList.toggle('active', el.dataset.tab===name));
}
document.addEventListener('click',(e)=>{
  const t = e.target.closest('[data-tab]'); if(!t) return;
  showTab(t.dataset.tab);
});

function loadProfile(){ try{return JSON.parse(localStorage.getItem('ai_profile')||'{}')}catch(e){return{}} }
function saveProfile(p){ localStorage.setItem('ai_profile', JSON.stringify(p)); }
function onboardingSave(){
  const p = {
    height: +document.getElementById('height').value || null,
    weight: +document.getElementById('weight').value || null,
    goal: document.getElementById('goal').value,
    weeks: +document.getElementById('weeks').value || 8
  };
  saveProfile(p);
  const el = document.getElementById('saveStatus'); el.style.opacity = 1; setTimeout(()=> el.style.opacity=0, 1200);
}
function applyProfileToForm(){
  const p = loadProfile();
  if(p.height) document.getElementById('height').value = p.height;
  if(p.weight) document.getElementById('weight').value = p.weight;
  if(p.goal) document.getElementById('goal').value = p.goal;
  if(p.weeks) document.getElementById('weeks').value = p.weeks;
}

function buildPlan(){
  const p = loadProfile(); const level = 'intermediate';
  const days = p.goal==='gain'?4 : p.goal==='maintain'?3:3;
  const base = [
    {name:'스쿼트', sets: level==='advanced'?5:4, reps: 8},
    {name:'데드리프트', sets: level==='advanced'?5:4, reps: 6},
    {name:'벤치프레스', sets: level==='advanced'?5:4, reps: 10},
  ];
  if(p.goal==='cut'){ base.push({name:'버피/런지', sets:3, reps:12}); }
  return { title:`${p.weeks||8}주 루틴 (${p.goal||'maintain'})`, exercises: base, days };
}
function renderPlan(plan){
  const wrap = document.getElementById('routineCards'); wrap.innerHTML='';
  plan.exercises.forEach((ex,i)=>{
    const el = document.createElement('div');
    el.className='routine-card';
    el.innerHTML = `<b>${i+1}. ${ex.name}</b><div>세트 ${ex.sets}</div><div>반복 ${ex.reps}</div>`;
    wrap.appendChild(el);
  });
  document.getElementById('routineJson').textContent = JSON.stringify(plan, null, 2);
}

async function ensureDetector(){
  if(detector) return;
  detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
  });
}
async function startCamera(){
  const constraints = { video: { facingMode: usingFront ? 'user' : 'environment' } };
  streamRef = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = streamRef; await video.play();
  overlay.width = video.videoWidth || 360; overlay.height = video.videoHeight || 640;
  ctx = overlay.getContext('2d');
}
function stopCamera(){ if(streamRef){ streamRef.getTracks().forEach(t=>t.stop()); streamRef=null; } }
function drawKeypoints(kps){
  ctx.clearRect(0,0,overlay.width, overlay.height);
  ctx.drawImage(video, 0,0, overlay.width, overlay.height);
  ctx.fillStyle = 'rgba(58,111,247,0.9)';
  kps.forEach(k=>{ if(k.score>0.5){ ctx.beginPath(); ctx.arc(k.x, k.y, 4, 0, Math.PI*2); ctx.fill(); } });
}
function gp(kps, name){ return kps.find(k=>k.name===name) || null; }
function angle(a,b,c){
  const ab={x:a.x-b.x,y:a.y-b.y}, cb={x:c.x-b.x,y:c.y-b.y};
  const dot=ab.x*cb.x+ab.y*cb.y, mag=Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y)||1;
  return Math.acos(Math.min(Math.max(dot/mag,-1),1))*180/Math.PI;
}
function speak(msg){ try{ const u=new SpeechSynthesisUtterance(msg); u.lang='ko-KR'; u.rate=1.0; speechSynthesis.cancel(); speechSynthesis.speak(u);}catch(e){} }
function setFeedback(text, level='ok'){
  const f = document.getElementById('feedback');
  f.textContent = text;
  f.classList.remove('warn','alert');
  if(level==='warn') f.classList.add('warn');
  if(level==='alert') f.classList.add('alert');
}

function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function evalSquat(kps){
  const hip = gp(kps,'right_hip')||gp(kps,'left_hip');
  const knee = gp(kps,'right_knee')||gp(kps,'left_knee');
  const ankle = gp(kps,'right_ankle')||gp(kps,'left_ankle');
  const shoulder = gp(kps,'right_shoulder')||gp(kps,'left_shoulder');
  if(!(hip&&knee&&ankle&&shoulder)) return;
  const kneeAngle = angle(hip,knee,ankle);
  const trunk = angle(knee,hip,shoulder);
  let msg='Great depth! Keep chest proud.'; let lvl='ok'; let score=100;
  if(kneeAngle>115){ msg='무릎 전방 이동! Hips back!'; lvl='warn'; score-=15; }
  if(trunk<160){ msg='허리 말림 주의 — Chest up, core tight!'; lvl='alert'; score-=20; }
  const depth = trunk<150 || kneeAngle>110;
  if(depth && lastPhase==='up'){ lastPhase='down'; }
  if(!depth && lastPhase==='down'){ lastPhase='up'; repCount++; }
  accuracyAvg.push(clamp(score,0,100));
  document.getElementById('reps').textContent = repCount;
  document.getElementById('accuracy').textContent = Math.round(accuracyAvg.slice(-30).reduce((a,b)=>a+b,0)/Math.max(1, Math.min(30,accuracyAvg.length)));
  setFeedback(msg, lvl);
  if(lvl==='alert' && repCount%2===0) speak('허리를 펴세요! Core tight!');
}
function evalDeadlift(kps){
  const knee = gp(kps,'right_knee')||gp(kps,'left_knee');
  const hip = gp(kps,'right_hip')||gp(kps,'left_hip');
  const shoulder = gp(kps,'right_shoulder')||gp(kps,'left_shoulder');
  if(!(hip&&knee&&shoulder)) return;
  const back = angle(knee,hip,shoulder);
  let msg='Solid hinge. Lats on!'; let lvl='ok'; let score=100;
  if(back<150){ msg='등 말림 — Neutral spine, chest up!'; lvl='alert'; score-=25; }
  const hinge = back<160;
  if(hinge && lastPhase==='up'){ lastPhase='down'; }
  if(!hinge && lastPhase==='down'){ lastPhase='up'; repCount++; }
  accuracyAvg.push(clamp(score,0,100));
  document.getElementById('reps').textContent = repCount;
  document.getElementById('accuracy').textContent = Math.round(accuracyAvg.slice(-30).reduce((a,b)=>a+b,0)/Math.max(1, Math.min(30,accuracyAvg.length)));
  setFeedback(msg, lvl);
  if(lvl==='alert') speak('등이 굽었어요. 가슴을 열고 중립 척추!');
}
function evalBench(kps){
  const sh = gp(kps,'right_shoulder')||gp(kps,'left_shoulder');
  const el = gp(kps,'right_elbow')||gp(kps,'left_elbow');
  const wr = gp(kps,'right_wrist')||gp(kps,'left_wrist');
  if(!(sh&&el&&wr)) return;
  const elbowAngle = angle(sh,el,wr);
  let msg='Controlled bar path. Nice!'; let lvl='ok'; let score=100;
  if(elbowAngle<70){ msg='팔꿈치 너무 아래 — ninety!'; lvl='warn'; score-=15; }
  const down = elbowAngle<90;
  if(down && lastPhase==='up'){ lastPhase='down'; }
  if(!down && lastPhase==='down'){ lastPhase='up'; repCount++; }
  accuracyAvg.push(clamp(score,0,100));
  document.getElementById('reps').textContent = repCount;
  document.getElementById('accuracy').textContent = Math.round(accuracyAvg.slice(-30).reduce((a,b)=>a+b,0)/Math.max(1, Math.min(30,accuracyAvg.length)));
  setFeedback(msg, lvl);
  if(lvl==='warn' && repCount%3===0) speak('팔꿈치 각도! Elbow near ninety!');
}

async function loop(){
  if(!running && !preview) return;
  const poses = await detector.estimatePoses(video, {flipHorizontal: usingFront});
  if(poses && poses[0] && poses[0].keypoints){
    const kps = poses[0].keypoints;
    drawKeypoints(kps);
    if(running){
      if(currentExercise==='squat') evalSquat(kps);
      if(currentExercise==='deadlift') evalDeadlift(kps);
      if(currentExercise==='bench') evalBench(kps);
    }
  }
  requestAnimationFrame(loop);
}

async function ensureReady(){ await ensureDetector(); if(!video.srcObject) await startCamera(); }
async function start(){
  await ensureReady();
  running = true; preview=false; repCount=0; lastPhase='up'; accuracyAvg=[];
  document.getElementById('reps').textContent='0';
  document.getElementById('accuracy').textContent='-';
  document.getElementById('startBtn').disabled=true;
  document.getElementById('stopBtn').disabled=false;
  document.getElementById('restBtn').disabled=false;
  setFeedback("Session start! Perfect form, steady pace.");
  speak('Let’s go! 오늘 루틴 시작합니다.');
  loop();
}
function stop(){
  running=false;
  document.getElementById('startBtn').disabled=false;
  document.getElementById('stopBtn').disabled=true;
  document.getElementById('restBtn').disabled=true;
  const acc = Number(document.getElementById('accuracy').textContent)||0;
  const session = {exercise:currentExercise, reps:repCount, accuracy:acc, sets:setCount, ts:Date.now()};
  saveLog(session);
  speak('Session complete. Great job!');
}
function startRest(){
  restSec=60; document.getElementById('restTimer').classList.remove('hidden'); tickRest();
  if(restTimer) clearInterval(restTimer);
  restTimer = setInterval(tickRest, 1000);
}
function tickRest(){
  restSec--; document.getElementById('restSec').textContent = restSec;
  if(restSec<=0){ clearInterval(restTimer); document.getElementById('restTimer').classList.add('hidden'); setCountValue(setCount+1); speak('휴식 끝! Next set!'); }
}
function setCountValue(v){ setCount=v; document.getElementById('sets').textContent=setCount; }

function saveLog(s){ const arr=getLogs(); arr.push(s); localStorage.setItem('ai_logs', JSON.stringify(arr)); }
function getLogs(){ try{return JSON.parse(localStorage.getItem('ai_logs')||'[]')}catch(e){return[]} }
function refreshLog(){ const arr=getLogs().slice(-10); document.getElementById('logView').textContent = JSON.stringify(arr, null, 2); }
function makeReport(){
  const arr = getLogs().slice(-10);
  const totalReps = arr.reduce((a,b)=>a+(+b.reps||0),0);
  const avg = arr.length? Math.round(arr.reduce((a,b)=>a+(+b.accuracy||0),0)/arr.length):0;
  const byEx = {}; arr.forEach(s=>{ byEx[s.exercise]=byEx[s.exercise]||{reps:0,acc:0,cnt:0}; byEx[s.exercise].reps+= +s.reps||0; byEx[s.exercise].acc+= +s.accuracy||0; byEx[s.exercise].cnt++; });
  const insight = [];
  Object.entries(byEx).forEach(([k,v])=>{
    const a = v.cnt? Math.round(v.acc/v.cnt):0;
    if(k==='squat'){ insight.push(a<85?'스쿼트: 무릎 전방 이동 주의. Hips back!':'스쿼트: 깊이 좋습니다. 볼륨 +5%'); }
    if(k==='deadlift'){ insight.push(a<85?'데드: 등 말림 주의. Neutral spine!':'데드: 힌지 좋음. 중량 +2.5kg'); }
    if(k==='bench'){ insight.push(a<85?'벤치: 팔꿈치 각도 90°.':'벤치: 경로 안정. 마지막 2회 RPE↑'); }
  });
  const html = `<div class="report"><h3>요약</h3><p>최근 세션 ${arr.length} · 총 반복 ${totalReps} · 평균 정확도 ${avg}%</p><h3>운동별</h3><ul>${Object.entries(byEx).map(([k,v])=>`<li><b>${k}</b>: 세션 ${v.cnt}, 반복 ${v.reps}, 정확도 ${v.cnt?Math.round(v.acc/v.cnt):0}%</li>`).join('')}</ul><h3>다음 주 추천</h3><ul>${insight.map(i=>`<li>${i}</li>`).join('')}</ul></div>`;
  document.getElementById('reportView').innerHTML = html;
  document.getElementById('downloadReport').disabled=false;
}
function downloadReport(){
  const html = `<!doctype html><meta charset="utf-8"><title>AI Report</title>${document.getElementById('reportView').innerHTML}`;
  const blob = new Blob([html], {type:'text/html'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='ai_report.html'; a.click(); URL.revokeObjectURL(url);
}
function exportCsv(){
  const rows = getLogs(); if(!rows.length) return alert('데이터가 없습니다.');
  const headers = Object.keys(rows[0]);
  const esc = v => '\"'+String(v).replaceAll('\"','\"\"')+'\"';
  const csv = [headers.join(',')].concat(rows.map(r=> headers.map(h=> esc(r[h]??'')).join(','))).join('\n');
  const blob = new Blob([csv], {type:'text/csv'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='logs.csv'; a.click(); URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('.footer-tabs button').forEach(b=> b.addEventListener('click', ()=> showTab(b.dataset.tab)));
  document.querySelectorAll('.tab').forEach(b=> b.addEventListener('click', ()=> showTab(b.dataset.tab)));
  applyProfileToForm();
  document.getElementById('saveOnboarding').addEventListener('click', ()=>{ onboardingSave(); });
  document.getElementById('skipOnboarding').addEventListener('click', ()=>{ document.getElementById('onboarding').classList.add('hidden'); });
  document.getElementById('reopenOnboarding').addEventListener('click', ()=> document.getElementById('onboarding').classList.remove('hidden'));
  document.getElementById('getPlan').addEventListener('click', ()=>{ const plan=buildPlan(); renderPlan(plan); document.getElementById('onboarding').classList.add('hidden'); });
  document.getElementById('goCoach').addEventListener('click', ()=> showTab('coach'));
  video = document.getElementById('video'); overlay=document.getElementById('overlay');
  document.getElementById('exercise').addEventListener('change', e=> currentExercise=e.target.value);
  document.getElementById('flipCam').addEventListener('click', async ()=>{ usingFront=!usingFront; stopCamera(); await startCamera(); });
  document.getElementById('previewBtn').addEventListener('click', async ()=>{ await ensureReady(); preview=true; loop(); });
  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('stopBtn').addEventListener('click', stop);
  document.getElementById('restBtn').addEventListener('click', startRest);
  document.getElementById('refreshLog').addEventListener('click', refreshLog);
  document.getElementById('exportCsv').addEventListener('click', exportCsv);
  document.getElementById('makeReport').addEventListener('click', makeReport);
  document.getElementById('downloadReport').addEventListener('click', downloadReport);
  refreshLog();
});
