/* progressive enhancement for public pages: theme toggle, reveal on scroll, tag filter */
(function () {
  var doc = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
    var sync = function () { b.setAttribute('aria-label', doc.dataset.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'); };
    sync();
    b.addEventListener('click', function () {
      doc.dataset.theme = doc.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('vie-theme', doc.dataset.theme); } catch (e) {}
      document.querySelectorAll('[data-theme-toggle]').forEach(function (o) { o.setAttribute('aria-label', b.getAttribute('aria-label')); });
    });
  });

  var rev = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) rev.forEach(function (e) { e.classList.add('in'); });
  else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    rev.forEach(function (e) { io.observe(e); });
  }

  document.querySelectorAll('[data-filter-group]').forEach(function (g) {
    var list = document.querySelector(g.getAttribute('data-filter-group'));
    var count = document.querySelector('[data-filter-count]');
    g.querySelectorAll('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-filter'), n = 0;
        g.querySelectorAll('[data-filter]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        list.querySelectorAll('[data-tags]').forEach(function (it) {
          var show = f === 'all' || it.getAttribute('data-tags').split('|').indexOf(f) > -1;
          it.hidden = !show; if (show) n++;
        });
        if (count) count.textContent = n + (n === 1 ? ' project' : ' projects');
      });
    });
  });

  /* story: embed placeholders open the video in a new tab */
  document.querySelectorAll('.rt .embed').forEach(function (a) { if (a.getAttribute('href') && a.getAttribute('href') !== '#') a.target = '_blank', a.rel = 'noopener noreferrer'; });
})();
