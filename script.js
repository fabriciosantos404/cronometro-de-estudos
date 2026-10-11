/* =========================================================
   Focus · Cronômetro de Estudos
   Tudo é salvo no localStorage do navegador.
   ========================================================== */
(function () {
  'use strict';

  /* ------------------------------ utilidades ------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const STORAGE_KEY = 'cronometroEstudos.v1';
  const PALETTE = [
    '#7c5cff', '#22d3ee', '#34d399', '#fbbf24', '#fb7185',
    '#f472b6', '#60a5fa', '#a3e635', '#f97316', '#14b8a6'
  ];

  const DEFAULTS = {
    subjects: [],
    sessions: [],
    timer: { running: false, subjectId: null, startedAt: 0, baseSec: 0, updatedAt: 0 },
    goalHours: 4,
    chartRange: 'week',
    historyFilter: 'all',
    theme: 'dark'
  };

  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function hexToRgba(hex, a) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return `rgba(148,163,184,${a})`;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /* ------------------------------ persistência ------------------------------ */
  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { raw = null; }

    const s = Object.assign({}, DEFAULTS, raw || {});
    s.timer = Object.assign({}, DEFAULTS.timer, (raw && raw.timer) || {});
    if (!Array.isArray(s.subjects)) s.subjects = [];
    if (!Array.isArray(s.sessions)) s.sessions = [];
    s.sessions = s.sessions.filter((x) => x && typeof x.duration === 'number' &&
      x.duration > 0 && typeof x.at === 'number');
    s.goalHours = clamp(Number(s.goalHours) || 4, 0.5, 24);

    // Se a página foi fechada com o cronômetro rodando, congela no último ponto salvo.
    const t = s.timer;
    if (t.running) {
      const ref = Math.max(t.startedAt, t.updatedAt || t.startedAt);
      t.baseSec = Math.max(0, Math.floor(t.baseSec + (ref - t.startedAt) / 1000));
      t.running = false;
      t.startedAt = 0;
    }
    t.updatedAt = Date.now();
    return s;
  }

  let state = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Não foi possível gravar no localStorage:', e);
    }
  }

  /* ------------------------------ tempo ------------------------------ */
  function elapsed() {
    const t = state.timer;
    if (!t.running) return Math.max(0, Math.floor(t.baseSec));
    return Math.max(0, Math.floor(t.baseSec + (Date.now() - t.startedAt) / 1000));
  }

  function fmtClock(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec === 0) return '0min';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h) return m ? `${h}h ${m}min` : `${h}h`;
    if (m) return (s && m < 10) ? `${m}min ${s}s` : `${m}min`;
    return `${s}s`;
  }

  const dayKey = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  };

  const todayStr = () => dayKey(new Date());

  function startOfWeek(d) {
    const x = new Date(d);
    const dow = (x.getDay() + 6) % 7; // segunda = 0
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - dow);
    return x;
  }

  /* ------------------------------ referências do DOM ------------------------------ */
  const timerCard = $('.timer-card');
  const timerDisplay = $('#timerDisplay');
  const timerState = $('#timerState');
  const timerSubjectLabel = $('#timerSubjectLabel');
  const subjectChips = $('#subjectChips');
  const playBtn = $('#playBtn');
  const playLabel = $('#playLabel');
  const resetBtn = $('#resetBtn');
  const manualBtn = $('#manualBtn');
  const goalText = $('#goalText');
  const goalBar = $('#goalBar');
  const goalInput = $('#goalInput');
  const chartEl = $('#chart');
  const subjectForm = $('#subjectForm');
  const subjectName = $('#subjectName');
  const subjectColor = $('#subjectColor');
  const swatches = $('#swatches');
  const subjectList = $('#subjectList');
  const subjectCount = $('#subjectCount');
  const historyEl = $('#history');
  const historyFoot = $('#historyFoot');
  const historyFilter = $('#historyFilter');
  const clearHistory = $('#clearHistory');
  const toasts = $('#toasts');
  const modal = $('#manualModal');
  const manualForm = $('#manualForm');
  const mSubject = $('#mSubject');
  const mHours = $('#mHours');
  const mMinutes = $('#mMinutes');
  const mDate = $('#mDate');
  const mNote = $('#mNote');
  const themeBtn = $('#themeBtn');

  /* ------------------------------ toasts ------------------------------ */
  function toast(msg, type = 'info', actionLabel = null, action = null) {
    const el = document.createElement('div');
    el.className = 'toast t-' + type;
    el.innerHTML = '<span class="t-dot"></span><span class="t-msg"></span>';
    el.querySelector('.t-msg').textContent = msg;

    let timer = null;
    const dismiss = () => {
      if (el.classList.contains('out')) return;
      el.classList.add('out');
      setTimeout(() => el.remove(), 380);
    };

    if (actionLabel) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 't-action';
      b.textContent = actionLabel;
      b.addEventListener('click', () => { action && action(); dismiss(); });
      el.appendChild(b);
    }

    toasts.appendChild(el);
    timer = setTimeout(dismiss, actionLabel ? 6000 : 3400);
    el.addEventListener('click', (e) => { if (!e.target.closest('.t-action')) { clearTimeout(timer); dismiss(); } });
  }

  /* ------------------------------ estatísticas ------------------------------ */
  function computeStats() {
    const now = new Date();
    const hoje = dayKey(now);
    const weekStart = startOfWeek(now).getTime();
    let total = 0, dia = 0, semana = 0;
    for (const s of state.sessions) {
      total += s.duration;
      if (dayKey(s.at) === hoje) dia += s.duration;
      if (s.at >= weekStart) semana += s.duration;
    }
    return { total, dia, semana, count: state.sessions.length };
  }

  function animateNumber(el, to, fmt) {
    const from = typeof el._cur === 'number' ? el._cur : 0;
    if (el._timer) clearTimeout(el._timer);
    if (from === to) { el._cur = to; el.textContent = fmt(to); return; }

    const steps = 16;               // animação por passos: não depende de relógio nem de rAF
    const delay = 40;               // ~640ms no total
    let i = 0;

    const step = () => {
      i += 1;
      const p = Math.min(1, i / steps);
      const eased = 1 - Math.pow(1 - p, 3);
      el._cur = Math.round(from + (to - from) * eased);
      el.textContent = fmt(el._cur);
      el._timer = p < 1 ? setTimeout(step, delay) : null;
    };
    step();
  }

  function renderStats() {
    const st = computeStats();
    animateNumber($('#statTotal'), st.total, fmtDuration);
    animateNumber($('#statToday'), st.dia, fmtDuration);
    animateNumber($('#statWeek'), st.semana, fmtDuration);
    animateNumber($('#statSessions'), st.count, (v) => (v === 1 ? '1 sessão' : v + ' sessões'));
    renderGoal(st);
    return st;
  }

  function renderGoal(st) {
    st = st || computeStats();
    const goalSec = state.goalHours * 3600;
    const pct = clamp((st.dia / goalSec) * 100, 0, 100);
    goalBar.style.width = pct.toFixed(1) + '%';
    goalBar.parentElement.classList.toggle('done', pct >= 100);
    goalText.textContent = `${fmtDuration(st.dia)} / ${state.goalHours}h`;
    if (document.activeElement !== goalInput && Number(goalInput.value) !== state.goalHours) {
      goalInput.value = state.goalHours;
    }
  }

  /* ------------------------------ matérias ------------------------------ */
  const findSubject = (id) => state.subjects.find((s) => s.id === id) || null;

  function subjectInfo(id) {
    if (!id) return { name: 'Sem matéria', color: '#94a3b8' };
    const s = findSubject(id);
    return s ? { name: s.name, color: s.color } : { name: 'Matéria excluída', color: '#94a3b8' };
  }

  function renderChips() {
    if (!state.subjects.length) {
      subjectChips.innerHTML = '<p class="empty">Cadastre matérias abaixo para etiquetar suas sessões.</p>';
      return;
    }
    subjectChips.innerHTML = state.subjects.map((s) => {
      const active = state.timer.subjectId === s.id;
      return `<button type="button" class="chip${active ? ' active' : ''}" data-chip="${esc(s.id)}" style="--c:${esc(s.color)}" title="${esc(s.name)}">
        <i class="chip-dot"></i><span>${esc(s.name)}</span>
      </button>`;
    }).join('');
  }

  function renderSubjects() {
    subjectCount.textContent = state.subjects.length === 1 ? '1 cadastrada' : state.subjects.length + ' cadastradas';

    if (!state.subjects.length) {
      subjectList.innerHTML = '<li class="empty">Nenhuma matéria ainda. Crie a primeira acima — escolha um nome e uma cor.</li>';
      return;
    }

    subjectList.innerHTML = state.subjects.map((s, i) => {
      const mine = state.sessions.filter((x) => x.subjectId === s.id);
      const secs = mine.reduce((a, b) => a + b.duration, 0);
      const initial = (s.name.trim()[0] || '?').toUpperCase();
      return `<li class="subject-item" data-id="${esc(s.id)}" style="animation-delay:${i * 45}ms">
        <span class="subject-swatch" style="--c:${esc(s.color)};--soft:${hexToRgba(s.color, .16)}">${esc(initial)}</span>
        <span class="subject-info">
          <strong>${esc(s.name)}</strong>
          <span>${fmtDuration(secs)} · ${mine.length === 1 ? '1 sessão' : mine.length + ' sessões'}</span>
        </span>
        <button class="icon-btn sm danger" type="button" data-del-subject="${esc(s.id)}" aria-label="Excluir ${esc(s.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7h16M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7"></path>
          </svg>
        </button>
      </li>`;
    }).join('');
  }

  function renderSwatches() {
    const current = (subjectColor.value || '').toLowerCase();
    swatches.innerHTML = PALETTE.map((c) =>
      `<button type="button" class="swatch${c === current ? ' active' : ''}" data-c="${c}" style="--c:${c}" aria-label="Selecionar cor ${c}"></button>`
    ).join('');
  }

  function renderOptions() {
    const opts = ['<option value="">Sem matéria</option>']
      .concat(state.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`));
    mSubject.innerHTML = opts.join('');

    const current = state.historyFilter;
    const filterOpts = ['<option value="all">Todas as matérias</option>']
      .concat(state.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`));
    historyFilter.innerHTML = filterOpts.join('');
    historyFilter.value = state.subjects.some((s) => s.id === current) || current === 'all' ? current : 'all';
    if (historyFilter.value !== state.historyFilter) state.historyFilter = historyFilter.value;
  }

  function deleteSubject(id) {
    const idx = state.subjects.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const subject = state.subjects[idx];
    const touched = state.sessions.filter((s) => s.subjectId === id).map((s) => s.id);
    const prevTimerSubject = state.timer.subjectId;

    state.subjects.splice(idx, 1);
    state.sessions.forEach((s) => { if (s.subjectId === id) s.subjectId = null; });
    if (state.timer.subjectId === id) state.timer.subjectId = null;
    if (state.historyFilter === id) state.historyFilter = 'all';
    save();
    renderAll();

    toast(`Matéria "${subject.name}" excluída`, 'warn', 'Desfazer', () => {
      state.subjects.splice(Math.min(idx, state.subjects.length), 0, subject);
      state.sessions.forEach((s) => { if (touched.includes(s.id)) s.subjectId = id; });
      if (prevTimerSubject === id) state.timer.subjectId = id;
      save();
      renderAll();
      toast('Matéria restaurada', 'ok');
    });
  }

  /* ------------------------------ cronômetro ------------------------------ */
  function renderTimer() {
    const sec = elapsed();
    const t = state.timer;
    timerDisplay.textContent = fmtClock(sec);
    timerCard.classList.toggle('running', t.running);
    playBtn.classList.toggle('is-running', t.running);
    playLabel.textContent = t.running ? 'Pausar' : 'Iniciar';
    playBtn.setAttribute('aria-label', t.running ? 'Pausar cronômetro' : 'Iniciar cronômetro');
    timerState.innerHTML = t.running ? '<i></i> Cronometrando' : '<i></i> Parado';

    const info = subjectInfo(t.subjectId);
    timerSubjectLabel.textContent = info.name;
    timerSubjectLabel.style.setProperty('--dot', info.color);

    document.title = t.running ? `${fmtClock(sec)} · Focus` : 'Focus · Cronômetro de Estudos';
  }

  let ticker = null;
  let tickCount = 0;

  function startTicker() {
    if (ticker) return;
    ticker = setInterval(() => {
      if (!state.timer.running) return;
      state.timer.updatedAt = Date.now();
      timerDisplay.textContent = fmtClock(elapsed());
      document.title = `${fmtClock(elapsed())} · Focus`;
      if (++tickCount % 20 === 0) { save(); renderGoal(); } // grava a cada ~5s
    }, 250);
  }

  function toggleTimer() {
    const t = state.timer;
    if (t.running) {
      t.baseSec = elapsed();
      t.running = false;
      t.startedAt = 0;
      t.updatedAt = Date.now();
      save();
      renderTimer();
      toast(`Pausado em ${fmtClock(t.baseSec)}`, 'info');
      if (!state.subjects.length) toast('Dica: cadastre matérias para organizar seu histórico', 'warn');
    } else {
      t.running = true;
      t.startedAt = Date.now();
      t.updatedAt = Date.now();
      save();
      renderTimer();
      toast('Cronômetro iniciado — bons estudos!', 'ok');
      if (state.subjects.length && !t.subjectId) toast('Nenhuma matéria selecionada', 'warn');
    }
  }

  function resetTimer() {
    const sec = elapsed();
    const t = state.timer;
    const subjectId = t.subjectId;
    t.running = false;
    t.startedAt = 0;
    t.baseSec = 0;
    t.updatedAt = Date.now();

    if (sec >= 1) {
      state.sessions.push({ id: uid(), subjectId, duration: sec, at: Date.now(), source: 'timer', note: '' });
      save();
      renderAll();
      toast(`Sessão salva · ${fmtDuration(sec)}`, 'ok');
    } else {
      save();
      renderTimer();
      toast('Cronômetro zerado', 'info');
    }
  }

  /* ------------------------------ gráfico ------------------------------ */
  function renderChart() {
    const range = state.chartRange;
    const from = range === 'week' ? startOfWeek(new Date()).getTime() : -Infinity;
    const map = new Map();

    state.sessions.forEach((s) => {
      if (s.at < from) return;
      const key = s.subjectId || '__none__';
      map.set(key, (map.get(key) || 0) + s.duration);
    });

    const rows = Array.from(map.entries()).map(([id, dur]) => {
      if (id === '__none__') return { id, dur, name: 'Sem matéria', color: '#94a3b8' };
      const info = subjectInfo(id);
      return { id, dur, name: info.name, color: info.color };
    }).sort((a, b) => b.dur - a.dur);

    $$('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.range === range));

    if (!rows.length) {
      chartEl.innerHTML = `<p class="empty">${range === 'week'
        ? 'Nada registrado nesta semana ainda.<br>Inicie o cronômetro ou adicione um tempo manual.'
        : 'Nenhuma hora registrada até agora.'}</p>`;
      return;
    }

    const max = rows[0].dur || 1;
    chartEl.innerHTML = rows.map((r) => {
      const pct = Math.max(3, (r.dur / max) * 100);
      return `<div class="chart-row">
        <div class="chart-top">
          <span class="chart-name" style="--c:${esc(r.color)}"><i></i><span>${esc(r.name)}</span></span>
          <span class="chart-val">${fmtDuration(r.dur)}</span>
        </div>
        <div class="bar"><span class="bar-fill" style="width:${pct.toFixed(1)}%;--c:${esc(r.color)};--soft:${hexToRgba(r.color, .45)}"></span></div>
      </div>`;
    }).join('');
  }

  /* ------------------------------ histórico ------------------------------ */
  function dayLabel(ts) {
    const d = new Date(ts);
    const hoje = new Date();
    if (dayKey(d) === dayKey(hoje)) return 'Hoje';
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    if (dayKey(d) === dayKey(ontem)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  function renderHistory() {
    const list = state.sessions
      .filter((s) => state.historyFilter === 'all' || s.subjectId === state.historyFilter)
      .sort((a, b) => b.at - a.at);

    if (!list.length) {
      historyEl.innerHTML = `<p class="empty">${state.historyFilter === 'all'
        ? 'Seu histórico está vazio.<br>As sessões aparecem aqui assim que você zerar o cronômetro ou registrar um tempo manual.'
        : 'Nenhuma sessão para esta matéria.'}</p>`;
      historyFoot.innerHTML = '';
      return;
    }

    let html = '';
    let lastDay = '';
    list.forEach((s, i) => {
      const key = dayKey(s.at);
      if (key !== lastDay) {
        lastDay = key;
        html += `<div class="history-day">${esc(dayLabel(s.at))}</div>`;
      }
      const info = subjectInfo(s.subjectId);
      const d = new Date(s.at);
      const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const origem = s.source === 'manual' ? 'manual' : 'cronômetro';
      const nota = s.note ? ` · ${esc(s.note)}` : '';
      html += `<div class="hist-item" data-id="${esc(s.id)}" style="animation-delay:${Math.min(i * 35, 400)}ms">
        <span class="hist-dot" style="--c:${esc(info.color)}"></span>
        <span class="hist-main">
          <strong>${esc(info.name)}</strong>
          <span>${hora} · ${origem}${nota}</span>
        </span>
        <span class="hist-dur">${fmtDuration(s.duration)}</span>
        <button class="icon-btn sm danger" type="button" data-del-session="${esc(s.id)}" aria-label="Excluir registro">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7h16M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7"></path>
          </svg>
        </button>
      </div>`;
    });
    historyEl.innerHTML = html;

    const sum = list.reduce((a, b) => a + b.duration, 0);
    historyFoot.innerHTML = `<span>${list.length === 1 ? '1 registro' : list.length + ' registros'} no filtro</span>
      <span>Total: <strong>${fmtDuration(sum)}</strong></span>`;
  }

  function deleteSession(id) {
    const idx = state.sessions.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const [removed] = state.sessions.splice(idx, 1);
    save();
    renderStats();
    renderChart();
    renderHistory();
    renderSubjects();
    toast('Registro excluído', 'warn', 'Desfazer', () => {
      state.sessions.push(removed);
      save();
      renderAll();
      toast('Registro restaurado', 'ok');
    });
  }

  /* ------------------------------ modal ------------------------------ */
  let lastFocused = null;

  function openModal() {
    lastFocused = document.activeElement;
    mDate.value = todayStr();
    mDate.max = todayStr();
    mHours.value = '0';
    mMinutes.value = '30';
    mNote.value = '';
    mSubject.value = state.timer.subjectId || '';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => mHours.focus(), 120);
  }

  function closeModal() {
    if (!modal.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function addManual(e) {
    e.preventDefault();
    const h = clamp(Math.round(Number(mHours.value) || 0), 0, 24);
    const m = clamp(Math.round(Number(mMinutes.value) || 0), 0, 59);
    const dur = h * 3600 + m * 60;

    if (dur <= 0) {
      toast('Informe um tempo maior que zero', 'err');
      return;
    }

    const parts = (mDate.value || todayStr()).split('-').map(Number);
    const now = new Date();
    const at = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || now.getDate(),
      now.getHours(), now.getMinutes(), 0, 0).getTime();

    state.sessions.push({
      id: uid(),
      subjectId: mSubject.value || null,
      duration: dur,
      at,
      source: 'manual',
      note: mNote.value.trim()
    });

    save();
    closeModal();
    renderAll();
    toast(`Tempo registrado · ${fmtDuration(dur)}`, 'ok');
  }

  /* ------------------------------ render geral ------------------------------ */
  function renderAll() {
    renderOptions();
    renderTimer();
    renderStats();
    renderChips();
    renderChart();
    renderSubjects();
    renderHistory();
  }

  /* ------------------------------ eventos ------------------------------ */
  playBtn.addEventListener('click', toggleTimer);
  resetBtn.addEventListener('click', resetTimer);
  manualBtn.addEventListener('click', openModal);
  manualForm.addEventListener('submit', addManual);

  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });

  subjectChips.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]');
    if (!chip) return;
    const id = chip.dataset.chip;
    state.timer.subjectId = state.timer.subjectId === id ? null : id;
    save();
    renderChips();
    renderTimer();
  });

  subjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = subjectName.value.trim();
    if (!name) { toast('Digite o nome da matéria', 'err'); return; }
    if (state.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      toast('Já existe uma matéria com esse nome', 'err');
      return;
    }
    const subject = { id: uid(), name, color: (subjectColor.value || '#7c5cff').toLowerCase() };
    state.subjects.push(subject);
    if (!state.timer.subjectId) state.timer.subjectId = subject.id;
    save();
    subjectName.value = '';
    renderAll();
    toast(`Matéria "${name}" criada`, 'ok');
  });

  swatches.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    subjectColor.value = b.dataset.c;
    renderSwatches();
  });

  subjectColor.addEventListener('input', renderSwatches);

  subjectList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del-subject]');
    if (btn) deleteSubject(btn.dataset.delSubject);
  });

  historyEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del-session]');
    if (btn) deleteSession(btn.dataset.delSession);
  });

  historyFilter.addEventListener('change', () => {
    state.historyFilter = historyFilter.value;
    save();
    renderHistory();
  });

  $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    state.chartRange = b.dataset.range;
    save();
    renderChart();
  }));

  goalInput.addEventListener('change', () => {
    const v = clamp(Number(goalInput.value) || 4, 0.5, 24);
    state.goalHours = v;
    goalInput.value = v;
    save();
    renderGoal();
    toast(`Meta diária: ${v}h`, 'info');
  });

  // Limpar histórico (confirmação em dois toques)
  let clearTimer = null;
  clearHistory.addEventListener('click', () => {
    if (!state.sessions.length) { toast('Não há histórico para limpar', 'info'); return; }

    if (!clearHistory.classList.contains('confirming')) {
      clearHistory.classList.add('confirming');
      clearHistory.setAttribute('title', 'Clique de novo para confirmar');
      toast('Clique novamente para apagar todo o histórico', 'warn');
      clearTimer = setTimeout(() => clearHistory.classList.remove('confirming'), 3500);
      return;
    }

    clearTimeout(clearTimer);
    clearHistory.classList.remove('confirming');
    const backup = state.sessions.slice();
    state.sessions = [];
    save();
    renderAll();
    toast('Histórico limpo', 'warn', 'Desfazer', () => {
      state.sessions = backup;
      save();
      renderAll();
      toast('Histórico restaurado', 'ok');
    });
  });

  themeBtn.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = state.theme;
    save();
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { closeModal(); return; }
    if (e.code !== 'Space') return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea', 'button'].includes(tag)) return;
    if (modal.classList.contains('open')) return;
    e.preventDefault();
    toggleTimer();
  });

  // Ao fechar/recarregar: congela o tempo exato e lembra de onde parou.
  window.addEventListener('pagehide', () => {
    const t = state.timer;
    if (t.running) { t.baseSec = elapsed(); t.running = false; t.startedAt = 0; }
    t.updatedAt = Date.now();
    save();
  });

  // Ao trocar de aba apenas grava o ponto (o cronômetro continua quando voltar).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      state.timer.updatedAt = Date.now();
      save();
    }
  });

  /* ------------------------------ início ------------------------------ */
  document.documentElement.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
  renderSwatches();
  renderAll();
  startTicker();
})();
