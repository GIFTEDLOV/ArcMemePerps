import { readFileSync } from 'node:fs';

async function extractChapters() {
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

  function printChapter(title: string, nextTitle: string) {
    const start = clean.indexOf(title);
    const end = clean.indexOf(nextTitle, start);
    if (start !== -1) {
      console.log(`\n=================== ${title} ===================`);
      console.log(clean.slice(start, end !== -1 ? end : start + 3500));
    }
  }

  printChapter('CHAPTER 3 Staying Safe', 'CHAPTER 4');
  printChapter('CHAPTER 4 Avoiding Fake Volume', 'CHAPTER 5');
  printChapter('CHAPTER 15 Advanced Filters', 'CHAPTER 16');
}

extractChapters().catch(console.error);
