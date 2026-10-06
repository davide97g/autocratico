// Before anything paints: a theme chosen on this page earlier (no flash in the wrong one).
// A file, not an inline script: the CSP allows scripts from 'self' only (deploy/site.nginx.conf).
try {
  var t = localStorage.getItem("autocratico-theme")
  if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t)
} catch (e) {}
