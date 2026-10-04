/*
 * Aplica as preferências de exibição antes da primeira pintura (evita o flash
 * de tema). É também a fonte única dos padrões: sem escolha salva, segue o
 * sistema operacional. O PreferenciasProvider (src/lib/preferencias.tsx) lê
 * estes atributos ao iniciar.
 */
(function () {
  var p = {};
  try {
    p = JSON.parse(localStorage.getItem('folha:preferencias') || '{}') || {};
  } catch (e) {}
  var mq = function (q) {
    return window.matchMedia(q).matches;
  };
  var r = document.documentElement;
  r.dataset.tema = p.tema || (mq('(prefers-color-scheme: light)') ? 'claro' : 'escuro');
  r.dataset.fonte = p.fonte || 'm';
  r.dataset.contraste =
    p.altoContraste === true || (p.altoContraste == null && mq('(prefers-contrast: more)'))
      ? 'alto'
      : 'normal';
  r.dataset.movimento =
    p.reduzirMovimento === true ||
    (p.reduzirMovimento == null && mq('(prefers-reduced-motion: reduce)'))
      ? 'reduzido'
      : 'normal';
})();
