// Порівняння двох версій акта: поля + текст (по абзацах і по словах)
window.ActDiff = (function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function paras(html) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    doc.querySelectorAll('br').forEach(b => b.replaceWith(' '));
    let out = [...doc.body.querySelectorAll('p,li')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!out.length) out = (doc.body.textContent || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    return out;
  }

  // найдовша спільна підпослідовність → список {t:'=' | '-' | '+', v}
  function diffSeq(a, b) {
    const n = a.length, m = b.length;
    let s = 0; while (s < n && s < m && a[s] === b[s]) s++;
    let e = 0; while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++;
    const A = a.slice(s, n - e), B = b.slice(s, m - e), out = [];
    for (let i = 0; i < s; i++) out.push({ t: '=', v: a[i] });
    if (A.length * B.length > 4e6) {
      A.forEach(v => out.push({ t: '-', v })); B.forEach(v => out.push({ t: '+', v }));
    } else {
      const N = A.length, M = B.length;
      const L = Array.from({ length: N + 1 }, () => new Uint32Array(M + 1));
      for (let i = N - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--)
        L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      let i = 0, j = 0;
      while (i < N && j < M) {
        if (A[i] === B[j]) { out.push({ t: '=', v: A[i] }); i++; j++; }
        else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: '-', v: A[i++] });
        else out.push({ t: '+', v: B[j++] });
      }
      while (i < N) out.push({ t: '-', v: A[i++] });
      while (j < M) out.push({ t: '+', v: B[j++] });
    }
    for (let k = e; k > 0; k--) out.push({ t: '=', v: a[n - k] });
    return out;
  }

  // зливає сусідні однакові токени у суцільні <ins>/<del>
  function renderWords(ops) {
    let html = '', cur = null, buf = '';
    const flush = () => { if (!buf) return; html += cur === '-' ? `<del>${esc(buf)}</del>` : cur === '+' ? `<ins>${esc(buf)}</ins>` : esc(buf); buf = ''; };
    for (const o of ops) { if (o.t !== cur) { flush(); cur = o.t; } buf += o.v; }
    flush(); return html;
  }

  function wordDiff(x, y) {
    const ta = x.split(/(\s+)/).filter(Boolean), tb = y.split(/(\s+)/).filter(Boolean);
    const ops = diffSeq(ta, tb);
    const same = ops.filter(o => o.t === '=' && /\S/.test(o.v)).length;
    const total = Math.max(ta.filter(t => /\S/.test(t)).length, tb.filter(t => /\S/.test(t)).length) || 1;
    return { ratio: same / total, html: renderWords(ops) };
  }

  function bodyDiff(oldHtml, newHtml) {
    const ops = diffSeq(paras(oldHtml), paras(newHtml));
    const st = { added: 0, removed: 0, changed: 0 };
    let html = '', D = [], I = [];
    const flushHunk = () => {
      const mods = [], dels = [], adds = [];
      let di = 0;
      for (const ins of I) {
        let paired = false;
        if (di < D.length) {
          const w = wordDiff(D[di], ins);
          if (w.ratio >= 0.4) { mods.push(w.html); di++; paired = true; }
        }
        if (!paired) adds.push(ins);
      }
      for (; di < D.length; di++) dels.push(D[di]);
      mods.forEach(h => { html += `<p class="df-mod">${h}</p>`; st.changed++; });
      dels.forEach(t => { html += `<p class="df-del"><del>${esc(t)}</del></p>`; st.removed++; });
      adds.forEach(t => { html += `<p class="df-add"><ins>${esc(t)}</ins></p>`; st.added++; });
      D = []; I = [];
    };
    for (const o of ops) {
      if (o.t === '=') { flushHunk(); html += `<p class="df-same">${esc(o.v)}</p>`; }
      else if (o.t === '-') D.push(o.v); else I.push(o.v);
    }
    flushHunk();
    return { html, st };
  }

  function compare(o, n) {
    const C = window.APP_CONFIG;
    const F = [
      ['act_type', 'Вид акта', v => C.TYPES[v] || v],
      ['number', 'Номер', v => v],
      ['act_date', 'Дата', v => v ? fmtDate(v) : ''],
      ['status', 'Статус', v => statusLabel(v)],
      ['title', 'Назва', v => v],
      ['signer', 'Підпис', v => v],
      ['publish_at', 'Час публікації', v => v ? fmtDateTime(v) : ''],
    ];
    const meta = F.filter(([k]) => (o[k] ?? '') !== (n[k] ?? '') && !(k === 'publish_at' && String(o[k]).slice(0, 16) === String(n[k]).slice(0, 16)))
      .map(([k, label, f]) => `<li><b>${label}:</b> <del>${esc(f(o[k]))}</del> → <ins>${esc(f(n[k]))}</ins></li>`);
    const b = bodyDiff(o.body, n.body);
    const noChange = !meta.length && !b.st.added && !b.st.removed && !b.st.changed;
    return `
      <p class="df-sum">Версія ${o.version_no} → версія ${n.version_no}. ${noChange
        ? 'Змін у тексті та полях немає (можливі лише зміни форматування).'
        : `Змінено полів: <b>${meta.length}</b>. Абзаци: змінено <b>${b.st.changed}</b>, додано <b>${b.st.added}</b>, видалено <b>${b.st.removed}</b>.`}</p>
      <p class="df-legend"><ins>додано</ins> <del>видалено</del></p>
      ${meta.length ? `<ul class="df-meta">${meta.join('')}</ul>` : ''}
      <div class="diff-body">${b.html || '<p class="muted">Текст порожній.</p>'}</div>`;
  }
  return { compare };
})();
