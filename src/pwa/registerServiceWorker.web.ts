export async function registerServiceWorker(): Promise<void> {
  if (__DEV__ || !('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.register('/service-worker.js');
  let reloadAfterUpdate = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadAfterUpdate) return;
    reloadAfterUpdate = false;
    window.location.reload();
  });

  const offerUpdate = (worker: ServiceWorker | null) => {
    if (!worker || !navigator.serviceWorker.controller) return;
    if (window.confirm('A new version is available. Reload to update?')) {
      reloadAfterUpdate = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  if (registration.waiting) {
    offerUpdate(registration.waiting);
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;

    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        offerUpdate(registration.waiting);
      }
    });
  });
}
