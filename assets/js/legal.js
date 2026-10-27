import { loadContent, hydrate } from './content.js';
import { initNav } from './nav.js';
import { initConsent } from './consent.js';
import { initLogos } from './logo.js';

const content = loadContent();
initNav();
initLogos();
// Inside the site viewer the parent page already handles cookies and analytics.
if (!document.documentElement.classList.contains('is-embedded')) initConsent(content);
content.then((data) => hydrate(data));
