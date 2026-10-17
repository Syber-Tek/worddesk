// Canonical 66-book Bible metadata used by both the renderer (Bible navigator)
// and the main process (Twi importer) so English and Twi stay in lock-step.

export const CANONICAL_BIBLE = [
  { number: 1, testament: 'OT', en: 'Genesis', tw: 'Gyenesis', chaptersCount: 50, twFile: 'Gyenesis' },
  { number: 2, testament: 'OT', en: 'Exodus', tw: 'Eksodos', chaptersCount: 40, twFile: 'Eksodos' },
  { number: 3, testament: 'OT', en: 'Leviticus', tw: 'Lewitikos', chaptersCount: 27, twFile: 'Lewitikos' },
  { number: 4, testament: 'OT', en: 'Numbers', tw: 'Numeri', chaptersCount: 36, twFile: 'Numeri' },
  { number: 5, testament: 'OT', en: 'Deuteronomy', tw: 'Deuteronomium', chaptersCount: 34, twFile: 'Deuteronomium' },
  { number: 6, testament: 'OT', en: 'Joshua', tw: 'Yosua', chaptersCount: 24, twFile: 'Yosua' },
  { number: 7, testament: 'OT', en: 'Judges', tw: 'Akannifo', chaptersCount: 21, twFile: 'Akannifo' },
  { number: 8, testament: 'OT', en: 'Ruth', tw: 'Rut', chaptersCount: 4, twFile: 'Rut' },
  { number: 9, testament: 'OT', en: '1 Samuel', tw: 'Samuel I', chaptersCount: 31, twFile: 'Samuel I' },
  { number: 10, testament: 'OT', en: '2 Samuel', tw: 'Samuel II', chaptersCount: 24, twFile: 'Samuel II' },
  { number: 11, testament: 'OT', en: '1 Kings', tw: 'Ahemfo I', chaptersCount: 22, twFile: 'Ahemfo I' },
  { number: 12, testament: 'OT', en: '2 Kings', tw: 'Ahemfo II', chaptersCount: 25, twFile: 'Ahemfo II' },
  { number: 13, testament: 'OT', en: '1 Chronicles', tw: 'Kronika I', chaptersCount: 29, twFile: 'Kronika I' },
  { number: 14, testament: 'OT', en: '2 Chronicles', tw: 'Kronika II', chaptersCount: 36, twFile: 'Kronika II' },
  { number: 15, testament: 'OT', en: 'Ezra', tw: 'Esra', chaptersCount: 10, twFile: 'Esra' },
  { number: 16, testament: 'OT', en: 'Nehemiah', tw: 'Nehemia', chaptersCount: 13, twFile: 'Nehemia' },
  { number: 17, testament: 'OT', en: 'Esther', tw: 'Ester', chaptersCount: 10, twFile: 'Ester' },
  { number: 18, testament: 'OT', en: 'Job', tw: 'Hiob', chaptersCount: 42, twFile: 'Hiob' },
  { number: 19, testament: 'OT', en: 'Psalms', tw: 'Nnwom', chaptersCount: 150, twFile: 'Nnwom' },
  { number: 20, testament: 'OT', en: 'Proverbs', tw: 'Mmebusem', chaptersCount: 31, twFile: 'Mmebusem' },
  { number: 21, testament: 'OT', en: 'Ecclesiastes', tw: 'Osenkafo', chaptersCount: 12, twFile: 'Osenkafo' },
  { number: 22, testament: 'OT', en: 'Song of Solomon', tw: 'Nnwom Mu Dwom', chaptersCount: 8, twFile: 'Nnwom_mu_dwom' },
  { number: 23, testament: 'OT', en: 'Isaiah', tw: 'Yesaia', chaptersCount: 66, twFile: 'Yesaia' },
  { number: 24, testament: 'OT', en: 'Jeremiah', tw: 'Yeremia', chaptersCount: 52, twFile: 'Yeremia' },
  { number: 25, testament: 'OT', en: 'Lamentations', tw: 'Kwadwom', chaptersCount: 5, twFile: 'Kwadwom' },
  { number: 26, testament: 'OT', en: 'Ezekiel', tw: 'Hesekiel', chaptersCount: 48, twFile: 'Hesekiel' },
  { number: 27, testament: 'OT', en: 'Daniel', tw: 'Daniel', chaptersCount: 12, twFile: 'Daniel' },
  { number: 28, testament: 'OT', en: 'Hosea', tw: 'Hosea', chaptersCount: 14, twFile: 'Hosea' },
  { number: 29, testament: 'OT', en: 'Joel', tw: 'Yoel', chaptersCount: 3, twFile: 'Yoel' },
  { number: 30, testament: 'OT', en: 'Amos', tw: 'Amos', chaptersCount: 9, twFile: 'Amos' },
  { number: 31, testament: 'OT', en: 'Obadiah', tw: 'Obadia', chaptersCount: 1, twFile: 'Obadia' },
  { number: 32, testament: 'OT', en: 'Jonah', tw: 'Yona', chaptersCount: 4, twFile: 'Yona' },
  { number: 33, testament: 'OT', en: 'Micah', tw: 'Mika', chaptersCount: 7, twFile: 'Mika' },
  { number: 34, testament: 'OT', en: 'Nahum', tw: 'Nahum', chaptersCount: 3, twFile: 'Nahum' },
  { number: 35, testament: 'OT', en: 'Habakkuk', tw: 'Habakuk', chaptersCount: 3, twFile: 'Habakuk' },
  { number: 36, testament: 'OT', en: 'Zephaniah', tw: 'Sefania', chaptersCount: 3, twFile: 'Sefania' },
  { number: 37, testament: 'OT', en: 'Haggai', tw: 'Hagai', chaptersCount: 2, twFile: 'Hagai' },
  { number: 38, testament: 'OT', en: 'Zechariah', tw: 'Sakaria', chaptersCount: 14, twFile: 'Sakaria' },
  { number: 39, testament: 'OT', en: 'Malachi', tw: 'Malaki', chaptersCount: 4, twFile: 'Malaki' },
  { number: 40, testament: 'NT', en: 'Matthew', tw: 'Mateo', chaptersCount: 28, twFile: 'Mateo' },
  { number: 41, testament: 'NT', en: 'Mark', tw: 'Marko', chaptersCount: 16, twFile: 'Marko' },
  { number: 42, testament: 'NT', en: 'Luke', tw: 'Luka', chaptersCount: 24, twFile: 'Luka' },
  { number: 43, testament: 'NT', en: 'John', tw: 'Yohane', chaptersCount: 21, twFile: 'Yohane' },
  { number: 44, testament: 'NT', en: 'Acts', tw: 'Asomafo', chaptersCount: 28, twFile: 'Asomafo' },
  { number: 45, testament: 'NT', en: 'Romans', tw: 'Romafo', chaptersCount: 16, twFile: 'Romafo' },
  { number: 46, testament: 'NT', en: '1 Corinthians', tw: 'Korintofo I', chaptersCount: 16, twFile: 'Korintofo I' },
  { number: 47, testament: 'NT', en: '2 Corinthians', tw: 'Korintofo II', chaptersCount: 13, twFile: 'Korintofo II' },
  { number: 48, testament: 'NT', en: 'Galatians', tw: 'Galatifo', chaptersCount: 6, twFile: 'Galatifo' },
  { number: 49, testament: 'NT', en: 'Ephesians', tw: 'Efesofo', chaptersCount: 6, twFile: 'Efesofo' },
  { number: 50, testament: 'NT', en: 'Philippians', tw: 'Filipifo', chaptersCount: 4, twFile: 'Filipifo' },
  { number: 51, testament: 'NT', en: 'Colossians', tw: 'Kolosefo', chaptersCount: 4, twFile: 'Kolosefo' },
  { number: 52, testament: 'NT', en: '1 Thessalonians', tw: 'Tesalonikafo I', chaptersCount: 5, twFile: 'Tesalonikafo I' },
  { number: 53, testament: 'NT', en: '2 Thessalonians', tw: 'Tesalonikafo II', chaptersCount: 3, twFile: 'Tesalonikafo II' },
  { number: 54, testament: 'NT', en: '1 Timothy', tw: 'Timoteo I', chaptersCount: 6, twFile: 'Timoteo I' },
  { number: 55, testament: 'NT', en: '2 Timothy', tw: 'Timoteo II', chaptersCount: 4, twFile: 'Timoteo II' },
  { number: 56, testament: 'NT', en: 'Titus', tw: 'Tito', chaptersCount: 3, twFile: 'Tito' },
  { number: 57, testament: 'NT', en: 'Philemon', tw: 'Filemon', chaptersCount: 1, twFile: 'Filemon' },
  { number: 58, testament: 'NT', en: 'Hebrews', tw: 'Hebrifo', chaptersCount: 13, twFile: 'Hebrifo' },
  { number: 59, testament: 'NT', en: 'James', tw: 'Yakobo', chaptersCount: 5, twFile: 'Yakobo' },
  { number: 60, testament: 'NT', en: '1 Peter', tw: 'Petro I', chaptersCount: 5, twFile: 'Petro I' },
  { number: 61, testament: 'NT', en: '2 Peter', tw: 'Petro II', chaptersCount: 3, twFile: 'Petro II' },
  { number: 62, testament: 'NT', en: '1 John', tw: 'Yohane I', chaptersCount: 5, twFile: 'Yohane I' },
  { number: 63, testament: 'NT', en: '2 John', tw: 'Yohane II', chaptersCount: 1, twFile: 'Yohane II' },
  { number: 64, testament: 'NT', en: '3 John', tw: 'Yohane III', chaptersCount: 1, twFile: 'Yohane III' },
  { number: 65, testament: 'NT', en: 'Jude', tw: 'Yuda', chaptersCount: 1, twFile: 'Yuda' },
  { number: 66, testament: 'NT', en: 'Revelation', tw: 'Yohane Adiyisem', chaptersCount: 22, twFile: 'Yohane_Adiyisem' },
]

