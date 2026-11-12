// Fullscreen on request. Browsers allow it only in response to a click, tap
// or key press. iPhone Safari has no fullscreen API for pages (an installed
// PWA runs without browser bars instead), so the button is hidden there.

export const fullscreenAvailable = (): boolean => document.fullscreenEnabled === true;

export const isFullscreen = (): boolean => document.fullscreenElement !== null;

export async function toggleFullscreen(): Promise<void> {
  if (!fullscreenAvailable()) return;
  try {
    if (isFullscreen()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // Refused (not triggered by the user, or blocked by the browser): nothing to do.
  }
}
