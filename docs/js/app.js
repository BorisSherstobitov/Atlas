/* Atlas — SPA на чистом JS (hash-роутинг, без сборки) */
const API = (window.ATLAS_API || '').replace(/\/$/, '');
const S = { token: localStorage.getItem('atlas_token'), user: JSON.parse(localStorage.getItem('atlas_user') || 'null') };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPE = { lesson: 'Урок', video: 'Видео', test: 'Тест' };

/* ---------- утилиты ---------- */
async function api(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(API + '/api' + path, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }
    });
  } catch { throw new Error('Сервер недоступен. Если backend на Render спал — подождите ~30 сек и повторите.'); }
  let d = null; try { d = await r.json(); } catch { }
  if (r.status === 401 && S.token) { logout(); throw new Error('Сессия истекла, войдите заново'); }
  if (!r.ok) {
    let m = d && d.detail; if (Array.isArray(m)) m = m.map(x => x.msg).join('; ');
    throw new Error(m || 'Ошибка ' + r.status);
  }
  return d;
}
function toast(msg, type = '') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 4000);
}
function setAuth(d) {
  S.token = d.token; S.user = d.user;
  localStorage.setItem('atlas_token', d.token); localStorage.setItem('atlas_user', JSON.stringify(d.user));
}
function logout() {
  S.token = null; S.user = null; localStorage.removeItem('atlas_token'); localStorage.removeItem('atlas_user');
  location.hash = '#/login';
}
const isAuthor = () => S.user && S.user.role === 'author';
function needAuth(msg = 'Для продолжения войдите или зарегистрируйтесь') {
  if (S.token) return true;
  toast(msg); location.hash = '#/login'; return false;
}
function modal(html) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="modal">${html}</div>`;
  ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
  document.body.append(ov); ov.close = () => ov.remove(); return ov;
}
const hue = id => (id * 57) % 360;
const coverStyle = c => c.cover_image ? `background-image:url('${esc(c.cover_image)}')`
  : `background-image:linear-gradient(135deg,hsl(${hue(c.id)},60%,35%),hsl(${hue(c.id) + 50},65%,25%))`;
const money = p => p > 0 ? `${p} ₽` : 'Бесплатно';
const loading = () => app.innerHTML = '<div class="loader">Загрузка…</div>';

function md(src) {
  const blocks = []; let t = esc(src || '');
  t = t.replace(/```([\s\S]*?)```/g, (_, c) => { blocks.push(`<pre><code>${c.trim()}</code></pre>`); return `§§${blocks.length - 1}§§`; });
  const inline = s => s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  return t.split(/\n{2,}/).map(b => {
    b = b.trim(); if (!b) return '';
    const m = b.match(/^§§(\d+)§§$/); if (m) return blocks[m[1]];
    if (/^#{1,3} /.test(b)) { const n = b.match(/^#+/)[0].length; return `<h${n}>${inline(b.replace(/^#+ /, ''))}</h${n}>`; }
    if (/^- /m.test(b) && b.split('\n').every(l => /^- /.test(l))) return '<ul>' + b.split('\n').map(l => `<li>${inline(l.slice(2))}</li>`).join('') + '</ul>';
    return `<p>${inline(b).replace(/\n/g, '<br>').replace(/§§(\d+)§§/g, (_, i) => blocks[i])}</p>`;
  }).join('');
}
function videoEmbed(url) {
  if (!url) return '<p class="muted">Видео не указано</p>';
  const y = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  if (y) return `<div class="video"><iframe src="https://www.youtube.com/embed/${y[1]}" allowfullscreen></iframe></div>`;
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return `<div class="video"><video src="${esc(url)}" controls></video></div>`;
  return `<p><a class="btn" target="_blank" href="${esc(url)}">Открыть видео ↗</a></p>`;
}

/* ---------- навигация ---------- */
function renderNav() {
  const cur = location.hash.slice(1) || '/';
  const on = p => cur === p || (p !== '/' && cur.startsWith(p)) ? 'on' : '';
  $('#nav').innerHTML = `<div class="in">
    <a href="#/" class="logo">Atlas</a>
    <a class="l ${on('/')}" href="#/">Главная</a>
    <a class="l ${on('/courses')}" href="#/courses">Курсы</a>
    ${isAuthor() ? `<a class="l" href="#/courses?mine=1">Мои курсы</a>` : ''}
    <span class="sp"></span>
    ${S.user ? `<span class="muted">${esc(S.user.full_name)}</span><span class="badge">${isAuthor() ? 'Автор' : 'Студент'}</span>
      <button class="btn sm" id="lo">Выйти</button>`
      : `<a class="btn sm" href="#/login">Войти</a><a class="btn sm primary" href="#/register">Регистрация</a>`}</div>`;
  const lo = $('#lo'); if (lo) lo.onclick = logout;
}

