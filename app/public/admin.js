/* admin enhancements: sign-out, locked controls, project list (search, filter, feature, duplicate, delete, reorder) */
(function () {
  var toastTimer;
  var toast = function (m) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = m; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  };

  async function call(method, url, body) {
    try {
      var r = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) { toast(data.message || 'Something went wrong. Please try again.'); return null; }
      return data;
    } catch (e) { toast('Can’t reach the server. Check your connection.'); return null; }
  }

  var out = document.getElementById('out');
  if (out) out.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; });

  /* session ended (guest hour up, or owner signed out elsewhere): go to sign-in with a friendly note */
  var ended = false;
  function sessionEnded() {
    if (ended) return; ended = true;
    try { sessionStorage.removeItem('vie-guest-seen'); } catch (e) {}
    toast('Your session has ended. Taking you to sign in…');
    setTimeout(function () { location.href = '/admin/signin?expired=1'; }, 1200);
  }
  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    return nativeFetch.apply(this, arguments).then(function (r) {
      var u = typeof input === 'string' ? input : (input && input.url) || '';
      if (r.status === 401 && u.indexOf('/api/') > -1 && u.indexOf('/api/auth/') < 0) sessionEnded();
      return r;
    });
  };

  /* guest: welcome note once per visit, countdown in the banner */
  var dlg = document.querySelector('dialog[data-guest-note]');
  if (dlg && dlg.showModal) {
    var seen = false;
    try { seen = !!sessionStorage.getItem('vie-guest-seen'); sessionStorage.setItem('vie-guest-seen', '1'); } catch (e) {}
    if (!seen) dlg.showModal();
  }
  var timer = document.querySelector('[data-guest-timer]');
  if (timer) {
    var end = Number(timer.getAttribute('data-expires')) || Date.now() + 3600000;
    var tick = function () {
      var left = end - Date.now();
      if (left <= 0) { timer.textContent = 'Ended'; sessionEnded(); return; }
      var m = Math.ceil(left / 60000);
      timer.textContent = m <= 1 ? 'Ends in under a minute' : 'Ends in ' + m + ' min';
    };
    tick(); setInterval(tick, 15000);
  }
  document.querySelectorAll('[data-leave-guest]').forEach(function (a) {
    a.addEventListener('click', async function (e) {
      e.preventDefault();
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (x) {}
      location.href = '/';
    });
  });

  document.querySelectorAll('[data-locked]').forEach(function (b) {
    b.setAttribute('aria-disabled', 'true');
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toast('Saving is turned off in guest mode.'); });
  });
  document.querySelectorAll('[data-soon]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); toast('That screen is coming soon.'); });
  });
  document.querySelectorAll('dialog [data-close]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });

  /* search + status filter */
  var rows = document.querySelector('[data-rows]');
  if (!rows) return;
  var search = document.querySelector('[data-search]'), status = 'all';
  function apply() {
    var q = search.value.trim().toLowerCase(), n = 0;
    rows.querySelectorAll('[data-row]').forEach(function (r) {
      var ok = r.textContent.toLowerCase().indexOf(q) > -1 && (status === 'all' || r.getAttribute('data-row') === status);
      r.hidden = !ok; if (ok) n++;
    });
    document.querySelector('[data-search-empty]').style.display = n ? 'none' : 'block';
  }
  search.addEventListener('input', apply);
  document.querySelectorAll('[data-status]').forEach(function (b) {
    b.addEventListener('click', function () {
      status = b.getAttribute('data-status');
      document.querySelectorAll('[data-status]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      apply();
    });
  });

  if (document.getElementById('main').dataset.role !== 'owner') return;

  /* new project */
  var newDlg = document.getElementById('new-dlg'), newErr = document.getElementById('new-err');
  document.querySelectorAll('[data-new-project]').forEach(function (b) {
    b.addEventListener('click', function () { newErr.classList.remove('show'); newDlg.showModal(); document.getElementById('new-title').focus(); });
  });
  document.getElementById('new-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var r = await call('POST', '/api/projects', { title: document.getElementById('new-title').value });
    if (r) location.href = '/admin/projects/' + r.project.id;
  });

  /* row actions */
  var delDlg = document.getElementById('del-dlg'), delId = null;
  rows.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var tr = b.closest('[data-row]'), id = tr.getAttribute('data-id');
    if (b.dataset.act === 'feature') {
      var on = b.getAttribute('aria-pressed') !== 'true';
      if (!(await call('PATCH', '/api/projects/' + id, { featured: on }))) return;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Remove from featured' : 'Feature on landing page');
      b.firstElementChild.textContent = on ? '★' : '☆';
      tr.querySelector('[data-feat-badge]').hidden = !on;
      toast(on ? 'Featured on the landing page.' : 'Removed from the landing page.');
    } else if (b.dataset.act === 'duplicate') {
      if (await call('POST', '/api/projects/' + id + '/duplicate')) location.reload();
    } else if (b.dataset.act === 'delete') {
      delId = id;
      document.getElementById('del-msg').textContent = '“' + tr.dataset.title + '” will be removed for good. This can’t be undone.';
      delDlg.showModal();
    }
  });
  document.getElementById('del-yes').addEventListener('click', async function () {
    delDlg.close();
    if (await call('DELETE', '/api/projects/' + delId)) location.reload();
  });

  /* drag to reorder (sends the full id list) */
  var drag = null;
  rows.addEventListener('dragstart', function (e) {
    drag = e.target.closest('[data-row]');
    if (drag) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.dataset.id); drag.style.opacity = '.4'; }
  });
  rows.addEventListener('dragover', function (e) {
    if (!drag) return;
    e.preventDefault();
    var over = e.target.closest('[data-row]');
    if (!over || over === drag) return;
    var after = e.clientY > over.getBoundingClientRect().top + over.offsetHeight / 2;
    rows.insertBefore(drag, after ? over.nextSibling : over);
  });
  rows.addEventListener('dragend', async function () {
    if (!drag) return;
    drag.style.opacity = ''; drag = null;
    var ids = Array.prototype.map.call(rows.querySelectorAll('[data-row]'), function (r) { return Number(r.dataset.id); });
    if (await call('POST', '/api/projects/reorder', { ids: ids })) toast('Order saved.');
  });
})();
