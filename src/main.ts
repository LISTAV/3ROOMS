import { AppShell } from './ui/components/AppShell.js';

window.addEventListener('DOMContentLoaded', () => {
  const appRoot = document.getElementById('app');
  if (appRoot) {
    new AppShell(appRoot);
  }
});