/* ---------- карточка курса ---------- */
function courseCard(c) {
  let btn;
  if (c.is_owner) btn = `<a class="btn sm primary" href="#/edit/${c.id}">Редактировать</a>`;
  else if (c.progress >= 100) btn = `<a class="btn sm" href="#/course/${c.id}">Пройден ✓</a>`;
  else if (c.progress > 0) btn = `<a class="btn sm primary" href="#/course/${c.id}">Продолжить курс</a>`;
  else btn = `<a class="btn sm primary" href="#/course/${c.id}">Начать курс</a>`;
  return `<div class="card" data-cid="${c.id}">
    <div class="cover" style="${coverStyle(c)}">
      <span class="badge ${c.price > 0 ? 'warn' : 'ok'}">${money(c.price)}</span>
      ${c.is_owner ? `<span class="badge ${c.is_published ? 'ok' : 'warn'}">${c.is_published ? 'Опубликован' : 'Черновик'}</span>` : ''}</div>
    <div class="body"><h3>${esc(c.title)}</h3>
      <div class="muted" style="font-size:13px">${esc(c.author_name)} · ${c.modules_count} мод. · ${c.items_count} эл. · ${c.students_count} студ.</div>
      <div class="desc">${esc(c.description)}</div>
      ${S.user && !c.is_owner ? `<div class="bar"><i style="width:${c.progress}%"></i></div><div class="muted" style="font-size:12px">Прогресс: ${c.progress}%</div>` : ''}
      <div class="row">${btn}</div></div></div>`;
}
function bindCards(root, onClickGuard) {
  $$('.card', root).forEach(el => el.onclick = e => {
    if (e.target.closest('a')) { if (onClickGuard && !onClickGuard()) e.preventDefault(); return; }
    if (onClickGuard && !onClickGuard()) return;
    location.hash = '#/course/' + el.dataset.cid;
  });
}

/* ---------- страницы ---------- */
async function home() {
  app.innerHTML = `<div class="wrap">
    <section class="hero"><h1 class="logo">Atlas</h1>
      <p>Платформа онлайн-обучения с упором на информационные технологии. Проходите бесплатные и платные курсы или создавайте свои.</p>
      <div class="row" style="justify-content:center">
        <a class="btn primary lg" id="start" href="#/register">Начать</a>
        <a class="btn lg" id="watch" href="#/courses">Смотреть курсы</a></div></section>
    <div class="sect"><h2 style="margin:0">Популярные курсы</h2><a class="btn sm" id="all" href="#/courses">Все курсы →</a></div>
    <div class="grid" id="pop"><div class="loader">Загрузка…</div></div></div>`;
  if (S.token) { $('#start').textContent = 'Продолжить'; $('#start').href = '#/courses'; }
  try {
    const list = await api('/courses/popular');
    $('#pop').innerHTML = list.length ? list.map(courseCard).join('') : '<div class="empty">Курсов пока нет</div>';
    bindCards($('#pop'), () => needAuth('Чтобы открыть курс, войдите или зарегистрируйтесь'));
  } catch (e) { $('#pop').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

function authForm(register) {
  return async () => {
    if (S.token) { location.hash = '#/courses'; return; }
    app.innerHTML = `<div class="wrap"><div class="panel center"><h2>${register ? 'Регистрация' : 'Вход'}</h2>
      <form id="f">
        ${register ? `<label>Имя</label><input name="full_name" required>
        <label>Я регистрируюсь как</label>
        <div class="row"><label class="chip on" style="margin:0"><input type="radio" name="role" value="student" checked hidden>🎓 Студент</label>
        <label class="chip" style="margin:0"><input type="radio" name="role" value="author" hidden>✍️ Автор</label></div>` : ''}
        <label>Email</label><input name="email" type="email" required>
        <label>Пароль</label><input name="password" type="password" minlength="6" required>
        <div class="err" id="err"></div>
        <button class="btn primary" style="width:100%;margin-top:16px" id="sb">${register ? 'Создать аккаунт' : 'Войти'}</button></form>
      <p class="muted" style="text-align:center">${register ? 'Уже есть аккаунт? <a href="#/login" style="color:var(--accent)">Войти</a>' : 'Нет аккаунта? <a href="#/register" style="color:var(--accent)">Регистрация</a>'}</p>
      ${register ? '' : '<p class="muted" style="font-size:12px">Демо: student@atlas.dev / student123 · author@atlas.dev / author123</p>'}</div></div>`;
    $$('input[name=role]').forEach(r => r.onchange = () => $$('.chip').forEach(c => c.classList.toggle('on', c.contains($('input[name=role]:checked')))));
    $('#f').onsubmit = async e => {
      e.preventDefault(); $('#sb').disabled = true; $('#err').textContent = '';
      const body = Object.fromEntries(new FormData(e.target));
      try { setAuth(await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body })); renderNav(); location.hash = '#/courses'; }
      catch (er) { $('#err').textContent = er.message; $('#sb').disabled = false; }
    };
  };
}

