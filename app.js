// v0.21: save-status fade-in/out + minor polish
let video, overlay, ctx, detector, running=false, preview=false;
let currentExercise = 'squat';
let repCount = 0, setCount = 1;
let lastPhase = 'up';
let accuracyAvg = [];
let restTimer, restSec = 60;

const kneeForwardThreshold = 115;
const backSafeAngle = 150;
const elbowMinAngle = 70;

function getAngle(a,b,c){
  const ab = {x:a.x-b.x, y:a.y-b.y}, cb = {x:c.x-b.x, y:c.y-b.y};
  const dot = (ab.x*cb.x + ab.y*cb.y);
  const magAB = Math.hypot(ab.x, ab.y), magCB = Math.hypot(cb.x, cb.y);
  let deg = Math.acos(Math.min(Math.max(dot/(magAB*magCB+1e-6), -1), 1)) * 180/Math.PI;
  return deg;
}

function setFeedback(msg, level='ok'){
  const el = document.getElementById('feedback');
  el.textContent = msg;
  el.classList.remove('warn','alert');
  if(level==='warn') el.classList.add('warn');
  if(level==='alert') el.classList.add('alert');
}

async function initDetector(){
  const model = poseDetection.SupportedModels.MoveNet;
  detector = await poseDetection.createDetector(model, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
  });
}

async function startCamera(){
  video = document.getElementById('video');
  overlay = document.getElementById('overlay');
  ctx = overlay.getContext('2d');
  const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user', width:{ideal:1280}, height:{ideal:720}}, audio:false});
  video.srcObject = stream;
  await video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

function drawKeypoints(keypoints){
  ctx.clearRect(0,0,overlay.width, overlay.height);
  ctx.drawImage(video,0,0,overlay.width, overlay.height);
  ctx.fillStyle = 'rgba(86, 207, 225, 0.9)';
  keypoints.forEach(k=>{ if(k.score>0.5){ ctx.beginPath(); ctx.arc(k.x, k.y, 4, 0, 2*Math.PI); ctx.fill(); }});
}

function gp(kps, name){ return kps.find(k=>k.name===name) || null; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function evaluateSquat(kps){
  const hip = gp(kps,'right_hip') || gp(kps,'left_hip');
  const knee = gp(kps,'right_knee') || gp(kps,'left_knee');
  const ankle = gp(kps,'right_ankle') || gp(kps,'left_ankle');
  const shoulder = gp(kps,'right_shoulder') || gp(kps,'left_shoulder');
  if(!(hip&&knee&&ankle&&shoulder)) return;
  const kneeAngle = getAngle(hip,knee,ankle);
  const backAngle = getAngle(knee,hip,shoulder);
  let score = 100, msg = "좋아요! 엉덩이 뒤로, 가슴은 활짝.";
  let level='ok';
  if(kneeAngle > kneeForwardThreshold){ score -= clamp((kneeAngle-kneeForwardThreshold)*0.8, 5, 25); msg = "무릎이 발끝보다 나갔어요. 엉덩이를 더 뒤로!"; level='warn'; }
  if(backAngle < 165){ score -= clamp((165-backAngle)*0.8, 5, 25); msg = "허리가 말렸어요. 가슴 열고 시선 정면!"; level='alert'; }
  const depthOK = backAngle < 150 || kneeAngle > 110;
  if(depthOK && lastPhase==='up'){ lastPhase='down'; }
  if(!depthOK && lastPhase==='down'){ lastPhase='up'; repCount++; document.getElementById('reps').textContent = repCount; }
  accuracyAvg.push(clamp(score, 0, 100));
  setFeedback(msg, level);
  document.getElementById('accuracy').textContent = Math.round(accuracyAvg.slice(-30).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(accuracyAvg.length,30)));
}

function evaluateDeadlift(kps){
  const knee = gp(kps,'right_knee') || gp(kps,'left_knee');
  const hip = gp(kps,'right_hip') || gp(kps,'left_hip');
  const shoulder = gp(kps,'right_shoulder') || gp(kps,'left_shoulder');
  if(!(hip&&knee&&shoulder)) return;
  const backAngle = getAngle(knee,hip,shoulder);
  let score = 100, msg = "좋아요! 등 중립 유지, 발바닥에 힘.";
  let level='ok';
  if(backAngle < backSafeAngle){ score -= clamp((backSafeAngle-backAngle), 5, 30); msg = "허리가 굽었어요. 가슴 열고 힙을 더 뒤로."; level='alert'; }
  const hinge = backAngle < 160;
  if(hinge && lastPhase==='up'){ lastPhase='down'; }
  if(!hinge && lastPhase==='down'){ lastPhase='up'; repCount++; document.getElementById('reps').textContent = repCount; }
  accuracyAvg.push(clamp(score, 0, 100));
  setFeedback(msg, level);
  document.getElementById('accuracy').textContent = Math.round(accuracyAvg.slice(-30).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(accuracyAvg.length,30)));
}

