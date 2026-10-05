import assert from 'node:assert/strict';
import {
  normalizePaloAltoTheatreTitle,
  paloAltoTheatreDetailTitleCandidates,
  paloAltoChildrensTheatreDetailUrl,
  paloAltoTheatreTitlesMatch,
  parsePaloAltoChildrensTheatreDetail
} from './lib/palo-alto-childrens-theatre.mjs';
import { enrichPaloAltoChildrensTheatreEvents } from './enrich-palo-alto-childrens-theatre.mjs';

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

assert.deepEqual(
  paloAltoTheatreDetailTitleCandidates('Main Stage Production: A Year with Frog and Toad'),
  ['Main Stage Production: A Year with Frog and Toad', 'Main Stage: A Year with Frog and Toad']
);
assert.deepEqual(
  paloAltoTheatreDetailTitleCandidates('Playhouse Series: One Grain of Rice & Holi Festival of Colors Celebration'),
  ['Playhouse Series: One Grain of Rice & Holi Festival of Colors Celebration', 'Playhouse Series: One Grain of Rice']
);

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


const previewResult = await enrichPaloAltoChildrensTheatreEvents(
  [{
    id: 'showare-1',
    title: 'Playhouse Series: Jack & the Beanstalk',
    source: "Palo Alto Children's Theatre",
    url: 'https://pact.showare.com/eventperformances.asp?evt=1',
    image: '',
    imageStatus: 'missing'
  }],
  {
    name: "Palo Alto Children's Theatre",
    officialDetailBaseUrl: 'https://www.paloalto.gov/Events-Directory/Community-Services/'
  },
  async title => ({
    title: 'Playhouse Series: Jack and the Beanstalk',
    url: paloAltoChildrensTheatreDetailUrl(title),
    image: 'https://www.paloalto.gov/files/jack.png',
    description: 'Official description',
    text: 'Official description $20'
  })
);
assert.equal(previewResult.enriched, 1);
assert.equal(previewResult.events[0].image, 'https://www.paloalto.gov/files/jack.png');
assert.equal(previewResult.events[0].url, 'https://www.paloalto.gov/Events-Directory/Community-Services/Playhouse-Series-Jack-and-the-Beanstalk');
assert.equal(previewResult.events[0].canonicalUrl, 'https://www.paloalto.gov/Events-Directory/Community-Services/Playhouse-Series-Jack-and-the-Beanstalk');
assert.equal(previewResult.events[0].canonicalDetail.sourceUrl, 'https://www.paloalto.gov/Events-Directory/Community-Services/Playhouse-Series-Jack-and-the-Beanstalk');
assert.equal(previewResult.events[0].fieldProvenance.image.method, 'og:image');
assert.equal(previewResult.events[0].ticketUrl, 'https://pact.showare.com/eventperformances.asp?evt=1');
assert.equal(previewResult.events[0].imageStatus, 'official');

const fallbackResult = await enrichPaloAltoChildrensTheatreEvents(
  [{
    id: 'showare-gingerbread',
    title: 'Playhouse Series: The Gingerbread Man',
    source: "Palo Alto Children's Theatre",
    url: 'https://pact.showare.com/eventperformances.asp?evt=7',
    image: 'https://pact.showare.com/uplimage/Blank.gif',
    imageStatus: 'official'
  }],
  {
    name: "Palo Alto Children's Theatre",
    officialDetailBaseUrl: 'https://www.paloalto.gov/Events-Directory/Community-Services/',
    officialImageFallbacks: [{
      titlePrefix: 'Playhouse Series:',
      image: 'https://www.paloalto.gov/files/playhouse-poster.png',
      sourceUrl: 'https://www.paloalto.gov/Departments/Community-Services/Arts-Sciences/Palo-Alto-Childrens-Theatre',
      evidence: 'official-theatre-page-playhouse-season-poster'
    }]
  },
  async () => null,
  { verifiedAt: '2026-10-05T00:00:00Z' }
);
assert.equal(fallbackResult.enriched, 1);
assert.equal(fallbackResult.events[0].image, 'https://www.paloalto.gov/files/playhouse-poster.png');
assert.equal(fallbackResult.events[0].imageProvenance.method, 'program-page');
assert.equal(fallbackResult.events[0].refreshStatus, 'official-program-image');
assert.equal(fallbackResult.events[0].url, 'https://pact.showare.com/eventperformances.asp?evt=7');

const frogResult = await enrichPaloAltoChildrensTheatreEvents(
  [{
    id: 'showare-frog',
    title: 'Main Stage Production: A Year with Frog and Toad',
    source: "Palo Alto Children's Theatre",
    url: 'https://pact.showare.com/eventperformances.asp?evt=49',
    image: 'https://pact.showare.com/uplimage/Blank.gif',
    imageStatus: 'official'
  }],
  {
    name: "Palo Alto Children's Theatre",
    officialDetailBaseUrl: 'https://www.paloalto.gov/Events-Directory/Community-Services/',
    officialImageFallbacks: [{
      titleIncludes: 'A Year with Frog and Toad',
      image: 'https://www.paloalto.gov/files/assets/public/v/1/community-services/childrens-theatre/production-pictures/frog-and-toad-web-poster.png',
      sourceUrl: 'https://www.paloalto.gov/Events-Directory/Community-Services/Main-Stage-A-Year-with-Frog-and-Toad',
      canonicalUrl: 'https://www.paloalto.gov/Events-Directory/Community-Services/Main-Stage-A-Year-with-Frog-and-Toad',
      evidence: 'official-event-body-production-poster',
      preferFallbackImage: true
    }]
  },
  async () => ({
    title: 'Main Stage: A Year with Frog and Toad',
    url: 'https://www.paloalto.gov/Events-Directory/Community-Services/Main-Stage-A-Year-with-Frog-and-Toad',
    image: 'https://www.paloalto.gov/files/ocwebsite/Public/HeroImage/City%20of%20Palo%20Alto%20Logo%201152x260%20for%20Loom.png?w=1200',
    description: 'Official description',
    text: 'Official description'
  }),
  { verifiedAt: '2026-10-05T00:00:00Z' }
);
assert.equal(
  frogResult.events[0].image,
  'https://www.paloalto.gov/files/assets/public/v/1/community-services/childrens-theatre/production-pictures/frog-and-toad-web-poster.png'
);
assert.equal(
  frogResult.events[0].url,
  'https://www.paloalto.gov/Events-Directory/Community-Services/Main-Stage-A-Year-with-Frog-and-Toad'
);
assert.equal(frogResult.events[0].imageProvenance.evidence, 'official-event-body-production-poster');


console.log("Palo Alto Children's Theatre detail enrichment tests passed.");