export const ENGLISH_OT_BOOKS = CANONICAL_BIBLE
  .filter((b) => b.testament === 'OT')
  .map((b) => ({ name: b.en, chaptersCount: b.chaptersCount }))

export const ENGLISH_NT_BOOKS = CANONICAL_BIBLE
  .filter((b) => b.testament === 'NT')
  .map((b) => ({ name: b.en, chaptersCount: b.chaptersCount }))

export const TWI_OT_BOOKS = CANONICAL_BIBLE
  .filter((b) => b.testament === 'OT')
  .map((b) => ({ name: b.tw, chaptersCount: b.chaptersCount }))

export const TWI_NT_BOOKS = CANONICAL_BIBLE
  .filter((b) => b.testament === 'NT')
  .map((b) => ({ name: b.tw, chaptersCount: b.chaptersCount }))

// Known Twi translation codes (canonical + bundled XML variants)
const TWI_CODES = new Set(['TWI', 'ASNA', 'AKUA', 'TWIDC', 'TWIRV'])

export const isTwiCode = (code) => TWI_CODES.has(String(code || '').toUpperCase())

export function extractTranslationFromRef(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\(([A-Za-z0-9_\-\s]+)\)\s*$/);
  if (match) {
    const raw = match[1].trim();
    if (raw.includes('/')) {
      const parts = raw.split('/').map((p) => p.trim());
      return parts[0] || null;
    }
    return raw;
  }
  return null;
}

