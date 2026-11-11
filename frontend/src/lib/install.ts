import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event as InstallPromptEvent; notify(); });
window.addEventListener('appinstalled', () => { deferred = null; notify(); });

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** "native": the browser can show its own install dialog (Android, desktop Chrome/Edge).
 *  "ios": Safari has no dialog, so the user adds it via Share → Add to Home Screen.
 *  null: already installed, or the browser can't install apps. */
export function useInstallApp() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender(count => count + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const mode: 'native' | 'ios' | null = isStandalone() ? null : deferred ? 'native' : isIos() ? 'ios' : null;
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    notify();
  };
  return { mode, install };
}
