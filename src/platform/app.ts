// The game as an installed app (PWA): the service worker that keeps it
// playable offline (tools/pwa/sw.js), new versions, and the browser's
// install offer.
//
// A new version downloads in the background and waits. It is switched to at
// the next start of the game, or from the menu ("Update"), never in the
// middle of a level.

/** Chrome's install offer (not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installOffer: InstallPromptEvent | null = null;
let waiting: ServiceWorker | null = null;

/** Start the service worker (built site only); `onUpdate` hears of a downloaded new version. */
export function startApp(onUpdate: () => void): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the offer for the menu instead of the browser's own banner
    installOffer = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    installOffer = null;
  });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) {
      // Downloaded during an earlier visit: switch now, while the game is only starting.
      waiting = reg.waiting;
      applyUpdate();
      return;
    }
    reg.addEventListener('updatefound', () => {
      const next = reg.installing;
      next?.addEventListener('statechange', () => {
        if (next.state === 'installed' && navigator.serviceWorker.controller) {
          waiting = next;
          onUpdate();
        }
      });
    });
    // An installed app is often resumed rather than reloaded: look for a new version then too.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
    });
  });
}

export const canInstall = (): boolean => installOffer !== null;

export async function install(): Promise<void> {
  const offer = installOffer;
  if (!offer) return;
  installOffer = null; // an offer can be shown once
  await offer.prompt();
}

export const updateReady = (): boolean => waiting !== null;

/** Switch to the downloaded version: the page reloads with it. */
export function applyUpdate(): void {
  if (!waiting) return;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  waiting.postMessage('update');
}
