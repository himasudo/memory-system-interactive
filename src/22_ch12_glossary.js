/* ======================= chapter: glossary ======================= */
App.chapter({id: 'gloss', num: '12', short: 'Glossary', title: 'Glossary',
sub: 'Every term used in these chapters, the same definitions the dotted terms open.',
build: function(root){
  var h = App.h;
  var bar = h('div', {'class': 'stp'}, root);
  var q = h('input', {type: 'search', placeholder: 'filter terms\u2026', style: 'flex:1;max-width:420px', 'aria-label': 'filter glossary'}, bar);
  var cnt = h('span', {'class': 'note'}, bar);
  var list = h('div', {'class': 'glist'}, root);
  var keys = Object.keys(App.G).sort(function(a, b){ return App.G[a].t.toLowerCase().localeCompare(App.G[b].t.toLowerCase()); });
  function draw(){
    var f = q.value.trim().toLowerCase(), n = 0;
    list.innerHTML = keys.filter(function(k){ var e = App.G[k]; return !f || e.t.toLowerCase().indexOf(f) >= 0 || e.d.toLowerCase().indexOf(f) >= 0; })
      .map(function(k){ n++; var e = App.G[k]; return '<div class="card"><h3>' + e.t + '</h3><p>' + e.d + '</p></div>'; }).join('');
    cnt.textContent = n + ' of ' + keys.length + ' terms';
  }
  q.oninput = draw; draw();
}});
