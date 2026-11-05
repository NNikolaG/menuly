/*
 * Receipt — Bauhaus generator uzorka.
 * Čista funkcija bez zavisnosti: isti `seed` uvek daje isti uzorak (ništa se ne čuva u bazi).
 * Prenosi se 1:1 u TypeScript (Angular), Dart ili Swift.
 *
 *   generatePattern(seed, { cols, rows, big }) -> { cols, rows, cells: [{ x, y, span, kind, rot, bg, fg }] }
 *   renderPattern(el, seed, { cols, rows, cell, big })   // crta u postojeći element (klase iz bundle.css)
 *
 * Seme (seed) je uvek nešto što aplikacija već ima: naziv lokala, naziv kategorije, broj porudžbine,
 * lokal + datum. Nikad nasumično pri svakom učitavanju.
 */
(function (root) {
  var INK = 'var(--brand-ink)';
  var PAPER = 'var(--brand-paper)';
  var ACCENTS = ['var(--brand-orange)', 'var(--brand-amber)', 'var(--brand-periwinkle)', 'var(--brand-cobalt)', 'var(--brand-pink)'];
  var KINDS = [['qtr', 3], ['half', 2.5], ['circle', 2], ['tri', 1.2], ['dots', 0.8], ['bars', 0.8], ['solid', 1]];
  var BIG_KINDS = ['qtr', 'half', 'circle', 'qtr'];

  // seed (string) -> 32-bit broj, FNV-1a
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // deterministički generator brojeva 0..1 (mulberry32)
  function rng(seedNum) {
    var a = seedNum;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function weighted(rnd, pairs) {
    var tot = 0, i; for (i = 0; i < pairs.length; i++) tot += pairs[i][1];
    var r = rnd() * tot;
    for (i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r <= 0) return pairs[i][0]; }
    return pairs[0][0];
  }

  function generatePattern(seed, opts) {
    opts = opts || {};
    var cols = Math.max(1, opts.cols || 8), rows = Math.max(1, opts.rows || 4);
    var allowBig = opts.big !== false;
    var rnd = rng(hash(String(seed || '')));
    var pick = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };

    // svaki seed bira svoja 3 od 5 akcenata -> lokali se razlikuju i po boji, ne samo po oblicima
    var acc = ACCENTS.slice();
    for (var i = acc.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = acc[i]; acc[i] = acc[j]; acc[j] = t; }
    acc = acc.slice(0, 3);
    var bgPool = [[INK, 4], [PAPER, 1.5], [acc[0], 2], [acc[1], 1.5], [acc[2], 1]];
    var fgFor = function (bg) {
      var opts2 = [INK, PAPER].concat(acc).filter(function (c) { return c !== bg; });
      return pick(opts2);
    };

    var occ = [];
    for (var r0 = 0; r0 < rows; r0++) { occ.push([]); for (var c0 = 0; c0 < cols; c0++) occ[r0].push(false); }
    var cells = [];
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        if (occ[y][x]) continue;
        var span = 1;
        if (allowBig && x + 1 < cols && y + 1 < rows && !occ[y][x + 1] && !occ[y + 1][x] && !occ[y + 1][x + 1] && rnd() < 0.14) span = 2;
        for (var dy = 0; dy < span; dy++) for (var dx = 0; dx < span; dx++) occ[y + dy][x + dx] = true;
        var bg = weighted(rnd, bgPool);
        var fg = fgFor(bg);
        var kind = span === 2 ? pick(BIG_KINDS) : weighted(rnd, KINDS);
        cells.push({ x: x, y: y, span: span, kind: kind, rot: Math.floor(rnd() * 4), bg: bg, fg: fg });
      }
    }
    return { cols: cols, rows: rows, cells: cells };
  }

  function renderPattern(el, seed, opts) {
    opts = opts || {};
    var p = generatePattern(seed, opts);
    var cell = opts.cell || 48;
    el.classList.add('r-pattern');
    el.style.setProperty('--cols', p.cols);
    el.style.setProperty('--rows', p.rows);
    el.style.setProperty('--cell', cell + 'px');
    el.setAttribute('aria-hidden', 'true');
    el.textContent = '';
    p.cells.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'r-pattern__cell k-' + c.kind + ' rot-' + c.rot;
      d.style.gridColumn = (c.x + 1) + ' / span ' + c.span;
      d.style.gridRow = (c.y + 1) + ' / span ' + c.span;
      d.style.setProperty('--bg', c.bg);
      d.style.setProperty('--fg', c.fg);
      el.appendChild(d);
    });
    return p;
  }

  // pomoćnik za preview: <div data-pattern="Kafana Mornar" data-cols="8" data-rows="4" data-cell="48" data-big="false">
  function renderAll(scope) {
    (scope || document).querySelectorAll('[data-pattern]').forEach(function (el) {
      renderPattern(el, el.getAttribute('data-pattern'), {
        cols: +el.getAttribute('data-cols') || 8,
        rows: +el.getAttribute('data-rows') || 4,
        cell: +el.getAttribute('data-cell') || 48,
        big: el.getAttribute('data-big') !== 'false'
      });
    });
  }

  root.ReceiptPattern = { generatePattern: generatePattern, renderPattern: renderPattern, renderAll: renderAll, hash: hash };
})(typeof window !== 'undefined' ? window : this);
