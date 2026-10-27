import { loadContent, hydrate } from './content.js';
import { initNav } from './nav.js';
import { initConsent } from './consent.js';

const content = loadContent();
initNav();
initConsent(content);
content.then((data) => hydrate(data));