function evaluateBench(kps){
  const shoulder = gp(kps,'right_shoulder') || gp(kps,'left_shoulder');
  const elbow = gp(kps,'right_elbow') || gp(kps,'left_elbow');
  const wrist = gp(kps,'right_wrist') || gp(kps,'left_wrist');
  if(!(shoulder&&elbow&&wrist)) return;
  const elbowAngle = getAngle(shoulder, elbow, wrist);
  let score = 100, msg = "견갑 고정, 손목 중립, 팔 경로 일정하게.";
  let level='ok';
  if(elbowAngle < elbowMinAngle){ score -= clamp((elbowMinAngle-elbowAngle), 5, 30); msg = "팔꿈치가 너무 내려갔어요. 90도까지만!"; level='warn'; }
  const down = elbowAngle < 90;
  if(down && lastPhase==='up'){ lastPhase='down'; }
  if(!down && lastPhase==='down'){ lastPhase='up'; repCount++; document.getElementById('reps').textContent = repCount; }
  accuracyAvg.push(clamp(score, 0, 100));
  setFeedback(msg, level);
  document.getElementById('accuracy').textContent = Math.round(accuracyAvg.slice(-30).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(accuracyAvg.length,30)));
}

async function loop(){
  if(!running && !preview) return;
  const poses = await detector.estimatePoses(video, {flipHorizontal:true});
  if(poses && poses[0] && poses[0].keypoints){
    const kps = poses[0].keypoints;
    drawKeypoints(kps);
    if(running){
      switch(currentExercise){
        case 'squat': evaluateSquat(kps); break;
        case 'deadlift': evaluateDeadlift(kps); break;
        case 'bench': evaluateBench(kps); break;
      }
    }
  }
  requestAnimationFrame(loop);
}

async function ensureCameraAndModel(){
  if(!video || !video.srcObject) await startCamera();
  if(!detector) await initDetector();
}

async function start(){
  await ensureCameraAndModel();
  running = true; preview = false;
  repCount = 0; lastPhase='up'; accuracyAvg = [];
  document.getElementById('reps').textContent = '0';
  document.getElementById('accuracy').textContent = '-';
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('restBtn').disabled = false;
  document.getElementById('restTimer').classList.add('hidden');
  setFeedback('세션 시작! 호흡 일정하게.', 'ok');
  loop();
}

function stop(){
  running = false;
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  document.getElementById('restBtn').disabled = true;
  const acc = document.getElementById('accuracy').textContent;
  const reportHTML = `<div class="card inner">운동: ${currentExercise}<br>반복: ${repCount}회<br>평균 정확도(최근): ${acc}%</div>`;
  document.getElementById('report').innerHTML = reportHTML;
  saveAnalytics({ exercise: currentExercise, reps: repCount, accuracy: acc, sets: setCount, ts: Date.now() });
  setFeedback('세션 종료! 수고했어요 🙌', 'ok');
}

async function previewCam(){
  await ensureCameraAndModel();
  preview = true;
  loop();
}

function startRest(){
  restSec = 60;
  document.getElementById('restSec').textContent = restSec;
  document.getElementById('restTimer').classList.remove('hidden');
  if(restTimer) clearInterval(restTimer);
  restTimer = setInterval(()=>{
    restSec -= 1;
    document.getElementById('restSec').textContent = restSec;
    if(restSec<=0){
      clearInterval(restTimer);
      setFeedback('휴식 종료! 다음 세트 시작합니다.', 'ok');
      setCountValue( setCount + 1 );
      document.getElementById('restTimer').classList.add('hidden');
    }
  }, 1000);
}

