async function fetchDoc() {
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
  console.log('DOC LENGTH:', clean.length);
  console.log('=== FULL DOCUMENT TEXT ===');
  console.log(clean);
}

fetchDoc().catch(console.error);