async function coursesPage() {
  if (!needAuth()) return;
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  let filter = qs.get('mine') && isAuthor() ? 'mine' : 'all', q = '', timer;
  app.innerHTML = `<div class="wrap"><div class="row"><h1 style="margin:0">Курсы</h1><span class="sp"></span>
    ${isAuthor() ? '<button class="btn primary" id="new">+ Создать курс</button>' : ''}</div>
    <div class="row" style="margin:18px 0"><input id="q" placeholder="Поиск по названию курса…" style="max-width:360px">
    <div class="chips" id="chips"></div></div><div class="grid" id="list"></div></div>`;
  const F = [['all', 'Все'], ['in_progress', 'В процессе'], ['completed', 'Завершённые']];
  if (isAuthor()) F.push(['mine', 'Мои']);
  const load = async () => {
    $('#chips').innerHTML = F.map(([k, n]) => `<span class="chip ${k === filter ? 'on' : ''}" data-k="${k}">${n}</span>`).join('');
    $$('.chip', $('#chips')).forEach(c => c.onclick = () => { filter = c.dataset.k; load(); });
    $('#list').innerHTML = '<div class="loader">Загрузка…</div>';
    try {
      const list = await api(`/courses?filter=${filter}&q=${encodeURIComponent(q)}`);
      $('#list').innerHTML = list.length ? list.map(courseCard).join('') : '<div class="empty" style="grid-column:1/-1">Ничего не найдено</div>';
      bindCards($('#list'));
    } catch (e) { $('#list').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  };
  $('#q').oninput = e => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value; load(); }, 300); };
  const nb = $('#new');
  if (nb) nb.onclick = async () => {
    const title = prompt('Название нового курса:', 'Новый курс'); if (!title) return;
    try { const c = await api('/author/courses', { method: 'POST', body: { title } }); location.hash = '#/edit/' + c.id; }
    catch (e) { toast(e.message, 'err'); }
  };
  load();
}

function firstTodo(c) {
  const all = c.modules.flatMap(m => m.items);
  return (all.find(i => !i.completed) || all[0] || {}).id;
}

