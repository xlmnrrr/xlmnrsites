import { loadContent, hydrate } from './content.js';
import { initNav, openDialog } from './nav.js';
import { initForm } from './form.js';
import { initFaq } from './faq.js';
import { initConsent } from './consent.js';
import { initFx, setSplitText } from './fx.js';
import { renderLists, initCases } from './render.js';
import { initStages } from './stages.js';

const content = loadContent();

initNav();
initFx();
initForm(content);
initFaq(content);
initConsent(content);
initCases(content, openDialog);
initStages();

content.then((data) => {
  if (!data) return;
  hydrate(data, document, { onSplit: setSplitText });
  renderLists(data);
});
