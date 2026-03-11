(() => {
  const modules = window.__precogModules || {};
  const hostname = window.location.hostname;

  // Check site-specific modules first
  const siteModules = ['gmail', 'asana', 'slack'];
  for (const name of siteModules) {
    if (modules[name] && modules[name].matches(hostname)) {
      modules[name].init();
      return;
    }
  }

  // Fall back to generic
  if (modules.generic) {
    modules.generic.init();
  }
})();
