// Before anything paints: a theme and a palette chosen on this page earlier (no flash in the wrong one).
// A file, not an inline script: the CSP allows scripts from 'self' only (deploy/site.nginx.conf).
try {
  var t = localStorage.getItem("autocratico-theme")
  if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t)
  var p = localStorage.getItem("autocratico-palette")
  if (p === "roma" || p === "barocco" || p === "espresso" || p === "capri") document.documentElement.setAttribute("data-palette", p)
} catch (e) {}
