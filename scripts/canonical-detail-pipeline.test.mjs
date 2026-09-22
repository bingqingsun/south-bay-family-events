import assert from 'node:assert/strict';
import { canonicalEnrichmentDecision, enrichOneCanonicalEvent } from './canonical-detail-pipeline.mjs';

const source={id:'city-test',name:'City Test',domain:'example.gov',method:'civic'};
const base={
 id:'event-1',title:'Family Lantern Night',source:'City Test',
 url:'https://example.gov/events/family-lantern-night',
 canonicalUrl:'https://example.gov/events/family-lantern-night',
 dateValue:'2026-10-10T18:00:00',endDateValue:'2026-10-10T20:00:00',
 description:'Discovery description',image:'https://example.gov/images/discovery.jpg',
 place:'Civic Plaza',address:'100 Main St, San Jose',city:'San Jose',
 costStatus:'free',registrationStatus:'not-required',ageLabel:'Family-friendly',ageRanges:[]
};

{
 const previous={...base,canonicalDetail:{sourceUrl:base.url,verifiedAt:'2026-09-20T00:00:00Z'}};
 assert.deepEqual(canonicalEnrichmentDecision(base,previous,Date.parse('2026-09-22T00:00:00Z')),{run:false,reason:'cached'});
 assert.equal(canonicalEnrichmentDecision({...base,url:'https://example.gov/events/new',canonicalUrl:'https://example.gov/events/new'},previous,Date.parse('2026-09-22T00:00:00Z')).reason,'canonical-changed');
}

const html=`<html><head>
<meta property="og:title" content="Family Lantern Night">
<meta property="og:image" content="https://example.gov/images/family-lantern-night-hero.jpg">
<script type="application/ld+json">{
"@context":"https://schema.org","@type":"Event","name":"Family Lantern Night",
"description":"The official canonical page says families make lanterns, hear live music, and join a community celebration.",
"startDate":"2026-10-10T00:00:00","endDate":"2026-10-11T00:00:00",
"image":"https://example.gov/images/family-lantern-night-official.jpg",
"location":{"@type":"Place","name":"Official Civic Plaza","address":{"@type":"PostalAddress","streetAddress":"100 Main St","addressLocality":"San Jose"}}
}</script></head><body><h1>Family Lantern Night</h1></body></html>`;

{
 const result=await enrichOneCanonicalEvent(base,{
   sources:[source],verifiedAt:'2026-09-22T12:00:00Z',
   fetchImpl:async url=>({ok:true,status:200,url,headers:{get:()=> 'text/html'},text:async()=>html})
 });
 assert.equal(result.event.image,'https://example.gov/images/family-lantern-night-official.jpg');
 assert.match(result.event.description,/official canonical page/i);
 assert.equal(result.event.fieldProvenance.image.source,'canonical-detail');
 assert.equal(result.event.fieldProvenance.description.source,'canonical-detail');
 assert.equal(result.event.canonicalDetail.status,'enriched');
 // The canonical page has an all-day umbrella; it must not erase the precise
 // 6 PM session time already supplied by the official discovery feed.
 assert.equal(result.event.dateValue,'2026-10-10T18:00:00');
 assert.equal(result.event.place,'Official Civic Plaza');
}

{
 const wrong=`<html><head><meta property="og:title" content="Adult Tax Workshop"></head><body><h1>Adult Tax Workshop</h1></body></html>`;
 const result=await enrichOneCanonicalEvent(base,{
   sources:[source],verifiedAt:'2026-09-22T12:00:00Z',
   fetchImpl:async url=>({ok:true,status:200,url,headers:{get:()=> 'text/html'},text:async()=>wrong})
 });
 assert.equal(result.event.image,base.image);
 assert.equal(result.event.canonicalDetail.status,'identity-mismatch');
}

{
 const logoOnly=`<html><head>
 <meta property="og:title" content="Family Lantern Night">
 <meta property="og:image" content="https://example.gov/assets/site-logo.png">
 </head><body><h1>Family Lantern Night</h1><p>Official event page.</p></body></html>`;
 const result=await enrichOneCanonicalEvent(base,{
   sources:[source],verifiedAt:'2026-09-22T12:00:00Z',
   fetchImpl:async url=>({ok:true,status:200,url,headers:{get:()=> 'text/html'},text:async()=>logoOnly})
 });
 assert.equal(result.event.image,base.image);
}

{
 const previous={
   ...base,
   image:'https://example.gov/images/canonical.jpg',
   fieldProvenance:{image:{source:'canonical-detail',sourceUrl:base.url,method:'schema.org',verifiedAt:'2026-09-20T00:00:00Z'}},
   canonicalDetail:{status:'enriched',sourceUrl:base.url,verifiedAt:'2026-09-20T00:00:00Z',fieldsUpdated:['image']}
 };
 const current={...base,image:'https://example.gov/images/discovery-new.jpg'};
 const result=await enrichOneCanonicalEvent(current,{sources:[source],previous,verifiedAt:'2026-09-22T00:00:00Z'});
 assert.equal(result.event.image,'https://example.gov/images/canonical.jpg');
 assert.equal(result.diagnostics.status,'cached');
}

console.log('canonical detail pipeline tests passed');
