// ═══════════════════════════════════════════════════════════
// PAINHUB BATTLES — CLIENT (работает с сервером)
// ═══════════════════════════════════════════════════════════

const API = window.location.origin + '/api';
const tg = window.Telegram?.WebApp;

// ============ DATA ============
const QUESTIONS = [
  {q:"С каким артистом у huzzyb нету совместного творчества?",o:["@ФакШиза","shalapay","dexey!"],c:1,p:2},
  {q:"Состоял ли huzzyb в benzo gang?",o:["Нет","Да"],c:0,p:1},
  {q:"Какой трек является символом перехода huzzy b к новому подходу в музыке?",o:["sadshit2007","pov","no pasaran"],c:1,p:3},
  {q:"Из какого трека строчка «я не гей но все фембои на моем хуе»?",o:["zlaya_emo4ka 2","zlaya_emo4ka","2%"],c:1,p:2},
  {q:"Какое слово пропущено «какая-то хуйня щас, верни мне … сук»",o:["yori","2007","tumblr"],c:2,p:2},
  {q:"Как зовут менеджера huzzy b?",o:["Даниил","Александр","Максим"],c:0,p:1},
  {q:"Как зовут huzzy b?",o:["Дмитрий Ицков","Андрей Смелянский","Алексей Киселёв"],c:2,p:1},
  {q:"Какой город не был посещен в рамках skinheadtour?",o:["Казань","Екатеринбург","Якутск"],c:2,p:2},
  {q:"Какой ник у huzzy b в качестве продюссера?",o:["pain_money","two","riaadante"],c:0,p:1},
  {q:"Какого трека нет в составе альбома SKINHEAD?",o:["NO PASARAN","POV","#DESTROY"],c:2,p:1},
  {q:"За сколько были проданы трусы huzzy b?",o:["100k","200k","300k"],c:1,p:3},
  {q:"Топ-3 лысых русских артистов по мнению huzzy b?",o:["huzzy b, 812, тагер","huzzy b, dexey","huzzy b, shalapay"],c:0,p:4},
  {q:"Кто озвучивал войстег painhub beach?",o:["DJ ASHANTI","DJ KEVIN","NBDANYA"],c:0,p:5}
];

const TIMER = 15;
const MAX = 28;

const RANKS = [
  {min:0,icon:'👤',title:'фанат токсиса'},
  {min:6,icon:'😈',title:'младенец пэинхаба'},
  {min:13,icon:'🔥',title:'легенда пэинхаба'},
  {min:21,icon:'👼',title:'икона пэинхаба'},
  {min:27,icon:'👑',title:'ангел пэинхаба'}
];

const ACHS = [
  {id:'first',icon:'🎯',name:'главарь семьи',desc:'Попади в топ-3'},
  {id:'speed',icon:'⚡',name:'Спидранер',desc:'Среднее время < 5 сек'},
  {id:'perfect',icon:'💯',name:'Перфекционист',desc:'Набери максимум'},
  {id:'top10',icon:'🔥',name:'В огне',desc:'Попади в топ-10'},
  {id:'top1',icon:'👑',name:'Король',desc:'Займи 1 место'},
  {id:'night',icon:'🌙',name:'Ночной ангел',desc:'Пройди после полуночи'}
];

// ============ STATE ============
let S = {
  user: null,
  quiz: {cur:0,score:0,correct:0,timer:null,left:TIMER,answers:[],start:0,qStart:0},
  view: null,
  cmp: null,
  cfg: {theme:'red',sound:true,vib:true}
};

// ============ API HELPERS ============
async function api(endpoint, data = null) {
  try {
    const opts = { headers: { 'Content-Type': 'application/json' } };
    if (data) {
      opts.method = 'POST';
      opts.body = JSON.stringify(data);
    }
    const res = await fetch(API + endpoint, opts);
    return await res.json();
  } catch (e) {
    console.error('API Error:', e);
    return { error: e.message };
  }
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadCfg();
  
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#000000');
    tg.setBackgroundColor('#000000');
  }
  
  await auth();
  bind();
  await updateHome();
  
  setTimeout(() => {
    $('#loader').classList.add('hide');
    $('#header').classList.remove('hidden');
    $('#main').classList.remove('hidden');
  }, 1500);
  
  // Защита от выхода
  window.addEventListener('beforeunload', async () => {
    if ($('#quizScreen').classList.contains('active') && !S.user.done) {
      await api('/quiz/quit', { userId: S.user.id, answers: S.quiz.answers });
    }
  });
}

async function auth() {
  const initData = tg?.initData || '';
  
  // Для локального тестирования
  const devUser = !initData ? { id: Date.now(), first_name: 'Демо', username: 'demo' } : null;
  
  const res = await api('/auth', { initData, devUser });
  
  if (res.error) {
    toast('Ошибка авторизации', 'err');
    return;
  }
  
  S.user = res.user;
  S.unread = res.unread;
}

