(function () {
  var d = document.documentElement;
  d.classList.add('js');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  try {
    if (sessionStorage.getItem('xlmnr-pl')) d.classList.add('pl-skip');
    else sessionStorage.setItem('xlmnr-pl', '1');
  } catch (e) { /* storage blocked: show preloader */ }
})();