export function detectLanguageFromBook(bookName) {
  if (!bookName || typeof bookName !== 'string') return null;
  const n = normalizeBookName(bookName);
  for (const b of CANONICAL_BIBLE) {
    if (normalizeBookName(b.tw) === n && normalizeBookName(b.en) !== n) {
      return 'Twi';
    }
  }
  return null;
}

export function matchBibleTranslation(biblesList, targetTranslation) {
  if (!Array.isArray(biblesList) || biblesList.length === 0) return null;
  const target = String(targetTranslation || '').trim().toUpperCase();
  if (!target) return biblesList[0] || null;

  // 1. Direct exact code match (case-insensitive)
  const exact = biblesList.find((b) => String(b.code || '').toUpperCase() === target);
  if (exact) return exact;

  // 2. Twi translation aliases
  if (target === 'TWI' || target === 'ASNA' || target === 'TWIRV' || target === 'AKUA' || target === 'TWIDC') {
    const twiMatch =
      biblesList.find((b) => b.code === 'TWI') ||
      biblesList.find((b) => b.code === 'TWIRV') ||
      biblesList.find((b) => isTwiCode(b.code)) ||
      biblesList.find((b) => String(b.language || '').toLowerCase() === 'twi');
    if (twiMatch) return twiMatch;
  }

  // 3. Ewe translation aliases
  if (target === 'EWE' || target.includes('EWE')) {
    const eweMatch =
      biblesList.find((b) => String(b.code || '').toUpperCase() === 'EWE') ||
      biblesList.find((b) => String(b.language || '').toLowerCase() === 'ewe') ||
      biblesList.find((b) => String(b.name || '').toLowerCase().includes('ewe'));
    if (eweMatch) return eweMatch;
  }

  // 4. Language match (e.g. "Twi", "Ewe", "English")
  const langMatch = biblesList.find(
    (b) => String(b.language || '').toUpperCase() === target
  );
  if (langMatch) return langMatch;

  // 5. Name match (e.g. contains "Agbenya La", "Twerɛ Kronkron", etc.)
  const nameMatch = biblesList.find((b) =>
    String(b.name || '').toUpperCase().includes(target)
  );
  if (nameMatch) return nameMatch;

  return null;
}

