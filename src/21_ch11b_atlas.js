/* ======================= atlas: every plate on one page ======================= */
App.chapter({id: 'atlas', ref: true, group: 'Reference', short: 'Atlas', title: 'Hardware atlas',
lede: 'Every full-width plate from the chapters on one page: the real structures, drawn to scale where the size is the point.',
points: ['The tabs above each plate frame one part of it; focus canvas fills the screen.', 'Each plate is the same drawing its chapter steps through.'],
build: function(root){
  var h = App.h;
  [['dram', 'Inside one DDR4 chip', 'Address bits to subarrays and capacitors, then the command and data bus.'],
   ['l1d', 'The L1d arrays, to scale', 'Tag and data SRAM at one bit scale, with the Zen+ way predictor.'],
   ['xlate', 'The page walk, bit by bit', 'Address bits, four table reads at their real entry addresses, and the leaf entry decoded.'],
   ['core', 'The Zen+ core at real sizes', 'Every queue at its published size, with one loop iteration marked.'],
   ['e2e', 'One hist[123]++ on one time axis', 'Every stage of the critical path to scale, then the first cycles magnified.']
  ].forEach(function(p){
    var sec = h('div', {'class': 'p-sec', 'data-sec': p[0], 'data-title': p[1], 'data-copy': p[2]}, root);
    App.Plates[p[0]](sec);
    var b = h('button', {'class': 'ghost', type: 'button', style: 'margin-top:10px'}, sec, 'step through it in [[ch:' + p[0] + ']] \u2192');
    b.onclick = function(){ App.go(p[0]); };
  });
}});
