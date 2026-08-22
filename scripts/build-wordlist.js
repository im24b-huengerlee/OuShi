'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'data', 'de.txt');
const URLS = [
  'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt',
  'https://raw.githubusercontent.com/enz/german-wordlist/master/words',
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

function normalize(word) {
  return word.trim().toLowerCase();
}

function isValid(word) {
  return word.length >= 3 && word.length <= 25 && /^[a-zäöüß]+$/.test(word);
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  let text;
  let ok = false;
  for (const url of URLS) {
    try {
      text = await fetch(url);
      ok = true;
      console.log('Fetched', url);
      break;
    } catch (err) {
      console.warn('Fetch failed:', url, err.message);
    }
  }
  if (!ok) {
    console.error('All fetches failed, using fallback list');
    text = [
      'apfel', 'banane', 'computer', 'deutsch', 'element', 'freund', 'garten',
      'haus', 'insel', 'jacke', 'kinder', 'lampe', 'musik', 'nacht', 'obst',
      'pferd', 'quelle', 'regen', 'schule', 'tisch', 'universum', 'vogel',
      'wasser', 'zimmer', 'blume', 'chance', 'drache', 'energie', 'fisch',
      'glück', 'herz', 'idee', 'junge', 'kraft', 'leben', 'macht', 'name',
      'ort', 'plan', 'rad', 'sonne', 'tag', 'uhr', 'volk', 'weg', 'zeit',
      'arbeit', 'buch', 'dorf', 'erde', 'feld', 'gold', 'hand', 'licht',
      'mond', 'nebel', 'park', 'rauch', 'sand', 'tal', 'ufer', 'wald'
    ].join('\n');
  }

  const seen = new Set();
  const words = [];
  for (const line of text.split(/\r?\n/)) {
    const w = normalize(line.split(/\s+/)[0]);
    if (!isValid(w) || seen.has(w)) continue;
    seen.add(w);
    words.push(w);
  }
  words.sort();
  fs.writeFileSync(OUT, words.join('\n') + '\n');
  console.log('Wrote', words.length, 'words to', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