// Normalized comparison helper so 'Nnwom Mu Dwom' === 'Nnwom_mu_dwom',
// '1 Samuel' === 'Samuel I'-style names via index mapping, etc.
export const normalizeBookName = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[\s_]+/g, '')

export function getBibleBookLists(code) {
  return isTwiCode(code)
    ? { ot: TWI_OT_BOOKS, nt: TWI_NT_BOOKS }
    : { ot: ENGLISH_OT_BOOKS, nt: ENGLISH_NT_BOOKS }
}

export function findCanonicalIndex(name) {
  const n = normalizeBookName(name)
  for (let i = 0; i < CANONICAL_BIBLE.length; i++) {
    const b = CANONICAL_BIBLE[i]
    if (normalizeBookName(b.en) === n || normalizeBookName(b.tw) === n) return i
  }
  return -1
}

export function mapBookToTranslation(name, targetCode) {
  const index = findCanonicalIndex(name)
  const lists = getBibleBookLists(targetCode)
  const all = [...lists.ot, ...lists.nt]
  const resolved = index >= 0 ? all[index] : all[0]
  return resolved ? resolved.name : (all[0] && all[0].name) || ''
}

// Find the counterpart of a book inside another translation's book list.
// Book names are localized (English 'John' vs Twi 'Yohane'), so comparing names
// only ever matches the book the user is already looking at and leaves every
// other book unresolved. Canonical position is the reliable join key, with the
// stored book_number as the fallback for lists that are not in canonical order.
// Returns null rather than guessing, so callers never show a silent mismatch.
export function resolveBookInList(books, name, targetCode) {
  if (!Array.isArray(books) || books.length === 0) return null

  const index = findCanonicalIndex(name)
  if (index < 0) {
    const n = normalizeBookName(name)
    return books.find((b) => normalizeBookName(b.name) === n) || null
  }

  const wantedNumber = index + 1
  const byNumber = books.find((b) => Number(b.book_number) === wantedNumber)
  if (byNumber) return byNumber

  const mapped = mapBookToTranslation(name, targetCode)
  return (
    books.find((b) => normalizeBookName(b.name) === normalizeBookName(mapped)) ||
    null
  )
}

// Canonical order used by the Twi .txt importer (basename -> display name -> position)
export const TWI_BOOKS_CANONICAL = CANONICAL_BIBLE.map((b) => ({
  number: b.number,
  testament: b.testament,
  name: b.tw,
  file: b.twFile,
}))