function loadCfg() {
  const s = localStorage.getItem('phb_cfg');
  if (s) S.cfg = JSON.parse(s);
  document.body.dataset.theme = S.cfg.theme;
}

function saveCfg() {
  localStorage.setItem('phb_cfg', JSON.stringify(S.cfg));
}

// ============ HELPERS ============
function $(s) { return document.querySelector(s); }
function $$(s) { return document.querySelectorAll(s); }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function ava(u) { return u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`; }
function getRank(sc) { for (let i = RANKS.length - 1; i >= 0; i--) if (sc >= RANKS[i].min) return RANKS[i]; return RANKS[0]; }
function fmtDate(ts) { return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); }
function timeAgo(ts) { const s = Math.floor((Date.now() - ts) / 1000); if (s < 60) return 'только что'; if (s < 3600) return Math.floor(s / 60) + ' мин'; if (s < 86400) return Math.floor(s / 3600) + ' ч'; return fmtDate(ts); }
function toast(m, t = '') { const c = $('#toasts'), e = document.createElement('div'); e.className = `toast ${t}`; e.textContent = m; c.appendChild(e); setTimeout(() => { e.classList.add('out'); setTimeout(() => e.remove(), 250); }, 3000); }
function haptic(t = 'light') { if (!S.cfg.vib) return; if (tg?.HapticFeedback) { if (['success', 'error', 'warning'].includes(t)) tg.HapticFeedback.notificationOccurred(t); else tg.HapticFeedback.impactOccurred(t); } }

// ============ NAVIGATION ============
function go(id) { $$('.screen').forEach(s => s.classList.remove('active')); $(`#${id}`).classList.add('active'); $('.main').scrollTop = 0; }
function home() { go('homeScreen'); updateHome(); }

// ============ EVENTS ============
function bind() {
  // Header
  $('#profileBtn').onclick = () => openProfile(S.user.id);
  $('#settingsBtn').onclick = openSettings;
  $('#notifBtn').onclick = openNotifs;
  
  // Search
  const si = $('#searchInput'), sx = $('#searchX'), sd = $('#searchDrop');
  si.oninput = async () => {
    const q = si.value.trim();
    sx.classList.toggle('hidden', !q);
    if (q.length < 2) { sd.classList.add('hidden'); return; }
    
    const res = await api(`/search?q=${encodeURIComponent(q)}`);
    if (!res.length) {
      sd.innerHTML = '<div class="search-empty">Никого не найдено</div>';
    } else {
      sd.innerHTML = res.map(u => `
        <div class="search-item" data-id="${u.id}">
          <div class="search-item-ava"><img src="${ava(u)}"></div>
          <div class="search-item-info">
            <div class="search-item-name">${esc(u.name)} ${getRank(u.score).icon}</div>
            <div class="search-item-sub">${u.done ? u.score + ' очков' : 'Не прошёл'}</div>
          </div>
        </div>
      `).join('');
      sd.querySelectorAll('.search-item').forEach(el => {
        el.onclick = () => { openProfile(+el.dataset.id); si.value = ''; sx.classList.add('hidden'); sd.classList.add('hidden'); };
      });
    }
    sd.classList.remove('hidden');
  };
  sx.onclick = () => { si.value = ''; sx.classList.add('hidden'); sd.classList.add('hidden'); };
  document.onclick = e => { if (!e.target.closest('.search-wrap')) sd.classList.add('hidden'); };
  
  // Home
  $('#startBtn').onclick = showConfirm;
  $('#rulesBtn').onclick = () => $('#rulesModal').classList.remove('hidden');
  $('#rulesX').onclick = () => $('#rulesModal').classList.add('hidden');
  $('#rulesModal .modal-bg').onclick = () => $('#rulesModal').classList.add('hidden');
  $('#seeAllBtn').onclick = openLb;
  $('#lbBtn').onclick = openLb;
  $('#achBtn').onclick = openAch;
  $('#statsBtn').onclick = openGStats;
  
  // Confirm
  $('#confirmNo').onclick = () => $('#confirmModal').classList.add('hidden');
  $('#confirmYes').onclick = startQuiz;
  $('#confirmModal .modal-bg').onclick = () => $('#confirmModal').classList.add('hidden');
  
  // Quiz
  $('#quizClose').onclick = async () => {
    if (confirm('⚠️ Выйти?\n\nТест будет засчитан как проваленный с результатом 0 очков!')) {
      clearInterval(S.quiz.timer);
      await api('/quiz/quit', { userId: S.user.id, answers: S.quiz.answers });
      S.user.done = 1;
      S.user.score = 0;
      haptic('error');
      toast('❌ Тест провален!', 'err');
      home();
    }
  };
  
  // Result
  $('#resHome').onclick = home;
  $('#resShare').onclick = share;
  $('#resAnalytics').onclick = openAnalytics;
  
  // Analytics
  $('#analyticsBack').onclick = () => go('resultScreen');
  
  // Leaderboard
  $('#lbBack').onclick = home;
  $('#lbSearchInput').oninput = filterLb;
  
  // Achievements
  $('#achBack').onclick = home;
  
  // Global Stats
  $('#gStatsBack').onclick = home;
  
  // Profile
  $('#profileBack').onclick = home;
  $('#likeBtn').onclick = doLike;
  $('#friendBtn').onclick = doFriend;
  $('#compareBtn').onclick = doCompare;
  $('#reactBtn').onclick = () => $('#reactionModal').classList.remove('hidden');
  $('#adminToggle').onclick = () => $('#adminPanel').classList.toggle('hidden');
  $('#addCommentBtn').onclick = () => $('#commentModal').classList.remove('hidden');
  
  // Compare
  $('#compareBack').onclick = () => openProfile(S.cmp.id);
  
  // Notifications
  $('#notifBack').onclick = home;
  
  // Settings
  $('#settingsBack').onclick = home;
  $$('#themeGrid .theme-btn').forEach(b => {
    b.onclick = () => {
      S.cfg.theme = b.dataset.theme;
      document.body.dataset.theme = S.cfg.theme;
      $$('#themeGrid .theme-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      saveCfg();
    };
  });
  $('#sndToggle').onchange = e => { S.cfg.sound = e.target.checked; saveCfg(); };
  $('#vibToggle').onchange = e => { S.cfg.vib = e.target.checked; saveCfg(); };
  
  // Comment modal
  $('#commentNo').onclick = () => $('#commentModal').classList.add('hidden');
  $('#commentInput').oninput = () => $('#commentLen').textContent = $('#commentInput').value.length;
  $('#commentYes').onclick = sendComment;
  $('#commentModal .modal-bg').onclick = () => $('#commentModal').classList.add('hidden');
  
  // Reaction modal
  $('#reactionModal .modal-bg').onclick = () => $('#reactionModal').classList.add('hidden');
  $$('.reaction-pick button').forEach(b => {
    b.onclick = async () => {
      await api('/reaction', { fromId: S.user.id, toId: S.view.id, reaction: b.dataset.r });
      toast(`${b.dataset.r} Реакция отправлена!`, 'ok');
      $('#reactionModal').classList.add('hidden');
    };
  });
  
  // Admin
  $('#admResetTest').onclick = () => adm('reset-test');
  $('#admResetScore').onclick = () => adm('reset-score');
  $('#admBlock').onclick = () => adm('ban');
  $('#admUnblock').onclick = () => adm('unban');
  $('#admGiveAdmin').onclick = () => adm('give-admin');
  $('#admTakeAdmin').onclick = () => adm('take-admin');
  $('#admBroadcast').onclick = broadcast;
  $('#admResetAll').onclick = resetAll;
}

// ============ HOME ============
async function updateHome() {
  // Re-auth to get fresh data
  const res = await api('/auth', { initData: tg?.initData || '', devUser: !tg?.initData ? { id: S.user.id, first_name: S.user.name } : null });
  if (!res.error) {
    S.user = res.user;
    S.unread = res.unread;
  }
  
  // Header
  $('#hdrAvatar img').src = ava(S.user);
  const badge = $('#notifBadge');
  badge.textContent = S.unread > 9 ? '9+' : S.unread;
  badge.classList.toggle('hidden', S.unread === 0);
  
  // My card
  $('#myCardAva').src = ava(S.user);
  $('#myCardName').textContent = S.user.name;
  const rk = getRank(S.user.score);
  $('#myCardRank').textContent = rk.title;
  $('#myCardLvl').textContent = rk.icon;
  $('#myCardScore').textContent = S.user.score;
  $('#myCardPlace').textContent = S.user.rank ? `#${S.user.rank}` : '#—';
  
  // CTA
  const cta = $('#startBtn');
  if (S.user.done) {
    cta.classList.add('done');
    cta.querySelector('.cta-icon').textContent = '✓';
    cta.querySelector('.cta-text b').textContent = 'ТЕСТ ПРОЙДЕН';
    cta.querySelector('.cta-text small').textContent = `${S.user.score}/${MAX} очков`;
  } else {
    cta.classList.remove('done');
    cta.querySelector('.cta-icon').textContent = '⚔️';
    cta.querySelector('.cta-text b').textContent = 'НАЧАТЬ ТЕСТ';
    cta.querySelector('.cta-text small').textContent = '13 вопросов • 15 сек на ответ';
  }
  
  await renderPodium();
}

async function renderPodium() {
  const lb = await api('/leaderboard');
  const top3 = lb.slice(0, 3);
  const c = $('#podium');
  
  if (!top3.length) {
    c.innerHTML = '<div class="podium-empty"><span>🏆</span><p>Пока никто не прошёл тест</p><small>Стань первым!</small></div>';
    return;
  }
  
  const order = [];
  if (top3[1]) order.push({ u: top3[1], p: 2, cl: 'p2' });
  if (top3[0]) order.push({ u: top3[0], p: 1, cl: 'p1' });
  if (top3[2]) order.push({ u: top3[2], p: 3, cl: 'p3' });
  
  const med = ['', '🥇', '🥈', '🥉'];
  c.innerHTML = order.map(({ u, p, cl }) => `
    <div class="pod-card ${cl}" data-id="${u.id}">
      ${p === 1 ? '<div class="pod-crown">👑</div>' : ''}
      <div class="pod-medal">${med[p]}</div>
      <div class="pod-ava"><img src="${ava(u)}"></div>
      <div class="pod-name">${esc(u.name)}</div>
      <div class="pod-score">${u.score}</div>
    </div>
  `).join('');
  
  c.querySelectorAll('.pod-card').forEach(el => { el.onclick = () => openProfile(+el.dataset.id); });
}

// ============ QUIZ ============
function showConfirm() {
  if (S.user.done) { toast('Ты уже прошёл тест!', 'err'); return; }
  haptic('medium');
  $('#confirmModal').classList.remove('hidden');
}

function startQuiz() {
  $('#confirmModal').classList.add('hidden');
  haptic('heavy');
  S.quiz = { cur: 0, score: 0, correct: 0, timer: null, left: TIMER, answers: [], start: Date.now(), qStart: 0 };
  go('quizScreen');
  renderQ();
}

async function renderQ() {
  const q = QUESTIONS[S.quiz.cur], n = S.quiz.cur + 1, t = QUESTIONS.length;
  $('#qCur').textContent = n;
  $('#qTot').textContent = t;
  $('#qPts').textContent = S.quiz.score;
  $('#qpFill').style.width = `${((n - 1) / t) * 100}%`;
  $('#qPoints').textContent = `+${q.p} ${q.p === 1 ? 'очко' : q.p < 5 ? 'очка' : 'очков'}`;
  $('#qText').textContent = q.q;
  
  // Stats
  const stats = await api('/stats/questions');
  const st = stats[S.quiz.cur];
  $('#qStat').textContent = st && st.total ? `${Math.round(st.correct / st.total * 100)}% верных` : 'Новый вопрос';
  
  $('#qAnswers').innerHTML = q.o.map((o, i) => `<button class="q-ans" data-i="${i}">${esc(o)}</button>`).join('');
  $$('.q-ans').forEach(b => { b.onclick = () => answer(+b.dataset.i); });
  
  S.quiz.qStart = Date.now();
  startTimer();
}

function startTimer() {
  clearInterval(S.quiz.timer);
  S.quiz.left = TIMER;
  updTimer();
  S.quiz.timer = setInterval(() => {
    S.quiz.left--;
    updTimer();
    if (S.quiz.left <= 0) { clearInterval(S.quiz.timer); timeout(); }
  }, 1000);
}

function updTimer() {
  const t = S.quiz.left, pct = (t / TIMER) * 100;
  const fill = $('#timerFill'), sec = $('#timerSec');
  fill.style.width = `${pct}%`;
  sec.textContent = t;
  fill.classList.remove('warn', 'danger');
  sec.classList.remove('warn', 'danger');
  if (t <= 5) { fill.classList.add('danger'); sec.classList.add('danger'); }
  else if (t <= 10) { fill.classList.add('warn'); sec.classList.add('warn'); }
}

function timeout() {
  haptic('error');
  const q = QUESTIONS[S.quiz.cur];
  $$('.q-ans').forEach((b, i) => { b.classList.add('off'); if (i === q.c) b.classList.add('ok'); });
  const tm = (Date.now() - S.quiz.qStart) / 1000;
  S.quiz.answers.push({ i: S.quiz.cur, sel: -1, ok: false, tm });
  setTimeout(nextQ, 1200);
}

function answer(idx) {
  clearInterval(S.quiz.timer);
  const q = QUESTIONS[S.quiz.cur], ok = idx === q.c, tm = (Date.now() - S.quiz.qStart) / 1000;
  $$('.q-ans').forEach((b, i) => { b.classList.add('off'); if (i === idx) b.classList.add(ok ? 'ok' : 'no'); if (!ok && i === q.c) b.classList.add('ok'); });
  S.quiz.answers.push({ i: S.quiz.cur, sel: idx, ok, tm });
  if (ok) { S.quiz.score += q.p; S.quiz.correct++; $('#qPts').textContent = S.quiz.score; haptic('success'); } else { haptic('error'); }
  setTimeout(nextQ, 1000);
}

function nextQ() {
  S.quiz.cur++;
  if (S.quiz.cur < QUESTIONS.length) renderQ(); else finishQuiz();
}

async function finishQuiz() {
  clearInterval(S.quiz.timer);
  const avg = (S.quiz.answers.reduce((s, a) => s + a.tm, 0) / S.quiz.answers.length).toFixed(1);
  
  // Check achievements
  const achs = [];
  const h = new Date().getHours();
  if (h >= 0 && h < 6) achs.push('night');
  if (parseFloat(avg) < 5) achs.push('speed');
  if (S.quiz.score === MAX) achs.push('perfect');
  
  // Submit to server
  const res = await api('/quiz/submit', {
    userId: S.user.id,
    score: S.quiz.score,
    correct: S.quiz.correct,
    answers: S.quiz.answers,
    avgTime: parseFloat(avg),
    achs
  });
  
  // Check rank-based achievements
  if (res.rank === 1) achs.push('top1');
  else if (res.rank <= 3) achs.push('first');
  else if (res.rank <= 10) achs.push('top10');
  
  // Update if new achs
  if (achs.length > 0) {
    await api('/quiz/submit', { userId: S.user.id, score: S.quiz.score, correct: S.quiz.correct, answers: S.quiz.answers, avgTime: parseFloat(avg), achs });
  }
  
  S.user.done = 1;
  S.user.score = S.quiz.score;
  S.user.achs = achs;
  
  go('resultScreen');
  
  const rk = getRank(S.quiz.score);
  let em = '🎉', ti = 'Отлично!';
  if (S.quiz.score === MAX) { em = '👑'; ti = 'ИДЕАЛЬНО!'; }
  else if (S.quiz.score >= MAX * .8) { em = '🔥'; ti = 'Круто!'; }
  else if (S.quiz.score >= MAX * .5) { em = '👍'; ti = 'Неплохо!'; }
  else if (S.quiz.score >= MAX * .3) { em = '😅'; ti = 'Можно лучше'; }
  else { em = '📚'; ti = 'Учи матчасть!'; }
  
  $('#resEmoji').textContent = em;
  $('#resTitle').textContent = ti;
  $('#resRankIcon').textContent = rk.icon;
  $('#resRankText').textContent = rk.title;
  $('#resScore').textContent = S.quiz.score;
  $('#resCorrect').textContent = `${S.quiz.correct}/${QUESTIONS.length}`;
  $('#resPlace').textContent = res.rank ? `#${res.rank}` : '—';
  $('#resTime').textContent = `${avg}с`;
  
  const newAchs = achs.map(id => ACHS.find(a => a.id === id)).filter(Boolean);
  const ac = $('#resAch');
  if (newAchs.length) {
    ac.classList.remove('hidden');
    $('#resAchList').innerHTML = newAchs.map(a => `<div class="result-ach-item"><span>${a.icon}</span>${a.name}</div>`).join('');
  } else ac.classList.add('hidden');
  
  await renderReactions();
  confetti();
  haptic('success');
}

async function renderReactions() {
  const r = await api(`/reactions/${S.user.id}`);
  const c = $('#reactionsList');
  if (!r.length) { c.innerHTML = '<span class="no-reactions">Пока нет</span>'; return; }
  c.innerHTML = r.map(x => `<div class="reaction-item"><span>${x.reaction}</span><small>${x.count}</small></div>`).join('');
}

function confetti() {
  const c = $('#confetti'); c.innerHTML = '';
  const cols = ['#ff0a0a', '#ffd700', '#00d26a', '#fff', '#a855f7', '#22d3ee'];
  for (let i = 0; i < 50; i++) {
    const e = document.createElement('i');
    e.style.left = Math.random() * 100 + '%';
    e.style.background = cols[Math.floor(Math.random() * cols.length)];
    e.style.animationDelay = Math.random() * 2 + 's';
    e.style.animationDuration = (Math.random() * 2 + 2) + 's';
    c.appendChild(e);
  }
}

function share() {
  const t = `🔥 PAINHUB BATTLES\n\n⭐ Результат: ${S.user.score}/${MAX}\n🏆 Место: #${S.user.rank || '—'}\n${getRank(S.user.score).icon} ${getRank(S.user.score).title}\n\n@huzzywrld`;
  if (tg) tg.switchInlineQuery(t, ['users']);
  else { navigator.clipboard?.writeText(t); toast('Скопировано!', 'ok'); }
}

// ============ ANALYTICS ============
function openAnalytics() {
  go('analyticsScreen');
  const answers = S.quiz.answers || [];
  const ok = answers.filter(a => a.ok).length;
  const pct = answers.length ? Math.round(ok / answers.length * 100) : 0;
  const avg = answers.length ? (answers.reduce((s, a) => s + a.tm, 0) / answers.length).toFixed(1) : 0;
  
  $('#aScore').textContent = S.quiz.score;
  $('#aCorrect').textContent = pct + '%';
  $('#aTime').textContent = avg + 'с';
  
  const c = $('#analyticsList');
  if (!answers.length) { c.innerHTML = '<div class="empty"><span>📊</span><p>Нет данных</p></div>'; return; }
  c.innerHTML = answers.map((a, i) => {
    const q = QUESTIONS[a.i];
    return `<div class="al-item ${a.ok ? 'ok' : 'no'}"><div class="al-num">${i + 1}</div><div class="al-info"><div class="al-q">${esc(q.q.slice(0, 35))}...</div><div class="al-a">${a.sel >= 0 ? esc(q.o[a.sel]) : 'Не ответил'}</div></div><div class="al-time">${a.tm.toFixed(1)}с</div></div>`;
  }).join('');
}

// ============ LEADERBOARD ============
let lbCache = [];

async function openLb() {
  haptic('light');
  go('lbScreen');
  $('#lbSearchInput').value = '';
  lbCache = await api('/leaderboard');
  renderLb(lbCache);
}

function renderLb(list) {
  const c = $('#lbList');
  if (!list.length) { c.innerHTML = '<div class="empty"><span>🏆</span><p>Рейтинг пуст</p></div>'; return; }
  const med = ['🥇', '🥈', '🥉'];
  c.innerHTML = list.map((u, i) => {
    const r = i + 1;
    let cl = '';
    if (r === 1) cl = 'gold'; else if (r === 2) cl = 'silver'; else if (r === 3) cl = 'bronze';
    const rk = getRank(u.score);
    return `<div class="lb-item ${cl}" data-id="${u.id}"><div class="lb-rank">${r <= 3 ? med[r - 1] : r}</div><div class="lb-ava"><img src="${ava(u)}"></div><div class="lb-info"><div class="lb-name">${esc(u.name)}<span class="lb-lvl">${rk.icon}</span></div></div><div class="lb-score">${u.score}</div></div>`;
  }).join('');
  $$('.lb-item').forEach(el => { el.onclick = () => openProfile(+el.dataset.id); });
}

function filterLb() {
  const q = $('#lbSearchInput').value.trim().toLowerCase();
  const filtered = q ? lbCache.filter(u => u.name.toLowerCase().includes(q) || (u.username && u.username.toLowerCase().includes(q))) : lbCache;
  renderLb(filtered);
}

// ============ ACHIEVEMENTS ============
function openAch() {
  haptic('light');
  go('achScreen');
  const ua = S.user.achs || [];
  $('#achCount').textContent = `${ua.length}/${ACHS.length}`;
  $('#achFill').style.width = `${(ua.length / ACHS.length) * 100}%`;
  $('#achList').innerHTML = ACHS.map(a => {
    const has = ua.includes(a.id);
    return `<div class="ach-item ${has ? 'unlocked' : 'locked'}"><div class="ach-ico">${a.icon}</div><div class="ach-txt"><b>${a.name}</b><small>${a.desc}</small></div><div class="ach-status">${has ? '✅' : '🔒'}</div></div>`;
  }).join('');
}

// ============ GLOBAL STATS ============
async function openGStats() {
  haptic('light');
  go('gStatsScreen');
  
  const st = await api('/stats');
  $('#gsPlayers').textContent = st.total;
  $('#gsCompleted').textContent = st.done;
  $('#gsAvg').textContent = st.avg;
  $('#gsPerfect').textContent = st.perfect;
  
  const c = $('#gsQuestions');
  
  if (!S.user.done) {
    c.innerHTML = '<div class="locked-box"><span>🔒</span><b>Скрыто</b><small>Пройди тест, чтобы увидеть</small></div>';
    return;
  }
  
  const qs = await api('/stats/questions');
  c.innerHTML = QUESTIONS.map((q, i) => {
    const s = qs[i] || { total: 0, correct: 0 };
    const pct = s.total ? Math.round(s.correct / s.total * 100) : 0;
    let cl = '';
    if (pct < 40) cl = 'hard'; else if (pct < 70) cl = 'medium';
    return `<div class="gsq-item"><div class="gsq-num">${i + 1}</div><div class="gsq-info"><div class="gsq-text">${esc(q.q.slice(0, 30))}...</div><div class="gsq-bar"><i class="${cl}" style="width:${pct}%"></i></div></div><div class="gsq-pct">${pct}%</div></div>`;
  }).join('');
}

// ============ PROFILE ============
async function openProfile(uid) {
  haptic('light');
  go('profileScreen');
  
  const res = await api(`/profile/${uid}?viewer=${S.user.id}`);
  if (res.error) { toast('Не найден', 'err'); home(); return; }
  
  const u = res.user;
  S.view = u;
  const me = uid === S.user.id;
  
  const pl = u.rank;
  const wrap = $('#profileAvaWrap');
  wrap.classList.remove('t1', 't2', 't3');
  if (pl === 1) wrap.classList.add('t1');
  else if (pl === 2) wrap.classList.add('t2');
  else if (pl === 3) wrap.classList.add('t3');
  
  $('#profileAva img').src = ava(u);
  const rk = getRank(u.score);
  $('#profileLvl').textContent = rk.icon;
  $('#profileName').textContent = u.name;
  $('#profileUser').textContent = u.username ? `@${u.username}` : `ID: ${u.id}`;
  $('#profileRankIcon').textContent = rk.icon;
  $('#profileRankText').textContent = rk.title;
  
  $('#pScore').textContent = u.score;
  $('#pPlace').textContent = pl ? `#${pl}` : '#—';
  $('#pAch').textContent = `${(u.achs || []).length}/${ACHS.length}`;
  $('#pLikes').textContent = u.likesCount;
  
  $('#pJoined').textContent = fmtDate(u.created_at);
  $('#pTestDate').textContent = u.done ? fmtDate(u.test_at) : 'Нет';
  
  $('#profileActions').classList.toggle('hidden', me);
  
  if (!me) {
    const lb = $('#likeBtn');
    lb.classList.toggle('liked', res.isLiked);
    lb.querySelector('span').textContent = res.isLiked ? '❤️' : '🤍';
    
    const fb = $('#friendBtn');
    fb.classList.remove('friend');
    if (res.friendStatus === 'accepted') { fb.classList.add('friend'); fb.innerHTML = '<span>✓</span>Друзья'; }
    else if (res.friendStatus === 'pending') { fb.innerHTML = '<span>⏳</span>Заявка'; }
    else { fb.innerHTML = '<span>➕</span>В друзья'; }
    
    const canCmp = S.user.done && u.done;
    $('#compareBtn').style.opacity = canCmp ? '1' : '.4';
    $('#compareBtn').style.pointerEvents = canCmp ? 'auto' : 'none';
  }
  
  $('#addCommentBtn').classList.toggle('hidden', me);
  
  const ua = u.achs || [];
  const ar = $('#profileAchRow');
  ar.innerHTML = ua.length ? ua.map(id => { const a = ACHS.find(x => x.id === id); return a ? `<div class="profile-ach-item unlocked" title="${a.name}">${a.icon}</div>` : ''; }).join('') : '<span class="muted">Нет ачивок</span>';
  
  // Comments
  const cc = $('#comments');
  if (!res.comments.length) { cc.innerHTML = '<p class="muted">Пока нет комментариев</p>'; }
  else {
    cc.innerHTML = res.comments.map(x => `<div class="comment-item"><div class="comment-head"><div class="comment-ava"><img src="${x.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${x.from_id}`}"></div><div class="comment-name">${esc(x.author_name)}</div><div class="comment-time">${timeAgo(x.created_at)}</div></div><div class="comment-text">${esc(x.text)}</div></div>`).join('');
  }
  
  const showAdm = me && S.user.is_admin;
  $('#adminToggle').classList.toggle('hidden', !showAdm);
  $('#adminPanel').classList.add('hidden');
}

async function doLike() {
  if (!S.view) return;
  haptic('light');
  const res = await api('/like', { fromId: S.user.id, toId: S.view.id });
  const lb = $('#likeBtn');
  lb.classList.toggle('liked', res.liked);
  lb.querySelector('span').textContent = res.liked ? '❤️' : '🤍';
  const cnt = parseInt($('#pLikes').textContent) + (res.liked ? 1 : -1);
  $('#pLikes').textContent = cnt;
  toast(res.liked ? '❤️ Лайк!' : 'Лайк убран');
}

async function doFriend() {
  if (!S.view) return;
  haptic('light');
  const res = await api('/friend', { fromId: S.user.id, toId: S.view.id });
  const fb = $('#friendBtn');
  fb.classList.remove('friend');
  if (res.status === 'accepted') { fb.classList.add('friend'); fb.innerHTML = '<span>✓</span>Друзья'; toast('🤝 Вы теперь друзья!', 'ok'); }
  else if (res.status === 'pending') { fb.innerHTML = '<span>⏳</span>Заявка'; toast('Заявка отправлена!', 'ok'); }
}

async function doCompare() {
  if (!S.view || !S.user.done || !S.view.done) return;
  haptic('light');
  S.cmp = S.view;
  go('compareScreen');
  
  const u1 = S.user, u2 = S.view;
  $('#cmpAva1 img').src = ava(u1);
  $('#cmpName1').textContent = u1.name;
  $('#cmpAva2 img').src = ava(u2);
  $('#cmpName2').textContent = u2.name;
  
  const r1 = u1.rank || 999, r2 = u2.rank || 999;
  const a1 = JSON.parse(u1.answers || '[]'), a2 = JSON.parse(u2.answers || '[]');
  const c1 = a1.filter(a => a.ok).length, c2 = a2.filter(a => a.ok).length;
  
  setW('#cs1', '#cs2', u1.score, u2.score);
  setW('#cp1', '#cp2', r1, r2, true);
  setW('#cc1', '#cc2', c1, c2);
  $('#ct1').textContent = u1.avg_time ? u1.avg_time + 'с' : '—';
  $('#ct2').textContent = u2.avg_time ? u2.avg_time + 'с' : '—';
  if (u1.avg_time && u2.avg_time) setW('#ct1', '#ct2', u1.avg_time, u2.avg_time, true);
  
  const c = $('#compareQuestions');
  if (!a1.length || !a2.length) { c.innerHTML = '<div class="empty"><span>📊</span><p>Нет данных</p></div>'; return; }
  c.innerHTML = QUESTIONS.map((q, i) => {
    const ans1 = a1.find(a => a.i === i), ans2 = a2.find(a => a.i === i);
    return `<div class="cmpq"><div class="cmpq-num">${i + 1}</div><div class="cmpq-res"><span class="cmpq-ico">${ans1?.ok ? '✅' : '❌'}</span><span class="cmpq-ico">${ans2?.ok ? '✅' : '❌'}</span></div></div>`;
  }).join('');
}

function setW(s1, s2, v1, v2, lower = false) {
  const e1 = $(s1), e2 = $(s2);
  e1.textContent = v1;
  e2.textContent = v2;
  e1.classList.remove('win', 'lose');
  e2.classList.remove('win', 'lose');
  if (lower) {
    if (v1 < v2) { e1.classList.add('win'); e2.classList.add('lose'); }
    else if (v2 < v1) { e2.classList.add('win'); e1.classList.add('lose'); }
  } else {
    if (v1 > v2) { e1.classList.add('win'); e2.classList.add('lose'); }
    else if (v2 > v1) { e2.classList.add('win'); e1.classList.add('lose'); }
  }
}

async function sendComment() {
  const txt = $('#commentInput').value.trim();
  if (!txt) { toast('Напиши что-нибудь', 'err'); return; }
  if (txt.length > 150) { toast('Слишком длинно', 'err'); return; }
  
  const res = await api('/comment', { fromId: S.user.id, toId: S.view.id, text: txt });
  if (res.error) { toast('1 комментарий в день', 'err'); return; }
  
  toast('💬 Комментарий отправлен!', 'ok');
  $('#commentModal').classList.add('hidden');
  $('#commentInput').value = '';
  $('#commentLen').textContent = '0';
  openProfile(S.view.id);
}

// ============ NOTIFICATIONS ============
async function openNotifs() {
  haptic('light');
  go('notifScreen');
  
  const n = await api(`/notifications/${S.user.id}`);
  const c = $('#notifList');
  
  if (!n.length) { c.innerHTML = '<div class="empty"><span>🔔</span><p>Нет уведомлений</p></div>'; }
  else { c.innerHTML = n.map(x => `<div class="notif-item ${x.is_read ? '' : 'unread'}"><div class="notif-msg">${esc(x.message)}</div><div class="notif-time">${timeAgo(x.created_at)}</div></div>`).join(''); }
  
  await api('/notifications/read', { userId: S.user.id });
  $('#notifBadge').classList.add('hidden');
}

// ============ SETTINGS ============
function openSettings() {
  haptic('light');
  go('settingsScreen');
  $$('#themeGrid .theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === S.cfg.theme));
  $('#sndToggle').checked = S.cfg.sound;
  $('#vibToggle').checked = S.cfg.vib;
}

// ============ ADMIN ============
async function adm(act) {
  const tid = +$('#adminInput').value;
  if (!tid) { toast('Введи ID', 'err'); return; }
  haptic('medium');
  
  const res = await api(`/admin/${act}`, { adminId: S.user.id, targetId: tid });
  if (res.error) { toast(res.error, 'err'); return; }
  
  toast('✅ Готово!', 'ok');
  $('#adminInput').value = '';
  if (S.view?.id === tid) openProfile(tid);
}

async function broadcast() {
  const m = $('#broadcastInput').value.trim();
  if (!m) { toast('Введи сообщение', 'err'); return; }
  if (!confirm(`Отправить всем:\n\n"${m}"`)) return;
  haptic('medium');
  
  const res = await api('/admin/broadcast', { adminId: S.user.id, message: m });
  toast(`✅ Отправлено ${res.sent} из ${res.total}!`, 'ok');
  $('#broadcastInput').value = '';
}

async function resetAll() {
  if (!confirm('⚠️ СБРОСИТЬ ВСЕ ТЕСТЫ?')) return;
  if (!confirm('Точно? Это нельзя отменить!')) return;
  haptic('heavy');
  
  await api('/admin/reset-all', { adminId: S.user.id });
  toast('⚠️ Всё сброшено!', 'ok');
  home();
}

// ============ GLOBAL ============
window.openProfile = openProfile;