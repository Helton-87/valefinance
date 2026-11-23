(() => {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
  const install = document.getElementById('install-app');
  if (!install) return;
  let promptEvent = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    install.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    install.hidden = true;
  });
  install.addEventListener('click', async () => {
    if (!promptEvent) return;
    const event = promptEvent;
    promptEvent = null;
    install.hidden = true;
    await event.prompt();
  });
})();
