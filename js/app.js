const C = window.APP_CONFIG;
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('uk-UA', {day:'2-digit', month:'2-digit', year:'numeric'});
const fmtDateTime = s => new Date(s).toLocaleString('uk-UA', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
const isScheduled = a => !!(a && a.publish_at && new Date(a.publish_at) > new Date());
const statusLabel = s => s === 'active' ? 'Чинний' : 'Втратив чинність';
const actTitle = a => `${C.TYPES[a.act_type] || ''} № ${a.number} «${a.title}»`;
const qs = k => new URLSearchParams(location.search).get(k);
const fmtLong = d => new Date(d + 'T00:00:00').toLocaleDateString('uk-UA', {day:'numeric', month:'long', year:'numeric'}).replace(/\s*р\.?$/, '') + ' р.';
const GEN = { order: 'розпорядження', ksoy: 'рішення Комітету стратегічної оборони Києва' };
const DOC_ORG = C.DOC_ORG || 'Київська міська військова адміністрація';
const DOC_CITY = C.DOC_CITY || 'Київ';
// Режим перегляду для громадян (лише попередній перегляд, зберігається на час сесії браузера)
function isPublic() { try { return sessionStorage.getItem('viewMode') === 'public'; } catch (e) { return false; } }
function setViewMode(m) { try { sessionStorage.setItem('viewMode', m); } catch (e) {} location.reload(); }

// Автоочищення стилів Word: лишаються лише <p>, <br>, b/i/u, списки
const ALLOWED = { ALLOWED_TAGS: ['p','br','b','strong','i','em','u','ul','ol','li'], ALLOWED_ATTR: [] };
function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style,script,meta,link,xml,title').forEach(e => e.remove());
  doc.body.querySelectorAll('div,h1,h2,h3,h4,h5,h6,tr,blockquote,pre').forEach(el => {
    const p = doc.createElement('p'); p.innerHTML = el.innerHTML; el.replaceWith(p);
  });
  return DOMPurify.sanitize(doc.body.innerHTML, ALLOWED)
    .replace(/\u00a0|&nbsp;/g, ' ')
    .replace(/<p>(\s|<br>)*<\/p>/gi, '')
    .trim();
}
const safeBody = html => DOMPurify.sanitize(html, ALLOWED);

function buildShell(active, profile) {
  const pub = !!profile && isPublic();
  const canEdit = !!profile && !pub && ['editor', 'admin'].includes(profile.role);
  const title = C.HEADER_TITLE || 'Єдиний реєстр актів';
  const sub = C.HEADER_SUBTITLE || 'начальника Київської міської військової адміністрації — голови КМДА';
  const m = (href, text, key) => `<a href="${href}" class="${active === key ? 'on' : ''}">${text}</a>`;
  const hdr = document.getElementById('top');

  // смуга режиму перегляду для громадян
  const oldPv = document.getElementById('pv'); if (oldPv) oldPv.remove();
  if (pub) {
    const pv = document.createElement('div'); pv.id = 'pv';
    pv.innerHTML = `<span class="ico ico-eye" aria-hidden="true"></span><span>Режим перегляду для громадян: так сторінку бачитимуть відвідувачі сайту</span><button class="btn" id="pvExit" type="button">Повернутися до режиму співробітника</button>`;
    hdr.before(pv);
    document.getElementById('pvExit').onclick = () => setViewMode('staff');
  }

  hdr.innerHTML = `
    <div class="hd">
      <div class="hd-row">
        <div class="hd-brand"><span class="hd-flag"></span><div><b>КМВА · КМДА</b><span>${pub ? 'Офіційний вебсайт' : 'Система внутрішнього користування'}</span></div></div>
        <a class="hd-main" href="index.html">
          <img src="assets/coa.webp" alt="Герб міста Києва" class="coa">
          <span class="hd-title">${esc(title)}</span>
          <span class="hd-sub">${esc(sub)}</span>
        </a>
        <ul class="hd-actions">${profile && !pub ? `
          <li><span class="ico ico-user" aria-hidden="true"></span>${esc(profile.full_name || '')}</li>
          <li><a href="#" id="pvOn"><span class="ico ico-eye" aria-hidden="true"></span>Публічний перегляд</a></li>
          <li><a href="#" id="logout"><span class="ico ico-arrow" aria-hidden="true"></span>Вийти</a></li>` : ''}</ul>
      </div>
    </div>`;

  // закріплена смуга меню
  let bar = document.getElementById('bar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'bar'; hdr.after(bar); }
  bar.innerHTML = profile ? `
    <div class="hd"><div class="hd-bottom">
      <nav class="hd-menu" aria-label="Основне меню">
        ${m('index.html', 'Усі акти', 'all')}
        ${m('index.html?type=order', 'Розпорядження', 'order')}
        ${m('index.html?type=ksoy', 'Рішення Комітету стратегічної оборони', 'ksoy')}
        ${canEdit ? m('admin.html', '<span class="ico ico-add" aria-hidden="true"></span>Створити акт', 'admin') : ''}
      </nav>
      <a class="hd-search" id="hdSearch" href="index.html?focus=search"><span class="ico ico-search" aria-hidden="true"></span>Пошук</a>
    </div></div>` : '';

  const ft = document.querySelector('footer');
  if (ft) ft.textContent = pub ? 'Офіційний вебсайт' : 'Система внутрішнього користування';

  const lo = document.getElementById('logout');
  if (lo) lo.onclick = async e => { e.preventDefault(); await sb.auth.signOut(); location.href = 'index.html'; };
  const on = document.getElementById('pvOn');
  if (on) on.onclick = e => { e.preventDefault(); setViewMode('public'); };
  const hs = document.getElementById('hdSearch');
  if (hs) hs.onclick = e => { const q = document.getElementById('q'); if (q) { e.preventDefault(); q.focus(); } };
}

function showLogin() {
  document.getElementById('content').innerHTML = `
    <h1 class="page-h">Вхід до реєстру</h1>
    <p class="muted">Система внутрішнього користування. Увійдіть за обліковим записом, виданим адміністратором.</p>
    <form id="loginForm" class="form narrow">
      <label>Електронна пошта<input type="email" id="em" required autocomplete="username"></label>
      <label>Пароль<input type="password" id="pw" required autocomplete="current-password"></label>
      <div id="err" class="err"></div>
      <button class="btn" type="submit">Увійти</button>
    </form>`;
  document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value });
    if (error) document.getElementById('err').textContent = 'Невірна пошта або пароль.';
    else location.reload();
  };
}

// Спільна ініціалізація сторінки. Повертає {session, profile} або null (якщо показано форму входу)
async function initPage(active) {
  buildShell(active, null);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showLogin(); return null; }
  const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  const prof = profile || { full_name: session.user.email, role: 'reader' };
  buildShell(active, prof);
  return { session, profile: prof };
}
