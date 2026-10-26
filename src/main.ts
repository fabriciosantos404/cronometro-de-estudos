/**
 * Entry point — boots the app and registers the service worker (production).
 */
import './styles/main.css';
import { App } from './ui/app';

function boot(): void {
  new App();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// Register offline support only for production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is a progressive enhancement; never block the app.
    });
  });
}
