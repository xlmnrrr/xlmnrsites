import { loadContent, hydrate } from './content.js';
import { initNav, openDialog } from './nav.js';
import { initForm } from './form.js';
import { initConsent } from './consent.js';
import { initFx, setSplitText } from './fx.js';
import { renderLists, initCases } from './render.js';
import { initStages } from './stages.js';
import { initViewer, openViewer } from './viewer.js';
import { initLogos } from './logo.js';
import { initBot } from './bot.js';
import { initOrbitNav } from './orbit.js';

const content = loadContent();

initNav();
initLogos();
initFx();
initForm(content);
initConsent(content);
initViewer();
initCases(content, openDialog, openViewer);
initBot(content, openViewer);
initStages();
initOrbitNav();

content.then((data) => {
  if (!data) return;
  hydrate(data, document, { onSplit: setSplitText });
  renderLists(data);
});
