import { config } from './config.js';

// Footer credit and privacy contact line, driven by config.js.
const built = document.getElementById('built');
if (built) {
  if (config.portfolioUrl) {
    built.append('Built by ');
    built.append(Object.assign(document.createElement('a'), { href: config.portfolioUrl, textContent: 'the maker', rel: 'noopener' }));
  } else {
    built.textContent = config.brand;
  }
}

const contact = document.getElementById('contact');
if (contact && config.contactEmail) {
  contact.textContent = 'Questions about this page: ';
  contact.append(Object.assign(document.createElement('a'), { href: `mailto:${config.contactEmail}`, textContent: config.contactEmail }));
}