async function coursePage(id) {
  if (!needAuth('Для просмотра курса нужна авторизация')) return;
  loading();
  const c = await api('/courses/' + id);
  const canOpen = c.enrolled || c.is_owner;
  const label = c.is_owner ? 'Открыть как студент' : c.progress >= 100 ? 'Пройти заново' : c.progress > 0 ? 'Продолжить курс' : (c.price > 0 ? `Купить и начать (${money(c.price)})` : 'Начать курс');
  app.innerHTML = `<div class="wrap">
    <div class="panel" style="display:grid;grid-template-columns:260px 1fr;gap:22px"><div class="cover" style="${coverStyle(c)};border-radius:12px;height:170px"></div>
      <div><div class="row"><h1 style="margin:0">${esc(c.title)}</h1><span class="badge ${c.price > 0 ? 'warn' : 'ok'}">${money(c.price)}</span></div>
      <p class="muted">Автор: ${esc(c.author_name)} · ${c.items_count} элементов · ${c.students_count} студентов</p>
      <p>${esc(c.description)}</p>
      ${canOpen && !c.is_owner ? `<div class="bar" style="margin:10px 0"><i style="width:${c.progress}%"></i></div><p class="muted">Прогресс: ${c.progress}%</p>` : ''}
      <div class="row"><button class="btn primary lg" id="go" ${c.items_count ? '' : 'disabled'}>${label}</button>
      ${c.is_owner ? `<a class="btn lg" href="#/edit/${c.id}">Редактировать</a>` : ''}</div></div></div>
    <h2 style="margin-top:30px">Программа курса</h2>
    ${c.modules.map((m, i) => `<div class="mod"><div class="mod-head"><b>${esc(m.title)}</b><span class="sp"></span><span class="muted">${m.items.filter(x => x.completed).length}/${m.items.length}</span></div>
      <div class="mod-body">${m.items.map(it => `<div class="it"><span class="tick ${it.completed ? 'done' : ''}">${it.completed ? '✓' : ''}</span>
      <span class="tag t-${it.type}">${TYPE[it.type]}</span><span>${esc(it.title)}</span></div>`).join('') || '<p class="muted">Пусто</p>'}</div></div>`).join('') || '<div class="empty">В курсе пока нет модулей</div>'}</div>`;
  $('#go').onclick = async () => {
    try {
      if (!c.enrolled && !c.is_owner) {
        if (c.price > 0 && !confirm(`Демо-оплата: списать ${c.price} ₽ за курс «${c.title}»?`)) return;
        await api(`/courses/${id}/enroll`, { method: 'POST' });
        toast('Вы записаны на курс', 'ok');
      }
      location.hash = `#/learn/${id}/${c.progress >= 100 ? c.modules[0].items[0].id : firstTodo(c)}`;
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function learnPage(cid, iid) {
  if (!needAuth()) return;
  loading();
  const c = await api('/courses/' + cid);
  if (!c.enrolled && !c.is_owner) { location.hash = '#/course/' + cid; return; }
  const flat = c.modules.flatMap(m => m.items);
  if (!flat.length) { location.hash = '#/course/' + cid; return; }
  if (!iid) { location.replace(`#/learn/${cid}/${firstTodo(c)}`); return; }
  iid = +iid;
  const item = await api('/items/' + iid);
  const idx = flat.findIndex(i => i.id === iid), next = flat[idx + 1];
  const pct = () => c.progress;
  const side = () => c.modules.map(m => `<div style="margin-top:12px"><b>${esc(m.title)}</b>${m.items.map(it => `
    <a class="it ${it.id === iid ? 'cur' : ''}" href="#/learn/${cid}/${it.id}"><span class="tick ${it.completed ? 'done' : ''}">${it.completed ? '✓' : ''}</span>
    <span class="tag t-${it.type}">${TYPE[it.type][0]}</span><span>${esc(it.title)}</span></a>`).join('')}</div>`).join('');
  const refreshSide = () => { $('#side').innerHTML = side(); $('#pb').style.width = pct() + '%'; $('#pt').textContent = pct() + '%'; };
  const mark = p => { c.progress = p; flat[idx].completed = true; refreshSide(); };
  const goNext = () => { if (next) location.hash = `#/learn/${cid}/${next.id}`; else { toast(c.progress >= 100 ? '🎉 Курс пройден!' : 'Это последний элемент', 'ok'); location.hash = '#/course/' + cid; } };

  app.innerHTML = `<div class="wrap"><a class="muted" href="#/course/${cid}">← ${esc(c.title)}</a>
    <div class="row" style="margin:8px 0 18px"><div class="bar" style="flex:1"><i id="pb" style="width:${pct()}%"></i></div><b id="pt">${pct()}%</b></div>
    <div class="learn"><aside class="panel side" id="side">${side()}</aside>
    <section class="panel content"><span class="tag t-${item.type}">${TYPE[item.type]}</span><h1 style="margin-top:8px">${esc(item.title)}</h1><div id="body"></div><div class="row" id="foot" style="margin-top:22px"></div></section></div></div>`;
  const body = $('#body'), foot = $('#foot');
  const doneBtn = () => { foot.innerHTML = `${item.completed || flat[idx].completed ? '<span class="badge ok">Пройдено ✓</span>' : ''}
      <button class="btn primary" id="nx">${next ? 'Далее →' : 'Завершить'}</button>`; $('#nx').onclick = goNext; };

  if (item.type === 'lesson' || item.type === 'video') {
    body.innerHTML = item.type === 'lesson' ? md(item.content) : videoEmbed(item.video_url) + (item.content ? md(item.content) : '');
    if (flat[idx].completed) doneBtn();
    else {
      foot.innerHTML = `<button class="btn primary" id="ok">${item.type === 'lesson' ? 'Урок пройден' : 'Видео просмотрено'}</button>`;
      $('#ok').onclick = async () => {
        try { const r = await api(`/items/${iid}/complete`, { method: 'POST' }); mark(r.progress); toast('Прогресс сохранён', 'ok'); doneBtn(); }
        catch (e) { toast(e.message, 'err'); }
      };
    }
  } else {
    body.innerHTML = `<p class="muted">Проходной балл: ${item.pass_score}%${item.score != null ? ` · Лучший результат: ${item.score}%` : ''}</p>` +
      item.questions.map((q, i) => `<div class="q" data-i="${i}"><b>${i + 1}. ${esc(q.text)}</b>${q.options.map((o, j) =>
        `<label class="opt" style="margin:0;color:var(--text);font-size:15px"><input type="radio" name="q${i}" value="${j}">${esc(o)}</label>`).join('')}</div>`).join('') || '<p class="muted">В тесте пока нет вопросов</p>';
    if (flat[idx].completed) doneBtn();
    foot.insertAdjacentHTML('afterbegin', item.questions.length ? '<button class="btn primary" id="sub">Проверить ответы</button>' : '');
    const sub = $('#sub'); if (sub) sub.onclick = async () => {
      const answers = item.questions.map((_, i) => { const r = $(`input[name=q${i}]:checked`); return r ? +r.value : -1; });
      if (answers.includes(-1)) return toast('Ответьте на все вопросы', 'err');
      try {
        const r = await api(`/items/${iid}/submit`, { method: 'POST', body: { answers } });
        $$('.q').forEach((el, i) => el.className = 'q ' + (r.results[i] ? 'ok' : 'bad'));
        if (r.passed) { mark(r.progress); toast(`Тест сдан: ${r.score}%`, 'ok'); sub.remove(); doneBtn(); }
        else toast(`Результат ${r.score}% — нужно ${r.pass_score}%. Попробуйте ещё раз`, 'err');
      } catch (e) { toast(e.message, 'err'); }
    };
  }
}

/* ---------- редактор курса (автор) ---------- */
const E = { id: 0, course: null, tab: 'struct', collapsed: new Set() };

async function editPage(id) {
  if (!needAuth()) return;
  if (!isAuthor()) { toast('Редактирование доступно только авторам', 'err'); location.hash = '#/courses'; return; }
  loading();
  if (E.id !== +id) { E.tab = 'struct'; E.collapsed = new Set(); }
  E.id = +id; E.course = await api('/author/courses/' + id);
  editRender();
}

function editRender() {
  const c = E.course;
  app.innerHTML = `<div class="wrap"><a class="muted" href="#/courses?mine=1">← Мои курсы</a>
    <div class="row" style="margin-top:8px"><h1 style="margin:0">${esc(c.title)}</h1>
      <span class="badge ${c.is_published ? 'ok' : 'warn'}">${c.is_published ? 'Опубликован' : 'Черновик'}</span><span class="sp"></span>
      <a class="btn" href="#/course/${c.id}">Просмотр</a>
      <button class="btn primary" id="pub">${c.is_published ? 'Снять с публикации' : 'Опубликовать курс'}</button>
      <button class="btn danger" id="del">Удалить курс</button></div>
    <div class="tabs">${[['struct', 'Структура'], ['settings', 'Настройки'], ['stats', 'Статистика']].map(([k, n]) => `<div class="tab ${E.tab === k ? 'on' : ''}" data-k="${k}">${n}</div>`).join('')}</div>
    <div id="tabc"></div></div>`;
  $$('.tab').forEach(t => t.onclick = () => { E.tab = t.dataset.k; editRender(); });
  $('#pub').onclick = async () => {
    try { E.course = await api(`/author/courses/${c.id}/publish`, { method: 'POST', body: { published: !c.is_published } }).then(r => ({ ...E.course, ...r })); toast(E.course.is_published ? 'Курс опубликован' : 'Курс скрыт', 'ok'); editRender(); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#del').onclick = async () => {
    if (!confirm('Удалить курс вместе со всеми модулями и прогрессом студентов?')) return;
    try { await api('/author/courses/' + c.id, { method: 'DELETE' }); toast('Курс удалён', 'ok'); location.hash = '#/courses?mine=1'; } catch (e) { toast(e.message, 'err'); }
  };
  ({ struct: tabStruct, settings: tabSettings, stats: tabStats })[E.tab]();
}

async function reloadEdit() { E.course = await api('/author/courses/' + E.id); editRender(); }

function sortable(container, childSel, onSort) {
  let dragged = null, before = '';
  const ids = () => $$(':scope > ' + childSel, container).map(e => +e.dataset.id).join(',');
  $$(':scope > ' + childSel, container).forEach(el => {
    const grip = $('.grip', el);
    grip.addEventListener('mousedown', () => el.draggable = true);
    grip.addEventListener('touchstart', () => el.draggable = true);
    el.addEventListener('dragstart', e => { e.stopPropagation(); dragged = el; before = ids(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setTimeout(() => el.classList.add('dragging'), 0); });
    el.addEventListener('dragend', e => {
      e.stopPropagation(); el.draggable = false; el.classList.remove('dragging'); dragged = null;
      const now = ids(); if (now !== before) onSort(now.split(',').map(Number));
    });
  });
  container.addEventListener('dragover', e => {
    if (!dragged || dragged.parentElement !== container) return;
    e.preventDefault(); e.stopPropagation();
    const after = $$(':scope > ' + childSel + ':not(.dragging)', container).find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (after) container.insertBefore(dragged, after); else container.append(dragged);
  });
}

function tabStruct() {
  const c = E.course;
  $('#tabc').innerHTML = `<div id="mods">${c.modules.map(m => `
    <div class="mod" data-id="${m.id}"><div class="mod-head"><span class="grip" title="Перетащить">⋮⋮</span>
      <button class="ico" data-act="toggle" data-id="${m.id}">${E.collapsed.has(m.id) ? '▸' : '▾'}</button>
      <b>${esc(m.title)}</b><span class="muted">${m.items.length} эл.</span><span class="sp"></span>
      <button class="ico" data-act="ren-mod" data-id="${m.id}" title="Переименовать">✎</button>
      <button class="ico" data-act="del-mod" data-id="${m.id}" title="Удалить">🗑</button></div>
      <div class="mod-body ${E.collapsed.has(m.id) ? 'hidden' : ''}">
        <div class="items">${m.items.map(i => `<div class="it" data-id="${i.id}"><span class="grip">⋮⋮</span><span class="tag t-${i.type}">${TYPE[i.type]}</span>
          <span>${esc(i.title)}</span>${i.type === 'test' ? `<span class="muted">(${i.questions_count} вопр.)</span>` : ''}<span class="sp"></span>
          <button class="ico" data-act="edit-item" data-id="${i.id}" data-mod="${m.id}" title="Редактировать">✎</button>
          <button class="ico" data-act="del-item" data-id="${i.id}" title="Удалить">🗑</button></div>`).join('')}</div>
        <div class="row" style="margin-top:12px">${['lesson', 'video', 'test'].map(t => `<button class="btn sm" data-act="add-item" data-mod="${m.id}" data-type="${t}">+ ${TYPE[t]}</button>`).join('')}</div>
      </div></div>`).join('') || '<div class="empty">Модулей пока нет. Добавьте первый.</div>'}</div>
    <button class="btn primary" id="addm" style="margin-top:6px">+ Добавить модуль</button>`;
  const root = $('#tabc');
  sortable($('#mods'), '.mod', async ids => { try { await api(`/author/courses/${c.id}/modules/reorder`, { method: 'POST', body: { ids } }); toast('Порядок модулей сохранён', 'ok'); await reloadEdit(); } catch (e) { toast(e.message, 'err'); reloadEdit(); } });
  $$('.items', root).forEach(box => sortable(box, '.it', async ids => {
    const mid = box.closest('.mod').dataset.id;
    try { await api(`/author/modules/${mid}/items/reorder`, { method: 'POST', body: { ids } }); toast('Порядок сохранён', 'ok'); await reloadEdit(); } catch (e) { toast(e.message, 'err'); reloadEdit(); }
  }));
  $('#addm').onclick = async () => {
    const t = prompt('Название модуля:', 'Модуль ' + (c.modules.length + 1)); if (t === null) return;
    try { await api(`/author/courses/${c.id}/modules`, { method: 'POST', body: { title: t.trim() || 'Модуль ' + (c.modules.length + 1) } }); await reloadEdit(); } catch (e) { toast(e.message, 'err'); }
  };
  root.onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const { act, id, mod, type } = b.dataset;
    try {
      if (act === 'toggle') { E.collapsed.has(+id) ? E.collapsed.delete(+id) : E.collapsed.add(+id); editRender(); }
      else if (act === 'ren-mod') {
        const m = c.modules.find(x => x.id == id); const t = prompt('Название модуля:', m.title);
        if (t && t.trim()) { await api('/author/modules/' + id, { method: 'PUT', body: { title: t.trim() } }); await reloadEdit(); }
      }
      else if (act === 'del-mod') { if (confirm('Удалить модуль со всем содержимым?')) { await api('/author/modules/' + id, { method: 'DELETE' }); await reloadEdit(); } }
      else if (act === 'del-item') { if (confirm('Удалить элемент?')) { await api('/author/items/' + id, { method: 'DELETE' }); await reloadEdit(); } }
      else if (act === 'add-item') itemModal(+mod, type);
      else if (act === 'edit-item') itemModal(+mod, null, await api('/author/items/' + id));
    } catch (er) { toast(er.message, 'err'); }
  };
}

function itemModal(mid, newType, item) {
  const type = item ? item.type : newType;
  let qs = item ? JSON.parse(JSON.stringify(item.questions)) : (type === 'test' ? [{ text: '', options: ['', ''], correct: 0 }] : []);
  const m = modal('');
  const draw = () => {
    m.firstChild.innerHTML = `<h2>${item ? 'Редактирование' : 'Новый'}: ${TYPE[type].toLowerCase()}</h2>
      <label>Название</label><input id="t" value="${esc(item ? item.title : '')}" placeholder="${TYPE[type]} ${''}">
      ${type === 'lesson' ? `<label>Текст урока (поддерживается: # заголовок, **жирный**, \`код\`, - списки, \`\`\`блок кода\`\`\`)</label><textarea id="c" style="min-height:240px">${esc(item ? item.content : '')}</textarea>` : ''}
      ${type === 'video' ? `<label>Ссылка на видео (YouTube или прямая ссылка на .mp4)</label><input id="v" value="${esc(item ? item.video_url : '')}" placeholder="https://www.youtube.com/watch?v=...">
        <label>Описание (необязательно)</label><textarea id="c" style="min-height:80px">${esc(item ? item.content : '')}</textarea>` : ''}
      ${type === 'test' ? `<label>Проходной балл, %</label><input id="ps" type="number" min="0" max="100" value="${item ? item.pass_score : 70}">
        <div id="qs">${qs.map((q, i) => `<div class="q"><div class="row"><b>Вопрос ${i + 1}</b><span class="sp"></span><button class="ico" data-rq="${i}">🗑</button></div>
          <input data-qt="${i}" value="${esc(q.text)}" placeholder="Текст вопроса">
          ${q.options.map((o, j) => `<div class="row" style="margin-top:6px;flex-wrap:nowrap"><input type="radio" name="cr${i}" data-co="${i}:${j}" ${q.correct === j ? 'checked' : ''} style="width:auto" title="Правильный ответ">
            <input data-ot="${i}:${j}" value="${esc(o)}" placeholder="Вариант ${j + 1}"><button class="ico" data-ro="${i}:${j}">✕</button></div>`).join('')}
          <button class="btn sm" data-ao="${i}" style="margin-top:8px">+ Вариант</button></div>`).join('')}</div>
        <button class="btn sm" id="aq">+ Вопрос</button>` : ''}
      <div class="err" id="er"></div>
      <div class="row" style="margin-top:18px"><button class="btn primary" id="save">Сохранить</button><button class="btn" id="cancel">Отмена</button></div>`;
    const el = m.firstChild;
    $('#cancel', el).onclick = m.close;
    if (type === 'test') {
      el.oninput = e => {
        const d = e.target.dataset;
        if (d.qt !== undefined) qs[d.qt].text = e.target.value;
        if (d.ot) { const [i, j] = d.ot.split(':'); qs[i].options[j] = e.target.value; }
      };
      el.onchange = e => { const d = e.target.dataset; if (d.co) { const [i, j] = d.co.split(':'); qs[i].correct = +j; } };
      el.onclick = e => {
        const d = e.target.dataset;
        if (e.target.id === 'aq') qs.push({ text: '', options: ['', ''], correct: 0 });
        else if (d.rq !== undefined) qs.splice(d.rq, 1);
        else if (d.ao !== undefined) qs[d.ao].options.push('');
        else if (d.ro) { const [i, j] = d.ro.split(':').map(Number); if (qs[i].options.length <= 2) return toast('Минимум 2 варианта', 'err'); qs[i].options.splice(j, 1); if (qs[i].correct >= qs[i].options.length) qs[i].correct = 0; else if (qs[i].correct > j) qs[i].correct--; }
        else return;
        const t = $('#t', el).value, ps = $('#ps', el).value; draw(); $('#t', m).value = t; $('#ps', m).value = ps;
      };
    }
    $('#save', el).onclick = async () => {
      const cnt = (E.course.modules.find(x => x.id === mid) || { items: [] }).items.length;
      const body = { type, title: $('#t', el).value.trim() || `${TYPE[type]} ${item ? '' : cnt + 1}`.trim(),
        content: $('#c', el) ? $('#c', el).value : '', video_url: $('#v', el) ? $('#v', el).value : '',
        pass_score: $('#ps', el) ? +$('#ps', el).value : 70,
        questions: qs.map(q => ({ text: q.text.trim(), options: q.options.map(o => o.trim()), correct: q.correct })) };
      if (type === 'test') {
        if (body.questions.some(q => !q.text || q.options.filter(Boolean).length < 2)) { $('#er', el).textContent = 'Заполните текст вопроса и минимум 2 варианта в каждом вопросе'; return; }
        if (body.questions.some(q => !q.options[q.correct])) { $('#er', el).textContent = 'Правильный ответ не должен быть пустым'; return; }
      }
      try {
        if (item) await api('/author/items/' + item.id, { method: 'PUT', body });
        else await api(`/author/modules/${mid}/items`, { method: 'POST', body });
        m.close(); toast('Сохранено', 'ok'); await reloadEdit();
      } catch (e) { $('#er', el).textContent = e.message; }
    };
  };
  draw();
}

function tabSettings() {
  const c = E.course;
  $('#tabc').innerHTML = `<div class="panel" style="max-width:640px"><form id="sf">
    <label>Название</label><input name="title" value="${esc(c.title)}" required>
    <label>Описание</label><textarea name="description">${esc(c.description)}</textarea>
    <label>Обложка (ссылка на изображение, необязательно)</label><input name="cover_image" value="${esc(c.cover_image)}" placeholder="https://...">
    <label>Цена, ₽ (0 — бесплатный курс)</label><input name="price" type="number" min="0" step="1" value="${c.price}">
    <div class="err" id="er"></div><button class="btn primary" style="margin-top:16px">Сохранить</button></form></div>`;
  $('#sf').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.price = +f.price || 0;
    try { const r = await api('/author/courses/' + c.id, { method: 'PUT', body: f }); E.course = { ...E.course, ...r }; toast('Настройки сохранены', 'ok'); editRender(); }
    catch (er) { $('#er').textContent = er.message; }
  };
}

async function tabStats() {
  $('#tabc').innerHTML = '<div class="loader">Загрузка…</div>';
  try {
    const s = await api(`/author/courses/${E.id}/stats`);
    $('#tabc').innerHTML = `<div class="stats">
      <div class="stat"><span class="muted">Записалось</span><b>${s.enrolled}</b></div>
      <div class="stat"><span class="muted">Начали проходить</span><b>${s.started}</b></div>
      <div class="stat"><span class="muted">Прошли до конца</span><b>${s.completed}</b></div>
      <div class="stat"><span class="muted">Средний прогресс</span><b>${s.avg_progress}%</b></div></div>
      <div class="panel"><h3>Студенты</h3>${s.students.length ? `<table><tr><th>Имя</th><th>Email</th><th>Записан</th><th style="width:200px">Прогресс</th></tr>
      ${s.students.map(x => `<tr><td>${esc(x.name)}</td><td class="muted">${esc(x.email)}</td><td class="muted">${new Date(x.enrolled_at).toLocaleDateString('ru')}</td>
      <td><div class="bar"><i style="width:${x.progress}%"></i></div><span class="muted" style="font-size:12px">${x.progress}%</span></td></tr>`).join('')}</table>` : '<p class="muted">Пока никто не записался</p>'}</div>
      <div class="panel" style="margin-top:16px"><h3>Прохождение элементов</h3>${s.items.length ? `<table><tr><th>Элемент</th><th>Тип</th><th>Прошли</th></tr>
      ${s.items.map(i => `<tr><td>${esc(i.title)}</td><td><span class="tag t-${i.type}">${TYPE[i.type]}</span></td><td>${i.done} из ${s.enrolled}</td></tr>`).join('')}</table>` : '<p class="muted">Нет элементов</p>'}</div>`;
  } catch (e) { $('#tabc').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

/* ---------- роутер ---------- */
const routes = [
  [/^\/$/, home], [/^\/login$/, authForm(false)], [/^\/register$/, authForm(true)],
  [/^\/courses(?:\?.*)?$/, coursesPage], [/^\/course\/(\d+)$/, coursePage],
  [/^\/learn\/(\d+)(?:\/(\d+))?$/, learnPage], [/^\/edit\/(\d+)$/, editPage],
];
async function router() {
  const path = location.hash.slice(1) || '/';
  renderNav(); window.scrollTo(0, 0);
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { try { await fn(...m.slice(1)); } catch (e) { app.innerHTML = `<div class="wrap"><div class="empty">${esc(e.message)}<br><br><a class="btn" href="#/courses">К курсам</a></div></div>`; } return; }
  }
  app.innerHTML = '<div class="wrap"><div class="empty">Страница не найдена<br><br><a class="btn" href="#/">На главную</a></div></div>';
}
window.addEventListener('hashchange', router);
router();
