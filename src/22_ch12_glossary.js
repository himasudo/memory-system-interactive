/* ======================= chapter: glossary ======================= */
App.chapter({id: 'gloss', ref: true, short: 'Glossary', title: 'Glossary',
lede: 'Every term on this site: what it means, where it is explained, and where to read more.',
build: function(root){
  var h = App.h, G = App.G;
  var keys = Object.keys(G).sort(function(a, b){ return G[a].t.toLowerCase().localeCompare(G[b].t.toLowerCase()); });
  var CATS = [['all', 'All']].concat(['basics', 'core', 'xlate', 'cache', 'memory', 'order', 'coh', 'pref', 'io'].map(function(c){ return [c, App.TERM_LABEL[c]]; }));
  var count = {all: keys.length}; keys.forEach(function(k){ var c = App.termCategory(k); count[c] = (count[c] || 0) + 1; });
  var bar = h('div', {'class': 'gl-bar'}, root);
  var q = h('input', {type: 'search', placeholder: 'Search ' + keys.length + ' terms and definitions\u2026', 'aria-label': 'Search the glossary'}, bar);
  var cnt = h('span', {'class': 'note'}, bar);
  var chips = h('div', {'class': 'gl-chips', role: 'group', 'aria-label': 'Filter by category'}, root);
  var list = h('div', {'class': 'glist'}, root);
  var cat = 'all', btns = {};
  function esc(x){ return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  CATS.forEach(function(c){
    var b = h('button', {type: 'button', 'class': 'gl-chip term-' + c[0] + (c[0] === 'all' ? ' on' : ''), 'aria-pressed': c[0] === 'all' ? 'true' : 'false'}, chips, c[1] + ' <small>' + (count[c[0]] || 0) + '</small>');
    b.onclick = function(){ cat = c[0]; for (var k in btns){ btns[k].classList.toggle('on', k === cat); btns[k].setAttribute('aria-pressed', k === cat ? 'true' : 'false'); } draw(); };
    btns[c[0]] = b;
  });
  function card(k){
    var e = G[k], c = App.termCategory(k), home = App.TERM_HOME[k], lab = App.CH_LABEL[home], src = App.SRC[k] || [];
    var foot = (lab ? '<a class="term-pop-ch" href="#' + home + '"><span>Taught in</span><b>' + lab[0] + ' \u00b7 ' + lab[1] + '</b><i aria-hidden="true">\u2192</i></a>' : '') +
      (src.length ? '<div class="term-pop-src"><span>Learn more</span>' + src.map(function(x){ return '<a href="' + esc(x[1]) + '" target="_blank" rel="noopener noreferrer"><b>' + esc(x[0]) + '</b><small>' + esc(x[2]) + ' \u2197</small></a>'; }).join('') + '</div>' : '');
    return '<article class="card gl-card term-' + c + '"><span class="term-pop-cat">' + App.TERM_LABEL[c] + '</span><h3>' + e.t + '</h3><p>' + e.d + '</p>' + (foot ? '<div class="term-pop-foot">' + foot + '</div>' : '') + '</article>';
  }
  function draw(){
    var f = q.value.trim().toLowerCase();
    var shown = keys.filter(function(k){ var e = G[k]; return (cat === 'all' || App.termCategory(k) === cat) && (!f || e.t.toLowerCase().indexOf(f) >= 0 || e.d.toLowerCase().indexOf(f) >= 0); });
    list.innerHTML = shown.length ? shown.map(card).join('') : '<div class="gl-empty">No term matches \u201c' + esc(q.value) + '\u201d' + (cat !== 'all' ? ' in ' + App.TERM_LABEL[cat] : '') + '.</div>';
    cnt.textContent = shown.length + ' of ' + keys.length + ' terms';
  }
  q.oninput = draw; draw();
}});
