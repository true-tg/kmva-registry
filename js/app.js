const C = window.APP_CONFIG;
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('uk-UA', {day:'2-digit', month:'2-digit', year:'numeric'});
const statusLabel = s => s === 'active' ? 'Чинний' : 'Втратив чинність';
const actTitle = a => `${C.TYPES[a.act_type] || ''} № ${a.number} «${a.title}»`;
const qs = k => new URLSearchParams(location.search).get(k);

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
  document.getElementById('top').innerHTML = `
    <div class="top-inner">
      <img src="assets/coa.webp" alt="Герб міста Києва" class="coa">
      <div class="top-title">${esc(C.SITE_TITLE)}</div>
    </div>
    <div class="top-line"></div>`;
  const link = (href, text, key) => `<a href="${href}" class="${active === key ? 'on' : ''}">${text}</a>`;
  const canEdit = profile && ['editor', 'admin'].includes(profile.role);
  document.getElementById('side').innerHTML = `
    <nav>
      ${link('index.html', 'Усі акти', 'all')}
      ${link('index.html?type=order', 'Розпорядження', 'order')}
      ${link('index.html?type=ksoy', 'Рішення Комітету стратегічної оборони', 'ksoy')}
      ${canEdit ? link('admin.html', '<span class="ico ico-add" aria-hidden="true"></span>Створити акт', 'admin') : ''}
      ${profile ? `<span class="who"><span class="ico ico-user" aria-hidden="true"></span>${esc(profile.full_name || '')}</span><a href="#" id="logout">Вийти</a>` : ''}
    </nav>`;
  const lo = document.getElementById('logout');
  if (lo) lo.onclick = async e => { e.preventDefault(); await sb.auth.signOut(); location.href = 'index.html'; };
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
