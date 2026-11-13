// Fullscreen on request. Browsers allow it only in response to a click, tap
// or key press. iPhone Safari has no fullscreen API for pages (an installed
// PWA runs without browser bars instead), so the button is hidden there.
// On Android, going fullscreen also locks the screen to landscape.

export const fullscreenAvailable = (): boolean => document.fullscreenEnabled === true;

export const isFullscreen = (): boolean => document.fullscreenElement !== null;

export async function toggleFullscreen(): Promise<void> {
  if (!fullscreenAvailable()) return;
  try {
    if (isFullscreen()) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    return; // refused (not triggered by the user, or blocked by the browser)
  }
  await lockLandscape();
}

/**
 * Keep phones sideways while in fullscreen (Android browsers allow the lock
 * only there; elsewhere it is refused, which is fine).
 */
async function lockLandscape(): Promise<void> {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  try {
    await orientation.lock?.('landscape');
  } catch {
    // Not supported, or not on a phone.
  }
}
