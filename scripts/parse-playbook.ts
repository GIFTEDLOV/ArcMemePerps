import { readFileSync } from 'node:fs';

async function searchSections() {
  const url = 'https://docs.google.com/document/d/1-2AZqfQCnEb1qYdHQb073JqFOy0er_tII8pclNWw-JA/mobilebasic';
  const res = await fetch(url);
  const text = await res.text();
  const clean = text
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // Find occurrences of chapters and filter rules
  const keywords = ['CHAPTER', 'Filter', 'filter', 'GMGN', 'fake volume', 'honeypot', 'liquidity', 'rug', 'Top 10', 'Dev'];
  
  // Look for chapter headings
  const chapters = clean.match(/CHAPTER \d+ [^.]+/g);
  console.log('Chapters found:', chapters);

  // Search for specific filter instructions or checklist
  const filterMatches = clean.match(/(?:filter|safety|rug|liquidity|honeypot|checklist)[^.]{20,150}\./gi);
  console.log('\nSample filter/safety snippets:');
  filterMatches?.slice(0, 15).forEach(m => console.log('-', m.trim()));
}

searchSections().catch(console.error);
