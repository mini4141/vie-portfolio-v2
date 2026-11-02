/* runs before first paint (no flash of the wrong theme); kept as a file so the CSP needs no inline scripts */
(function () {
  var d = document.documentElement, t = null, def = d.getAttribute('data-default-theme');
  d.classList.add('js');
  try { t = localStorage.getItem('vie-theme'); } catch (e) {}
  d.dataset.theme = t || (def === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : (def === 'dark' ? 'dark' : 'light'));
})();
