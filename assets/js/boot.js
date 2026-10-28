(function () {
  var d = document.documentElement;
  d.classList.add('js');
  // Opened inside the site viewer (iframe): documents show only their text.
  if (window.self !== window.top) d.classList.add('is-embedded');
  // Device tier for CSS: low = save-data / 2G / ≤2 cores / ≤2 GB; high = 8+ cores.
  var n = navigator, c = n.connection || {}, cores = n.hardwareConcurrency || 4, mem = n.deviceMemory || 4;
  d.setAttribute('data-tier', c.saveData || /2g/.test(c.effectiveType || '') || cores <= 2 || mem <= 2 ? 'low' : cores >= 8 ? 'high' : 'mid');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  try {
    if (sessionStorage.getItem('xlmnr-pl')) d.classList.add('pl-skip');
    else { sessionStorage.setItem('xlmnr-pl', '1'); d.classList.add('pl-on'); }
  } catch (e) { d.classList.add('pl-on'); /* storage blocked: show preloader */ }
})();
