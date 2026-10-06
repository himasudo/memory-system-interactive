/* ======================= atlas: every plate on one page ======================= */
App.chapter({id: 'atlas', ref: true, group: 'Reference', short: 'Atlas', title: 'Memory Systems Atlas',
lede: 'Detailed mechanism plates with explicit teaching parameters, followed by scoped implementation schematics.',
points: ['The tabs above each plate frame one part of it; focus canvas fills the screen.', 'Each plate is the same drawing its chapter steps through.'],
build: function(root){
  var h = App.h;
  [['dram', 'Inside one DDR4 chip', 'Address bits to subarrays and capacitors, then the command and data bus.'],
   ['l1d', 'The L1d arrays, to scale', 'Chosen 32 KiB / 8-way geometry; parallel tag lookup and selected-way output.'],
   ['xlate', 'The page walk, bit by bit', 'x86-64, 48-bit VA, four levels, 4 KiB pages; synthetic entry addresses.'],
   ['core', 'Finite-resource core, entry by entry', 'Model capacities drawn from the pipeline engine; selected loop allocations.'],
   ['e2e', 'One hist[123]++ on one time axis', 'Every stage of the critical path to scale, then the first cycles magnified.']
  ].forEach(function(p){
    var sec = h('div', {'class': 'p-sec', 'data-sec': p[0], 'data-title': p[1], 'data-copy': p[2]}, root);
    App.Plates[p[0]](sec);
    var b = h('button', {'class': 'ghost', type: 'button', style: 'margin-top:10px'}, sec, 'step through it in [[ch:' + p[0] + ']] \u2192');
    b.onclick = function(){ App.go(p[0]); };
  });  App.Implementations.cases.forEach(function(c){var sec=App.labSection(root,c.id,c.title,c.choice);App.CaseStudies.draw(sec,c);App.LabUI.text('a',sec,'Evidence, prediction and experiment →',{href:'#map/'+c.id});});

}});