function setCountValue(v){
  setCount = v;
  document.getElementById('sets').textContent = setCount;
}

function simpleRoutine(data){
  const height = Number(data.height||170), weight = Number(data.weight||70);
  const bmi = weight/((height/100)**2);
  const goal = (data.targetWeight && Number(data.targetWeight) < weight) ? "감량" : "증량/유지";
  const level = data.experience||'beginner';
  const baseSets = level==='advanced'?5: level==='intermediate'?4:3;
  const plan = {
    title: `오늘의 3대운동 (${goal})`,
    exercises: [
      {name:"스쿼트", sets: baseSets, reps: 8},
      {name:"데드리프트", sets: baseSets, reps: 6},
      {name:"벤치프레스", sets: baseSets+1, reps: 10},
    ],
    note: `BMI ${bmi.toFixed(1)}, 레벨 ${level}`
  };
  return plan;
}

function loadProfile(){ try{ return JSON.parse(localStorage.getItem('ai_coach_profile')||'{}'); }catch(e){ return {}; } }
function saveProfile(obj){ localStorage.setItem('ai_coach_profile', JSON.stringify(obj)); }

function saveAnalytics(session){
  const arr = JSON.parse(localStorage.getItem('analytics')||'[]');
  arr.push(session);
  localStorage.setItem('analytics', JSON.stringify(arr));
}

function renderRoutineCards(plan){
  const wrap = document.getElementById('routineCards');
  wrap.innerHTML = '';
  plan.exercises.forEach((ex, idx)=>{
    const el = document.createElement('div');
    el.className = 'routine-card';
    el.innerHTML = `<h3>${idx+1}. ${ex.name}</h3><div>세트: ${ex.sets}</div><div>반복: ${ex.reps}</div>`;
    wrap.appendChild(el);
  });
}

function showAnalytics(){
  const arr = JSON.parse(localStorage.getItem('analytics')||'[]');
  document.getElementById('analyticsView').textContent = JSON.stringify(arr.slice(-10), null, 2);
}

document.addEventListener('DOMContentLoaded', ()=>{
  // Load profile
  const p = loadProfile();
  if(p.height) document.getElementById('height').value = p.height;
  if(p.weight) document.getElementById('weight').value = p.weight;
  if(p.experience) document.getElementById('experience').value = p.experience;
  if(p.targetWeight) document.getElementById('targetWeight').value = p.targetWeight;
  if(p.periodWeeks) document.getElementById('periodWeeks').value = p.periodWeeks;

  // Onboarding save with visible status
  document.getElementById('onboardingForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const data = {
      height: document.getElementById('height').value,
      weight: document.getElementById('weight').value,
      experience: document.getElementById('experience').value,
      targetWeight: document.getElementById('targetWeight').value,
      periodWeeks: document.getElementById('periodWeeks').value
    };
    saveProfile(data);
    const statusEl = document.getElementById('saveStatus');
    statusEl.textContent = "✅ 저장됨!";
    statusEl.style.opacity = 1;
    setTimeout(()=>{ statusEl.style.opacity = 0; }, 1500);
  });

  document.getElementById('generateRoutine').addEventListener('click', ()=>{
    const plan = simpleRoutine(loadProfile());
    document.getElementById('routineJson').textContent = JSON.stringify(plan, null, 2);
    renderRoutineCards(plan);
    localStorage.setItem('routine', JSON.stringify(plan));
  });

  document.getElementById('toggleRoutineView').addEventListener('click', ()=>{
    const pre = document.getElementById('routineJson');
    pre.classList.toggle('hidden');
  });

  document.getElementById('exercise').addEventListener('change', (e)=>{ currentExercise = e.target.value; });
  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('stopBtn').addEventListener('click', stop);
  document.getElementById('previewBtn').addEventListener('click', previewCam);
  document.getElementById('restBtn').addEventListener('click', startRest);
  document.getElementById('showAnalytics').addEventListener('click', showAnalytics);
  showAnalytics();
});
