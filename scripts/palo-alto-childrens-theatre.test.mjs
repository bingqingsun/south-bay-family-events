import assert from 'node:assert/strict';
import {
  normalizePaloAltoTheatreTitle,
  paloAltoChildrensTheatreDetailUrl,
  paloAltoTheatreTitlesMatch,
  parsePaloAltoChildrensTheatreDetail
} from './lib/palo-alto-childrens-theatre.mjs';

assert.equal(
  paloAltoChildrensTheatreDetailUrl('Playhouse Series: Jack & the Beanstalk'),
  'https://www.paloalto.gov/Events-Directory/Community-Services/Playhouse-Series-Jack-and-the-Beanstalk'
);
assert.equal(
  paloAltoChildrensTheatreDetailUrl('Main Stage: A Year with Frog and Toad'),
  'https://www.paloalto.gov/Events-Directory/Community-Services/Main-Stage-A-Year-with-Frog-and-Toad'
);
assert.equal(
  normalizePaloAltoTheatreTitle('Playhouse Series: Jack &amp; the Beanstalk'),
  'playhouse series jack and the beanstalk'
);
assert.equal(paloAltoTheatreTitlesMatch('Playhouse Series: Jack & the Beanstalk', 'Playhouse Series: Jack and the Beanstalk'), true);

const html = `
  <html><head>
    <meta property="og:title" content="Playhouse Series: Jack and the Beanstalk">
    <meta property="og:description" content="Story-teller style theatre for young audience members.">
    <meta property="og:image" content="https://www.paloalto.gov/files/jack.png">
  </head><body><h1>Playhouse Series: Jack and the Beanstalk</h1><p>$20</p></body></html>
`;
assert.deepEqual(
  parsePaloAltoChildrensTheatreDetail(html, 'Playhouse Series: Jack & the Beanstalk', 'https://example.test/jack'),
  {
    title: 'Playhouse Series: Jack and the Beanstalk',
    url: 'https://example.test/jack',
    image: 'https://www.paloalto.gov/files/jack.png',
    description: 'Story-teller style theatre for young audience members.',
    text: 'Playhouse Series: Jack and the Beanstalk $20'
  }
);
assert.equal(parsePaloAltoChildrensTheatreDetail(html, 'Different Show', 'https://example.test/jack'), null);

console.log("Palo Alto Children's Theatre detail enrichment tests passed.");
