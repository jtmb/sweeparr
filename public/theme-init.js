try {
  var t = localStorage.getItem('theme')
  if (t) document.documentElement.setAttribute('data-theme', t)
  var r = localStorage.getItem('radius')
  if (r && r !== 'md') document.documentElement.setAttribute('data-radius', r)
  var b = localStorage.getItem('background')
  if (b && b !== 'default' && b !== 'charcoal') document.documentElement.setAttribute('data-background', b)
  var tx = localStorage.getItem('text')
  if (tx && tx !== 'default') document.documentElement.setAttribute('data-text', tx)
} catch (e) {}
