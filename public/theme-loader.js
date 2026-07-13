(function () {
  const theme = localStorage.getItem('basilico-theme') || 'sage-green';
  document.documentElement.setAttribute('data-theme', theme);
})();
