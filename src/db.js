import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { CANONICAL_BIBLE, normalizeBookName } from './bibleBooks.js'
import { fingerprintFiles } from './lib/fingerprint.js'

let db = null

// ── Library folder resolution ────────────────────────────────────────────────
// The bundled Bible / hymn content (bibles/, hymns/) is packed INSIDE the app
// asar, so it must be read from the app path rather than the working directory.
// process.cwd() is not usable here: in a packaged app it is wherever the
// executable happened to be started from, and on macOS it is "/" when the app is
// launched from Finder — which is why a packaged macOS build came up with an
// empty Bible and Songs library.
//
// The user's own drop-in files have to live somewhere writable, because a
// packaged app bundle (especially on macOS) is read-only, so those folders are
// created under userData instead. Both locations are scanned: the bundled copy
// plus the user's.
const bundledDataDir = (name) => path.join(app.getAppPath(), name)
const userDataDir = (name) => path.join(app.getPath('userData'), name)

// Stable, portable label for a library file, used for the source_file column.
// Keeps local usernames and absolute paths out of the database.
const librarySourceLabel = (filePath) => {
  for (const base of [bundledDataDir('hymns'), userDataDir('hymns'), bundledDataDir('bibles'), userDataDir('bibles')]) {
    const rel = path.relative(base, filePath)
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.split(path.sep).join('/')
    }
  }
  return path.basename(filePath)
}

/**
 * Initializes the local offline SQLite database in Electron's userData folder.
 */
export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'church.db')
  db = new Database(dbPath)

  // Enforce WAL mode for fast concurrent disk reads/writes
  db.pragma('journal_mode = WAL')

  // WAL lets readers run while a write is in flight, but it does not queue two
  // writers. Without a busy timeout SQLite reports SQLITE_BUSY the instant
  // another process holds the write lock instead of waiting for it, and
  // better-sqlite3 throws that straight at the caller. Anything that can hold the
  // lock briefly - the updater's installer touching the folder, a leftover second
  // instance that has not finished exiting, an antivirus scan on a slow laptop -
  // would otherwise surface as "database is locked" and land in the dbError
  // screen. Five seconds is far longer than any real write here takes.
  db.pragma('busy_timeout = 5000')

  // Enable foreign key cascades (delete bible -> removes books & verses)
  db.pragma('foreign_keys = ON')

  // Migration: older installs won't have source_file on bibles yet
  try {
    db.exec('ALTER TABLE bibles ADD COLUMN source_file TEXT')
  } catch {
    // Column already exists — nothing to do
  }

  // Create system_status table
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Fingerprint of the library files as of the last successful import, so a
  // relaunch can skip the (very slow) re-import when nothing has changed.
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_state (
      key TEXT PRIMARY KEY,
      signature TEXT NOT NULL,
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Create Bible Schema tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS bibles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      language TEXT NOT NULL,
      source_file TEXT
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bible_id INTEGER NOT NULL,
      book_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      testament TEXT NOT NULL,
      FOREIGN KEY(bible_id) REFERENCES bibles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_verses_lookup ON verses(book_id, chapter, verse);
  `)

  // One-off cleanup: an earlier build imported the first Twi XML under the
  // temporary code "TWI_XML". It is superseded by the properly-coded XML
  // translations (AKUA / TWIRV), so drop the orphan (cascades to books/verses).
  db.prepare('DELETE FROM bibles WHERE code = ?').run('TWI_XML')

  // Deduplicate any duplicate Bible codes in SQLite table
  try {
    db.exec(`
      DELETE FROM bibles WHERE id NOT IN (
        SELECT MIN(id) FROM bibles GROUP BY code
      );
      DELETE FROM bibles WHERE code IN ('ENGLISHGNTBIBLE', 'EWE2020BIBLE', 'ENGLISHKJBIBLE', 'ENGLISHNIVBIBLE', 'ENGLISHNKJBIBLE');
    `)
  } catch {
    // Ignore
  }

  // Create Hymns & Songs Schema tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS hymns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hymn_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      author TEXT,
      lyrics TEXT NOT NULL,
      source_file TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_hymns_number ON hymns(hymn_number);
  `)

  // Migration: add source_file to hymns for older installs
  try {
    db.exec('ALTER TABLE hymns ADD COLUMN source_file TEXT')
  } catch {
    // Column already exists
  }

  // One-off cleanup: older builds stored raw RTF markup and duplicated rows on
  // every launch. Drop those broken importer rows; the folder scan re-imports
  // them cleanly (see autoScanHymnsFolder).
  db.prepare("DELETE FROM hymns WHERE lyrics LIKE '%\\par%' OR lyrics LIKE '%{\\rtf%'").run()

  // Seed system_status if empty
  const statusCount = db.prepare('SELECT COUNT(*) as count FROM system_status').get()
  if (statusCount.count === 0) {
    db.prepare('INSERT INTO system_status (message) VALUES (?)').run(
      'Offline SQLite Database Initialized Successfully'
    )
  }

  // Seed sample Bible & Hymn data if empty
  seedInitialBibleData()
  seedInitialHymnData()

  // NOTE: the library folders are NOT scanned here. autoScanHymnsFolder alone
  // re-parses ~2,400 .sng files and autoScanBiblesFolder re-executes ~48 MB of
  // SQL plus ten XML Bibles, all synchronously, on every launch. That used to
  // run before the first window was created, so on a slow hard disk the app
  // looked like it simply never started. Callers now open the window first and
  // then call refreshLibraries(), which tracks the Bibles and the hymns
  // separately and skips whichever of them has not changed on disk.

  return dbPath
}

// The two libraries are fingerprinted separately so that adding a Bible does not
// also trigger a re-parse of ~2,400 hymn files, and so that re-scanning Bibles
// cannot mark changed hymns as already imported.
//
// Bundled and user roots are fingerprinted separately because the bundled copy
// lives in the asar and must ignore its mtime - see src/lib/fingerprint.js.
const BIBLE_EXT = ['.sql', '.xml']

const bibleFingerprint = () =>
  [
    fingerprintFiles([bundledDataDir('bibles')], BIBLE_EXT, false),
    fingerprintFiles([userDataDir('bibles')], BIBLE_EXT, true),
  ].join('||')

const hymnFingerprint = () =>
  [
    fingerprintFiles([bundledDataDir('hymns')], ['.sng'], false),
    fingerprintFiles([userDataDir('hymns')], ['.sng'], true),
  ].join('||')

// True when this library's files differ from what was last imported. Returns true
// if there is no stored signature yet, or it cannot be read, so a lost or corrupt
// row degrades to re-importing rather than to silently never importing.
function libraryChanged(key, fingerprint) {
  try {
    const row = db.prepare('SELECT signature FROM import_state WHERE key = ?').get(key)
    return !row || row.signature !== fingerprint
  } catch {
    return true
  }
}

function recordSignature(key, fingerprint) {
  db.prepare(
    'INSERT INTO import_state (key, signature) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET signature = excluded.signature'
  ).run(key, fingerprint)
}

/**
 * Re-imports the Bible and hymn libraries when their files have changed.
 *
 * Deliberately separate from initDatabase() and deliberately idempotent: this is
 * minutes of work on a slow disk, and it used to run before any window existed.
 * Each library is checked on its own, so the two costs are independent.
 * Returns what it did so the caller can log or surface it.
 */
export function refreshLibraries() {
  if (!db) return { changed: false, skipped: 'no database' }

  // Fingerprinted once, before the scan, and that value is what gets recorded. A
  // file touched *during* the import therefore looks changed on the next launch
  // and is read again, which is the safe direction to be wrong in - and it saves
  // a second walk of ~2,400 hymn files.
  const biblesNow = bibleFingerprint()
  const hymnsNow = hymnFingerprint()
  const bibles = libraryChanged('bibles', biblesNow)
  const hymns = libraryChanged('hymns', hymnsNow)
  if (!bibles && !hymns) return { changed: false, skipped: 'up to date' }

  if (bibles) {
    autoScanBiblesFolder()
    recordSignature('bibles', biblesNow)
  }
  if (hymns) {
    autoScanHymnsFolder()
    recordSignature('hymns', hymnsNow)
  }
  return { changed: true, bibles, hymns }
}

export function importSqlFile(filePath) {
  if (!db || !fs.existsSync(filePath)) return { success: false, message: 'File not found' }
  try {
    const sqlContent = fs.readFileSync(filePath, 'utf-8')
    db.exec(sqlContent)
    processImportedTables()
    return { success: true }
  } catch (err) {
    console.error('Failed to execute SQL import:', err)
    return { success: false, error: err.message }
  }
}

const BIBLE_NAMES = {
  NIV: 'New International Version (NIV)',
  NKJV: 'New King James Version (NKJV)',
  KJV: 'King James Version (KJV)',
  TWI: 'Twerɛ Kronkron (Twi Bible - Bible Society of Ghana)'
}

const BOOK_NAME_MAP = {
  Gen: 'Genesis', Exo: 'Exodus', Lev: 'Leviticus', Num: 'Numbers', Deu: 'Deuteronomy',
  Jos: 'Joshua', Jdg: 'Judges', Rut: 'Ruth', '1Sa': '1 Samuel', '2Sa': '2 Samuel',
  '1Ki': '1 Kings', '2Ki': '2 Kings', '1Ch': '1 Chronicles', '2Ch': '2 Chronicles',
  Ezr: 'Ezra', Neh: 'Nehemiah', Est: 'Esther', Job: 'Job', Psa: 'Psalms',
  Pro: 'Proverbs', Ecc: 'Ecclesiastes', Sng: 'Song of Solomon', Isa: 'Isaiah',
  Jer: 'Jeremiah', Lam: 'Lamentations', Ezk: 'Ezekiel', Dan: 'Daniel', Hos: 'Hosea',
  Joe: 'Joel', Amo: 'Amos', Oba: 'Obadiah', Jon: 'Jonah', Mic: 'Micah',
  Nah: 'Nahum', Hab: 'Habakkuk', Zep: 'Zephaniah', Hag: 'Haggai', Zec: 'Zechariah',
  Mal: 'Malachi', Mat: 'Matthew', Mar: 'Mark', Luk: 'Luke', Joh: 'John',
  Act: 'Acts', Rom: 'Romans', '1Co': '1 Corinthians', '2Co': '2 Corinthians',
  Gal: 'Galatians', Eph: 'Ephesians', Php: 'Philippians', Col: 'Colossians',
  '1Th': '1 Thessalonians', '2Th': '2 Thessalonians', '1Ti': '1 Timothy', '2Ti': '2 Timothy',
  Tit: 'Titus', Phm: 'Philemon', Heb: 'Hebrews', Jas: 'James', '1Pe': '1 Peter',
  '2Pe': '2 Peter', '1Jo': '1 John', '2Jo': '2 John', '3Jo': '3 John', Jud: 'Jude', Rev: 'Revelation'
}

function processImportedTables() {
  if (!db) return
  const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
  const tableNames = tableRows.map((t) => t.name.toLowerCase())

  for (const table of ['niv', 'nkjv', 'kjv']) {
    if (!tableNames.includes(table)) continue

    const code = table.toUpperCase()

    // Check if Bible already exists in `bibles`
    let bible = db.prepare('SELECT id FROM bibles WHERE code = ?').get(code)
    if (!bible) {
      const name = BIBLE_NAMES[code] || `${code} Bible`
      const res = db.prepare('INSERT INTO bibles (code, name, language, source_file) VALUES (?, ?, ?, ?)').run(
        code,
        name,
        'English',
        'NKJV.sql / NIV.sql / KJV.sql'
      )
      bible = { id: res.lastInsertRowid }
    } else {
      // Check if verses already imported for this bible
      const existingVerse = db.prepare(
        'SELECT v.id FROM verses v JOIN books b ON v.book_id = b.id WHERE b.bible_id = ? LIMIT 1'
      ).get(bible.id)
      if (existingVerse) continue // Already imported
    }

    // Inspect columns of raw table
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name.toLowerCase())
    const chCol = columns.includes('chapternumber') ? 'chapternumber' : 'chapter'
    const vCol = columns.includes('versenumber') ? 'versenumber' : 'verse'
    const txtCol = columns.includes('verse') ? 'verse' : 'text'

    // Get distinct books in order
    const rawBooks = db.prepare(`SELECT DISTINCT book FROM "${table}"`).all().map((r) => r.book)

    const insertBook = db.prepare('INSERT INTO books (bible_id, book_number, name, testament) VALUES (?, ?, ?, ?)')
    const insertVerse = db.prepare('INSERT INTO verses (book_id, chapter, verse, text) VALUES (?, ?, ?, ?)')

    const importTxn = db.transaction(() => {
      let bookOrder = 1
      for (const rawBookName of rawBooks) {
        const cleanName = BOOK_NAME_MAP[rawBookName] || rawBookName
        const testament = bookOrder <= 39 ? 'OT' : 'NT'
        const bookRes = insertBook.run(bible.id, bookOrder++, cleanName, testament)
        const bookId = bookRes.lastInsertRowid

        const rows = db.prepare(
          `SELECT "${chCol}" as ch, "${vCol}" as v, "${txtCol}" as txt FROM "${table}" WHERE book = ? ORDER BY verseid ASC`
        ).all(rawBookName)

        for (const row of rows) {
          if (row.txt) {
            insertVerse.run(bookId, row.ch, row.v, row.txt)
          }
        }
      }
    })

    importTxn()
  }
}

// Known bundled XML Bibles — stable codes + display names.
// TWI = Twerɛ Kronkron (Bible Society of Ghana) so Genesis 1:1 etc. import cleanly.
const XML_BIBLE_FILE_DEFS = {
  'TwiKronkronBible.xml': { code: 'TWI', name: 'Twerɛ Kronkron (Asante-Twi Bible — Bible Society of Ghana, 2017)', twi: true, language: 'Twi' },
  'TwiAsanteBible.xml': { code: 'ASNA', name: 'Asante Twi — Nkwa Asɛm (Biblica, 1996/2020)', twi: true, language: 'Twi' },
  'TwiAkuapemBible.xml': { code: 'AKUA', name: 'Akuapem Twi — Nkwa Asɛm (2020)', twi: true, language: 'Twi' },
  'TwiDCBible.xml': { code: 'TWIDC', name: 'Twerɛ Kronkron DC — Asante-Twi with Deutero-Canons (BSG, 2017)', twi: true, language: 'Twi' },
  'TwiRevisedBible.xml': { code: 'TWIRV', name: 'New Revised Asante Twi Bible (2012)', twi: true, language: 'Twi' },
  'EnglishGNTBible.xml': { code: 'GNT', name: 'Good News Translation (GNT)', twi: false, language: 'English' },
  'EnglishNIVBible.xml': { code: 'NIV', name: 'New International Version (NIV)', twi: false, language: 'English' },
  'EnglishNKJBible.xml': { code: 'NKJV', name: 'New King James Version (NKJV)', twi: false, language: 'English' },
  'EnglishKJBible.xml': { code: 'KJV', name: 'King James Version (KJV)', twi: false, language: 'English' },
  'Ewe2020Bible.xml': { code: 'EWE', name: 'Agbenya La (Ewe Bible - Biblica 2020)', twi: false, language: 'Ewe' },
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)) } catch { return '' } })
    .replace(/&amp;/g, '&')
    .trim()
}

export function importXmlBibleFile(filePath) {
  if (!db || !fs.existsSync(filePath)) return { success: false, message: 'File not found' }
  try {
    const rawBuffer = fs.readFileSync(filePath)
    let content = ''
    if ((rawBuffer[0] === 0xFF && rawBuffer[1] === 0xFE) || rawBuffer.includes(0x00)) {
      content = rawBuffer.toString('utf16le')
    } else {
      content = rawBuffer.toString('utf8')
    }
    content = content.replace(/^\uFEFF/, '')

    const fileName = path.basename(filePath, path.extname(filePath))
    let xmlFileDef = XML_BIBLE_FILE_DEFS[path.basename(filePath)]
    if (!xmlFileDef) {
      const fn = fileName.toLowerCase()
      if (fn.includes('gnt')) xmlFileDef = XML_BIBLE_FILE_DEFS['EnglishGNTBible.xml']
      else if (fn.includes('ewe')) xmlFileDef = XML_BIBLE_FILE_DEFS['Ewe2020Bible.xml']
      else if (fn.includes('nkjv')) xmlFileDef = XML_BIBLE_FILE_DEFS['EnglishNKJBible.xml']
      else if (fn.includes('niv')) xmlFileDef = XML_BIBLE_FILE_DEFS['EnglishNIVBible.xml']
      else if (fn.includes('kjv')) xmlFileDef = XML_BIBLE_FILE_DEFS['EnglishKJBible.xml']
    }
    const headerSnippet = content.slice(0, 2048).toLowerCase()
    const isExplicitEnglish = fileName.toLowerCase().includes('english') || (content.match(/translation=["']([^"']+)["']/i) || [])[1]?.toLowerCase().includes('english')
    const isExplicitEwe = fileName.toLowerCase().includes('ewe') || (content.match(/translation=["']([^"']+)["']/i) || [])[1]?.toLowerCase().includes('ewe')
    const isExplicitTwi = fileName.toLowerCase().includes('twi') || (content.match(/translation=["']([^"']+)["']/i) || [])[1]?.toLowerCase().includes('twi') || headerSnippet.includes('language="twi"') || headerSnippet.includes("language='twi'")
    const isTwi = xmlFileDef ? xmlFileDef.twi : (isExplicitTwi && !isExplicitEnglish)

    const transMatch = content.match(/translation=["']([^"']+)["']/i) || content.match(/biblename=["']([^"']+)["']/i) || content.match(/<title>([^<]+)<\/title>/i)
    const xmlTitle = transMatch ? transMatch[1].trim() : fileName

    let code = xmlFileDef ? xmlFileDef.code : null
    if (!code) {
      const titleCodeMatch = xmlTitle.match(/\(([A-Za-z0-9]{2,6})\)/) || xmlTitle.match(/(?:English|Twi|Ewe)\s+([A-Za-z0-9]{2,6})\b/i)
      const fnCodeMatch = fileName.match(/^(?:English|Twi|Ewe)?([A-Za-z0-9]{2,6})(?:Bible)?$/i)
      if (titleCodeMatch) {
        code = titleCodeMatch[1].toUpperCase()
      } else if (fnCodeMatch) {
        code = fnCodeMatch[1].toUpperCase()
      } else {
        code = fileName.toUpperCase().replace(/[^A-Z0-9]/g, '_')
      }
    }

    // Clean up any previously mis-imported legacy code for this file if code changed
    const legacyCode = fileName.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    if (code !== legacyCode) {
      const oldBible = db.prepare('SELECT id FROM bibles WHERE code = ?').get(legacyCode)
      if (oldBible) {
        db.prepare('DELETE FROM verses WHERE book_id IN (SELECT id FROM books WHERE bible_id = ?)').run(oldBible.id)
        db.prepare('DELETE FROM books WHERE bible_id = ?').run(oldBible.id)
        db.prepare('DELETE FROM bibles WHERE id = ?').run(oldBible.id)
      }
    }
    const name = xmlFileDef ? xmlFileDef.name : (isTwi && !xmlTitle.toLowerCase().includes('twi') ? `${xmlTitle} (Twi)` : xmlTitle)
    let language = 'English'
    if (xmlFileDef && xmlFileDef.language) {
      language = xmlFileDef.language
    } else if (isExplicitEwe) {
      language = 'Ewe'
    } else if (isTwi) {
      language = 'Twi'
    }

    let bible = db.prepare('SELECT id FROM bibles WHERE code = ?').get(code)
    if (!bible) {
      const res = db.prepare('INSERT INTO bibles (code, name, language, source_file) VALUES (?, ?, ?, ?)').run(code, name, language, path.basename(filePath))
      bible = { id: res.lastInsertRowid }
    } else {
      db.prepare('UPDATE bibles SET name = ?, language = ?, source_file = ? WHERE id = ?').run(name, language, path.basename(filePath), bible.id)
      const existingBooks = db.prepare('SELECT id FROM books WHERE bible_id = ?').all(bible.id)
      if (existingBooks.length > 0) {
        const deleteVerses = db.prepare('DELETE FROM verses WHERE book_id = ?')
        const deleteBook = db.prepare('DELETE FROM books WHERE id = ?')
        db.transaction(() => {
          for (const bk of existingBooks) {
            deleteVerses.run(bk.id)
            deleteBook.run(bk.id)
          }
        })()
      }
    }

    const insertBook = db.prepare('INSERT INTO books (bible_id, book_number, name, testament) VALUES (?, ?, ?, ?)')
    const insertVerse = db.prepare('INSERT INTO verses (book_id, chapter, verse, text) VALUES (?, ?, ?, ?)')

    let bookOrder = 1
    let totalVerses = 0

    const bookRegex = /<(?:BIBLEBOOK|book|div\s+[^>]*type=["']book["'])[\s\S]*?<\/(?:BIBLEBOOK|book|div)>/gi
    const bookMatches = content.match(bookRegex)

    const importTxn = db.transaction(() => {
      if (bookMatches && bookMatches.length > 0) {
        for (const bookXml of bookMatches) {
          let rawBName = ''
          let bNumAttr = 0

          const bNameMatch = bookXml.match(/(?:bname|bsname|name|osisID|id)=["']([^"']+)["']/i)
          if (bNameMatch) rawBName = bNameMatch[1].trim()

          const bNumMatch = bookXml.match(/(?:bnumber|number|n|b)=["']?(\d+)["']?/i)
          if (bNumMatch) bNumAttr = parseInt(bNumMatch[1], 10)

          const bookNum = bNumAttr > 0 ? bNumAttr : bookOrder
          bookOrder = Math.max(bookOrder, bookNum + 1)

          const canonicalEntry = CANONICAL_BIBLE.find(b => b.number === bookNum)
          let cleanName = BOOK_NAME_MAP[rawBName] || rawBName
          if (!cleanName && canonicalEntry) {
            cleanName = isTwi ? canonicalEntry.tw : canonicalEntry.en
          }
          if (!cleanName) cleanName = `Book ${bookNum}`

          const testament = bookNum <= 39 ? 'OT' : 'NT'

          const bookRes = insertBook.run(bible.id, bookNum, cleanName, testament)
          const bookId = bookRes.lastInsertRowid

          const chapterRegex = /<(?:CHAPTER|chapter|c)[\s\S]*?<\/(?:CHAPTER|chapter|c)>/gi
          const chapterMatches = bookXml.match(chapterRegex)

          if (chapterMatches && chapterMatches.length > 0) {
            for (const chXml of chapterMatches) {
              let chNum = 1
              const chNumMatch = chXml.match(/(?:cnumber|number|n|c|id)=["']?(\d+)["']?/i)
              if (chNumMatch) chNum = parseInt(chNumMatch[1], 10)

              const verseRegex = /<(?:VERS|verse|v)[^>]*?(?:vnumber|number|n|id)=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/(?:VERS|verse|v)>/gi
              let vMatch
              while ((vMatch = verseRegex.exec(chXml)) !== null) {
                const vNum = parseInt(vMatch[1], 10)
                let vText = decodeXmlEntities(vMatch[2].replace(/<[^>]+>/g, ''))
                if (vText) {
                  insertVerse.run(bookId, chNum, vNum, vText)
                  totalVerses++
                }
              }
            }
          } else {
            const verseRegex = /<(?:VERS|verse|v)[^>]*?(?:vnumber|number|n|id)=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/(?:VERS|verse|v)>/gi
            let vMatch
            while ((vMatch = verseRegex.exec(bookXml)) !== null) {
              const vNum = parseInt(vMatch[1], 10)
              let vText = decodeXmlEntities(vMatch[2].replace(/<[^>]+>/g, ''))
              if (vText) {
                insertVerse.run(bookId, 1, vNum, vText)
                totalVerses++
              }
            }
          }
        }
      }
      return totalVerses
    })

    const count = importTxn()
    return { success: true, count, code }
  } catch (err) {
    console.error('Failed to import XML Bible file:', err)
    return { success: false, error: err.message }
  }
}

export function autoScanBiblesFolder() {
  try {
    // Read-only: the copy that ships with the app, inside the asar.
    const bundledDir = bundledDataDir('bibles')
    // Writable: where the user drops their own .sql / .xml files.
    const userDir = userDataDir('bibles')
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }

    // Ensure bibles/xml exists with an empty marker so users know where to drop files
    const userXmlDir = path.join(userDir, 'xml')
    if (!fs.existsSync(userXmlDir)) {
      fs.mkdirSync(userXmlDir, { recursive: true })
      const readmeText = `Church Presenter — Bible Data Importer Folder
==============================================
This folder lives in your app data directory and is yours to write to:
${userDir}

Place your Bible files in these folders to import them on the next app start:

1. SQL Files (.sql):
   - Drop NKJV.sql, NIV.sql, or KJV.sql files directly into this folder.

2. XML Files (.xml):
   - Drop structured Bible XML files (Zefania/OSIS/USFX or
     "<book number>...<chapter number>...<verse number>") into the "xml" subfolder.
   - The bundled NIV / NKJV / KJV (English) and Twerɛ Kronkron (Twi) XML Bibles
     already ship with the app and do not need to be copied here.

3. Songs (.sng):
   - Drop "PH01.sng" style files into this folder.
`
      fs.writeFileSync(path.join(userXmlDir, 'README.txt'), readmeText, 'utf-8')
    }

    // Import from the bundled copy first, then the user's folder, so a user's
    // files win if the same name exists in both.
    for (const biblesDir of [bundledDir, userDir]) {
      if (!fs.existsSync(biblesDir) || !fs.statSync(biblesDir).isDirectory()) continue

      // Auto-import any .sql files in bibles/
      const sqlFiles = fs.readdirSync(biblesDir).filter((f) => f.endsWith('.sql'))
      for (const file of sqlFiles) {
        importSqlFile(path.join(biblesDir, file))
      }
    }

    // Process imported tables into normalized schema
    processImportedTables()

    // Auto-import XML files from bibles/ and bibles/xml/ in both locations
    for (const biblesDir of [bundledDir, userDir]) {
      if (!fs.existsSync(biblesDir) || !fs.statSync(biblesDir).isDirectory()) continue
      const xmlDir = path.join(biblesDir, 'xml')
      if (fs.existsSync(xmlDir) && fs.statSync(xmlDir).isDirectory()) {
        const xmlFiles = fs.readdirSync(xmlDir).filter((f) => f.endsWith('.xml'))
        for (const file of xmlFiles) {
          importXmlBibleFile(path.join(xmlDir, file))
        }
      }
      const rootXmlFiles = fs.readdirSync(biblesDir).filter((f) => f.endsWith('.xml'))
      for (const file of rootXmlFiles) {
        importXmlBibleFile(path.join(biblesDir, file))
      }
    }
  } catch (err) {
    console.warn('Auto scan bibles folder notice:', err.message)
  }
}

// Windows-1252 code points that RTF hex escapes (\'92 etc.) rely on
const CP1252 = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
  0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘',
  0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜',
  0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ', 0xb6: '•'
}

// Convert the RTF body of a .sng file to readable plain text (verse breaks on \par)
function rtfToPlainText(rtf) {
  let text = String(rtf || '')
  // Drop whole header groups (fonts/colors/info) before stripping braces
  text = text.replace(/\{\\fonttbl(?:\{[^{}]*\})*\}/g, '')
  text = text.replace(/\{\\colortbl[^{}]*\}/g, '')
  text = text.replace(/\{\\info(?:\{[^{}]*\})*\}/g, '')
  text = text.replace(/\{\\\*\\[^{}]*\}/g, '')
  text = text.replace(/\r?\n/g, '')
  text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
    const code = parseInt(hex, 16)
    return CP1252[code] !== undefined ? CP1252[code] : String.fromCharCode(code)
  })
  // Protect escaped braces so group-brace stripping does not eat them
  text = text.replace(/\\([\\{}])/g, (_, ch) => (ch === '\\' ? '\\' : ch === '{' ? '\u0001' : '\u0002'))
  text = text.replace(/\\par\b/g, '\n').replace(/\\line\b/g, '\n').replace(/\\tab\b/g, '\t')
  text = text.replace(/\\[a-zA-Z]+-?\d* ?/g, '')
  text = text.replace(/\\[^a-zA-Z]/g, '')
  text = text.replace(/[{}]/g, '')
  text = text.replace(/\u0001/g, '{').replace(/\u0002/g, '}')
  return text
    .replace(/^[ \t]+/gm, '')
    .replace(/[ \t]+$/gm, '')
    // SongShow marks section headings and verse/chorus breaks with a bullet
    // glyph (\'b6 / \'95). Keep the heading text, drop the bare separator lines
    // so a stray dot never becomes its own line on the slide.
    .replace(/^•+[ \t]*$\n?/gm, '')
    .replace(/^•+[ \t]*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// The Twi hymnals come from a "WL-Sims Akan" font where ASCII brackets stand in
// for the Akan vowels: [ => ɛ, ] => ɔ (lowercase) and { => Ɛ, } => Ɔ (uppercase).
function twiGlyphFix(text) {
  return String(text || '')
    .replace(/\[/g, 'ɛ')
    .replace(/\]/g, 'ɔ')
    .replace(/\{/g, 'Ɛ')
    .replace(/\}/g, 'Ɔ')
}

function parseHymnNumber(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue
    const match = String(candidate).match(/(\d{1,4})/)
    if (match) return parseInt(match[1], 10)
  }
  return 0
}

// Map a hymns/ sub-folder name to the category + author used across the app
export function deriveCategoryAndAuthor(folderName) {
  const category = String(folderName || '').trim() || 'General Hymns'
  const lower = category.toLowerCase()
  const methodist = lower.includes('methodist')
  const twi = lower.includes('twi')
  const author = methodist ? 'Methodist Church Ghana' : 'Presbyterian Church of Ghana'
  return { category, author, isTwi: twi }
}

export function importSngFile(filePath, defaultCategory, defaultAuthor, isTwi) {
  if (!db || !fs.existsSync(filePath)) return { success: false, message: 'File not found' }
  try {
    const baseName = path.basename(filePath, path.extname(filePath))
    if (/^readme/i.test(baseName)) return { success: false, message: 'Skipped readme' }

    const rawBuffer = fs.readFileSync(filePath)
    let content = ''
    if ((rawBuffer[0] === 0xFF && rawBuffer[1] === 0xFE) || rawBuffer.includes(0x00)) {
      content = rawBuffer.toString('utf16le')
    } else {
      content = rawBuffer.toString('utf8')
    }
    content = content.replace(/^\uFEFF/, '')

    // Collect the "##Key=Value" metadata block used by SongShow-style .sng files
    const meta = {}
    for (const rawLine of content.split(/\r?\n/)) {
      const match = rawLine.trim().match(/^#+\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
      if (match) meta[match[1].toLowerCase()] = match[2].trim()
    }

    let title = meta.title || baseName
    title = title.replace(/\s*\([A-Za-z]{1,4}\s*\d+\)\s*$/, '').trim() || baseName
    // Some Twi titles carry a trailing full stop from the source file.
    title = title.replace(/\s*\.\s*$/, '').trim() || title
    if (isTwi) title = twiGlyphFix(title)

    const hymnNumber = parseHymnNumber(meta.userinfo1, meta.cclinum, meta.number, baseName, title)
    const author = meta.wordsby || meta.musicby || defaultAuthor || 'Church Library'
    const category = defaultCategory ? defaultCategory : (meta.category || 'General Hymn')

    let lyrics = ''
    const rtfStart = content.search(/\{\\rtf/i)
    if (rtfStart >= 0) {
      lyrics = rtfToPlainText(content.slice(rtfStart))
    } else {
      lyrics = content
        .split(/\r?\n/)
        .filter((line) => !/^\s*#+\s*[A-Za-z0-9_]+\s*=/.test(line))
        .join('\n')
        .trim()
    }
    if (isTwi) lyrics = twiGlyphFix(lyrics)
    if (!lyrics) return { success: false, message: 'No lyrics found' }

    const sourceFile = librarySourceLabel(filePath)
    const insert = db.prepare(
      'INSERT INTO hymns (hymn_number, title, category, author, lyrics, source_file) VALUES (?, ?, ?, ?, ?, ?)'
    )
    insert.run(hymnNumber, title, category, author, lyrics, sourceFile)

    return { success: true, title, hymnNumber }
  } catch (err) {
    console.error('Failed to import .sng file:', err)
    return { success: false, error: err.message }
  }
}

export function importSngFolder(folderPath, defaultCategory, defaultAuthor, isTwi) {
  if (!db || !fs.existsSync(folderPath)) return { success: false, message: 'Folder not found' }
  try {
    const files = fs.readdirSync(folderPath).filter((f) => f.endsWith('.sng') && !/^readme/i.test(f))
    const importAll = db.transaction(() => {
      let count = 0
      for (const file of files) {
        const res = importSngFile(path.join(folderPath, file), defaultCategory, defaultAuthor, isTwi)
        if (res.success) count++
      }
      return count
    })
    return { success: true, count: importAll() }
  } catch (err) {
    console.error('Failed to import .sng folder:', err)
    return { success: false, error: err.message }
  }
}

export function autoScanHymnsFolder() {
  try {
    // The user's writable folder has to exist even when the bundled library is
    // present, so the app can tell people where to drop their own .sng files.
    const userDir = userDataDir('hymns')
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }

    // Clean scan of hymns folder to populate SQLite directly from subfolders
    db.prepare('DELETE FROM hymns').run()

    // Scan the bundled copy inside the asar as well as the user's folder.
    for (const hymnsDir of [bundledDataDir('hymns'), userDir]) {
      if (!fs.existsSync(hymnsDir) || !fs.statSync(hymnsDir).isDirectory()) continue
      const subdirs = fs.readdirSync(hymnsDir).filter((f) => {
        try {
          return fs.statSync(path.join(hymnsDir, f)).isDirectory()
        } catch {
          return false
        }
      })
      for (const sub of subdirs) {
        const { category, author, isTwi } = deriveCategoryAndAuthor(sub)
        importSngFolder(path.join(hymnsDir, sub), category, author, isTwi)
      }
    }
  } catch (err) {
    console.warn('Auto scan hymns folder notice:', err.message)
  }
}

function seedInitialBibleData() {
  const bibleCount = db.prepare('SELECT COUNT(*) as count FROM bibles').get()
  if (bibleCount.count > 0) return

  const insertBible = db.prepare('INSERT INTO bibles (code, name, language) VALUES (?, ?, ?)')
  const kjvResult = insertBible.run('KJV', 'King James Version', 'English')
  const kjvId = kjvResult.lastInsertRowid

  const insertBook = db.prepare('INSERT INTO books (bible_id, book_number, name, testament) VALUES (?, ?, ?, ?)')
  const genResult = insertBook.run(kjvId, 1, 'Genesis', 'OT')
  const pslResult = insertBook.run(kjvId, 19, 'Psalms', 'OT')
  const jhnResult = insertBook.run(kjvId, 43, 'John', 'NT')

  const genId = genResult.lastInsertRowid
  const pslId = pslResult.lastInsertRowid
  const jhnId = jhnResult.lastInsertRowid

  const insertVerse = db.prepare('INSERT INTO verses (book_id, chapter, verse, text) VALUES (?, ?, ?, ?)')
  
  insertVerse.run(genId, 1, 1, 'In the beginning God created the heaven and the earth.')
  insertVerse.run(genId, 1, 2, 'And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.')
  insertVerse.run(genId, 1, 3, 'And God said, Let there be light: and there was light.')

  insertVerse.run(pslId, 23, 1, 'The LORD is my shepherd; I shall not want.')
  insertVerse.run(pslId, 23, 2, 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.')
  insertVerse.run(pslId, 23, 3, 'He restoreth my soul: he leadeth me in the paths of righteousness for his name\'s sake.')

  insertVerse.run(jhnId, 3, 16, 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.')
  insertVerse.run(jhnId, 3, 17, 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.')
}

function seedInitialHymnData() {
  const hymnCount = db.prepare('SELECT COUNT(*) as count FROM hymns').get()
  if (hymnCount.count > 0) return

  const insertHymn = db.prepare('INSERT INTO hymns (hymn_number, title, category, author, lyrics) VALUES (?, ?, ?, ?, ?)')

  insertHymn.run(
    1,
    'Amazing Grace',
    'General Hymn',
    'John Newton',
    'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.\n\n\'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed!'
  )

  insertHymn.run(
    12,
    'Great Is Thy Faithfulness',
    'Worship',
    'Thomas Chisholm',
    'Great is Thy faithfulness, O God my Father,\nThere is no shadow of turning with Thee;\nThou changest not, Thy compassions, they fail not;\nAs Thou hast been Thou forever wilt be.\n\nGreat is Thy faithfulness!\nGreat is Thy faithfulness!\nMorning by morning new mercies I see.'
  )

  insertHymn.run(
    100,
    'Aseda Nka Nyankopɔn (Thanks Be to God)',
    'Ghanaian Worship / Twi',
    'Traditional Church Song',
    'Aseda nka Nyankopɔn wɔ sorosoro;\nNe dɔ ne ne adom dooso ma yɛn.\nMo hyira Ne din krɔnkrɔn no daa,\nƆye, Ne m mobɔhye tim hɔ daa.'
  )
}

export function getStatusMessage() {
  if (!db) return null
  return db.prepare('SELECT * FROM system_status ORDER BY id DESC LIMIT 1').get()
}

export function getBibles() {
  if (!db) return []
  return db.prepare('SELECT * FROM bibles ORDER BY id ASC').all()
}

export function getBibleStats() {
  if (!db) return []
  const bibles = getBibles()
  const stats = bibles.map((bible) => {
    const bookCount = db.prepare('SELECT COUNT(*) as count FROM books WHERE bible_id = ?').get(bible.id).count
    const verseCount = db.prepare('SELECT COUNT(*) as count FROM verses v JOIN books b ON v.book_id = b.id WHERE b.bible_id = ?').get(bible.id).count
    const sourceFile = db.prepare('SELECT source_file FROM bibles WHERE id = ?').get(bible.id)?.source_file || null
    return { ...bible, bookCount, verseCount, sourceFile }
  })
  return stats
}

export function removeBible(bibleId) {
  if (!db) return { success: false, error: 'DB not ready' }
  const bible = db.prepare('SELECT id, code, source_file FROM bibles WHERE id = ?').get(bibleId)
  if (!bible) return { success: false, error: 'Bible not found' }
  if (bible.code.toUpperCase() === 'NIV' || bible.code.toUpperCase() === 'NKJV' || bible.code.toUpperCase() === 'KJV' || bible.code.toUpperCase() === 'TWI') {
    return { success: false, error: 'This is a default bundled Bible and cannot be deleted' }
  }
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM books WHERE bible_id = ?').run(bible.id)
      db.prepare('DELETE FROM bibles WHERE id = ?').run(bible.id)
    })()
    if (bible.source_file) {
      const userFile = path.join(userDataDir('bibles'), 'xml', path.basename(bible.source_file))
      if (fs.existsSync(userFile)) {
        try { fs.unlinkSync(userFile) } catch {}
      }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export function rescanBiblesFolder() {
  try {
    // The user pressed Rescan, so always re-read the Bible files rather than
    // trusting the fingerprint that made startup skip them. Only the Bible
    // signature is refreshed: stamping the hymn one too would hide hymn changes
    // that this function never actually re-read.
    autoScanBiblesFolder()
    recordSignature('bibles', bibleFingerprint())
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export function getBooks(bibleId = 1) {
  if (!db) return []
  const books = db.prepare('SELECT * FROM books WHERE bible_id = ? ORDER BY book_number ASC').all(bibleId)
  return books.map((b) => {
    const chRes = db.prepare('SELECT MAX(chapter) as maxCh FROM verses WHERE book_id = ?').get(b.id)
    return {
      ...b,
      chaptersCount: chRes && chRes.maxCh ? chRes.maxCh : 1
    }
  })
}

export function getVerses(bookId, chapter) {
  if (!db) return []
  return db.prepare('SELECT * FROM verses WHERE book_id = ? AND chapter = ? ORDER BY verse ASC').all(bookId, chapter)
}

// Gestalt-free keyword helpers: collapse separators so '1 Cor' == '1cor'.
const NORM_KEY = (s) => String(s || '').toLowerCase().replace(/[\s.,'"’]+/g, '')

const BOOK_ABBREVIATIONS = {
  genesis: ['gen', 'gn'],
  exodus: ['exo', 'exod', 'ex'],
  leviticus: ['lev', 'lv'],
  numbers: ['num', 'nu', 'nm'],
  deuteronomy: ['deut', 'dt'],
  joshua: ['josh', 'jos'],
  judges: ['judg', 'jdg'],
  ruth: ['rt', 'ru'],
  '1 samuel': ['1sam', '1sm', '1samuel'],
  '2 samuel': ['2sam', '2sm', '2samuel'],
  '1 kings': ['1kg', '1kgs', '1k', '1kings'],
  '2 kings': ['2kg', '2kgs', '2k', '2kings'],
  '1 chronicles': ['1chr', '1ch', '1chronicles'],
  '2 chronicles': ['2chr', '2ch', '2chronicles'],
  ezra: ['ezr', 'ez'],
  nehemiah: ['neh', 'ne'],
  esther: ['est', 'es'],
  job: ['jb'],
  psalms: ['ps', 'psa', 'psalm'],
  proverbs: ['prov', 'prv', 'pr'],
  ecclesiastes: ['eccl', 'ecc', 'ec'],
  'song of solomon': ['song', 'sos'],
  isaiah: ['isa', 'is'],
  jeremiah: ['jer', 'jr'],
  lamentations: ['lam', 'la'],
  ezekiel: ['ezek', 'ezk'],
  daniel: ['dan', 'dn'],
  hosea: ['hos', 'ho'],
  joel: ['jl'],
  amos: ['am'],
  obadiah: ['obad', 'ob'],
  jonah: ['jon', 'jh'],
  micah: ['mic', 'mi'],
  nahum: ['nah', 'na'],
  habakkuk: ['hab', 'hb'],
  zephaniah: ['zeph', 'zep'],
  haggai: ['hag', 'hg'],
  zechariah: ['zech', 'zec'],
  malachi: ['mal', 'ml'],
  matthew: ['matt', 'mt'],
  mark: ['mr', 'mk'],
  luke: ['lk'],
  john: ['jn', 'jhn'],
  acts: ['act', 'ac'],
  romans: ['rom', 'rm', 'ro'],
  '1 corinthians': ['1cor', '1co', '1corinthians'],
  '2 corinthians': ['2cor', '2co', '2corinthians'],
  galatians: ['gal', 'ga'],
  ephesians: ['eph', 'ep'],
  philippians: ['phil', 'php', 'ph'],
  colossians: ['col', 'cl'],
  '1 thessalonians': ['1thess', '1th', '1thessalonians'],
  '2 thessalonians': ['2thess', '2th', '2thessalonians'],
  '1 timothy': ['1tim', '1ti', '1timothy'],
  '2 timothy': ['2tim', '2ti', '2timothy'],
  titus: ['tit'],
  philemon: ['philem', 'phm'],
  hebrews: ['heb', 'he'],
  james: ['jas', 'jm'],
  '1 peter': ['1pet', '1pe', '1peter'],
  '2 peter': ['2pet', '2pe', '2peter'],
  '1 john': ['1john', '1jn', '1jhn'],
  '2 john': ['2john', '2jn'],
  '3 john': ['3john', '3jn'],
  jude: ['jud'],
  revelation: ['rev', 're'],
}

const BOOK_ALIAS_TO_NUMBER = {}
for (const [enName, aliases] of Object.entries(BOOK_ABBREVIATIONS)) {
  const book = CANONICAL_BIBLE.find((b) => b.en.toLowerCase() === enName)
  if (!book) continue
  BOOK_ALIAS_TO_NUMBER[NORM_KEY(enName)] = book.number
  BOOK_ALIAS_TO_NUMBER[NORM_KEY(book.tw)] = book.number
  for (const alias of aliases) BOOK_ALIAS_TO_NUMBER[NORM_KEY(alias)] = book.number
}

function resolveBookNumber(rawBookPart, books) {
  const norm = NORM_KEY(rawBookPart)
  if (BOOK_ALIAS_TO_NUMBER[norm] !== undefined) return BOOK_ALIAS_TO_NUMBER[norm]
  for (const b of books) {
    if (normalizeBookName(b.name) === norm) return b.book_number
  }
  return null
}

// Parses "Book Ch[:V[-V2]]" style queries (e.g. "John 3:16", "1 Cor 13:4-7").
function parseReferenceQuery(query) {
  const q = String(query || '').trim()
  if (!q) return null
  const tail = q.match(/(\d+)(?:\s*[:.-]\s*(\d+))?(?:\s*[-–]\s*(\d+))?$/)
  if (!tail) return null
  const bookPart = q.slice(0, tail.index).trim()
  if (!bookPart || bookPart.length < 2) return null
  return {
    bookPart,
    chapter: parseInt(tail[1], 10),
    verseStart: tail[2] ? parseInt(tail[2], 10) : null,
    verseEnd: tail[3] ? parseInt(tail[3], 10) : null,
  }
}

export function searchVerses(query, bibleId) {
  if (!db || !query) return []
  const q = String(query).trim()
  if (!q) return []

  const books = getBooks(bibleId || 1)

  // Reference-style search (e.g. "John 3:16") returns the exact verses.
  const ref = parseReferenceQuery(q)
  if (ref) {
    const bookNumber = resolveBookNumber(ref.bookPart, books)
    const book = bookNumber ? books.find((b) => b.book_number === bookNumber) : null
    if (book) {
      const verseStart = ref.verseStart || 1
      const verseEnd = ref.verseEnd || ref.verseStart || Number.MAX_SAFE_INTEGER
      return db.prepare(`
        SELECT v.*, b.name as book_name
        FROM verses v
        JOIN books b ON v.book_id = b.id
        WHERE v.book_id = ? AND v.chapter = ? AND v.verse BETWEEN ? AND ?
        ORDER BY v.verse ASC
      `).all(book.id, ref.chapter, verseStart, verseEnd)
    }
  }

  // Keyword search: every whitespace-separated term must appear in the verse.
  const tokens = q.split(/\s+/).filter(Boolean)
  const conds = []
  const params = []
  for (const tok of tokens) {
    const esc = tok.replace(/[\\%_]/g, (m) => `\\${m}`)
    conds.push("(v.text LIKE ? ESCAPE '\\')")
    params.push(`%${esc}%`)
  }
  const tokenWhere = conds.length ? `(${conds.join(' AND ')}) AND ` : ''
  return db.prepare(`
    SELECT v.*, b.name as book_name
    FROM verses v
    JOIN books b ON v.book_id = b.id
    WHERE ${tokenWhere}(? IS NULL OR b.bible_id = ?)
    ORDER BY b.book_number ASC, v.chapter ASC, v.verse ASC
    LIMIT 50
  `).all(...params, bibleId || null, bibleId || null)
}

export function getHymns() {
  if (!db) return []
  return db.prepare('SELECT * FROM hymns ORDER BY hymn_number ASC').all()
}

// Lightweight list for the Songs tab: no full lyrics, just a short excerpt so the
// initial fetch stays fast even with 2000+ hymns.
export function listHymns(searchQuery, activeCategory) {
  if (!db) return []
  const query = searchQuery && String(searchQuery).trim()
  const cat = activeCategory && activeCategory !== 'All' ? String(activeCategory).trim() : null

  const select = (whereClause, params) =>
    db.prepare(`
      SELECT id, hymn_number, title, category, author,
             substr(replace(replace(lyrics, char(10), ' '), char(13), ' '), 1, 90) AS excerpt
      FROM hymns ${whereClause}
      ORDER BY hymn_number ASC
    `).all(...params)

  if (!query) {
    if (cat) return select('WHERE (category = ? OR category LIKE ?)', [cat, `%${cat}%`])
    return select('', [])
  }

  const isNumber = /^\d+$/.test(query)
  const tokens = query.split(/\s+/).filter(Boolean)
  const parts = []
  const params = []

  if (isNumber) {
    parts.push("(hymn_number = ? OR title LIKE ? ESCAPE '\\' OR lyrics LIKE ? ESCAPE '\\')")
    params.push(parseInt(query, 10), `%${query}%`, `%${query}%`)
  } else {
    // Token AND-search: all terms must appear in the title or lyrics.
    for (const tok of tokens) {
      const esc = tok.replace(/[\\%_]/g, (m) => `\\${m}`)
      parts.push("(title LIKE ? ESCAPE '\\' OR lyrics LIKE ? ESCAPE '\\')")
      params.push(`%${esc}%`, `%${esc}%`)
    }
  }

  const catClause = cat ? ' AND (category = ? OR category LIKE ?)' : ''
  const catParams = cat ? [cat, `%${cat}%`] : []
  const where = parts.length ? `WHERE (${parts.join(' AND ')})` : ''
  return select(`${where}${catClause}`, [...params, ...catParams])
}
export function getHymnLyrics(id) {
  if (!db || !id) return null
  return db.prepare('SELECT * FROM hymns WHERE id = ?').get(id) || null
}

export function searchHymns(query, category) {
  if (!db) return []
  const activeCategory = category && category !== 'All' ? String(category).trim() : null
  const qStr = String(query || '').trim()

  if (!qStr) {
    if (activeCategory) {
      return db.prepare('SELECT * FROM hymns WHERE category = ? OR category LIKE ? ORDER BY hymn_number ASC')
        .all(activeCategory, `%${activeCategory}%`)
    }
    return getHymns()
  }

  const escaped = qStr.replace(/[\\%_]/g, (m) => `\\${m}`)
  const pattern = `%${escaped}%`
  const catClause = activeCategory ? ' AND (category = ? OR category LIKE ?)' : ''
  const catParams = activeCategory ? [activeCategory, `%${activeCategory}%`] : []
  const isNumber = !isNaN(qStr) && qStr !== ''

  if (isNumber) {
    return db.prepare(`SELECT * FROM hymns WHERE (hymn_number = ? OR title LIKE ? ESCAPE ? OR lyrics LIKE ? ESCAPE ?)${catClause} ORDER BY hymn_number ASC`)
      .all(parseInt(qStr, 10), pattern, '\\', pattern, '\\', ...catParams)
  }
  return db.prepare(`SELECT * FROM hymns WHERE (title LIKE ? ESCAPE ? OR lyrics LIKE ? ESCAPE ?)${catClause} ORDER BY hymn_number ASC`)
    .all(pattern, '\\', pattern, '\\', ...catParams)
}

export function addHymn({ number, title, category, author, lyrics }) {
  if (!db) return null
  const insert = db.prepare('INSERT INTO hymns (hymn_number, title, category, author, lyrics) VALUES (?, ?, ?, ?, ?)')
  const result = insert.run(
    number || 0,
    title,
    category || 'Custom Song',
    author || 'Unknown',
    lyrics
  )
  return result.lastInsertRowid
}

export function importHymnsBatch(hymnList) {
  if (!db || !Array.isArray(hymnList)) return 0
  const insert = db.prepare('INSERT INTO hymns (hymn_number, title, category, author, lyrics) VALUES (?, ?, ?, ?, ?)')
  const insertMany = db.transaction((items) => {
    let count = 0
    for (const h of items) {
      if (h.title && h.lyrics) {
        insert.run(
          h.number || h.hymn_number || 0,
          h.title,
          h.category || 'Imported Song',
          h.author || '',
          h.lyrics
        )
        count++
      }
    }
    return count
  })
  return insertMany(hymnList)
}

export function getHymnsCount() {
  if (!db) return 0
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM hymns').get()
    return row ? row.count : 0
  } catch {
    return 0
  }
}

export function getHymnCategories() {
  try {
    // Merge the categories from the bundled library and the user's folder so
    // both are offered in the picker.
    const subdirs = new Set()
    for (const hymnsDir of [bundledDataDir('hymns'), userDataDir('hymns')]) {
      if (!fs.existsSync(hymnsDir)) continue
      for (const f of fs.readdirSync(hymnsDir)) {
        try {
          if (fs.statSync(path.join(hymnsDir, f)).isDirectory()) subdirs.add(f)
        } catch {
          // Unreadable entry - skip it.
        }
      }
    }
    if (subdirs.size > 0) {
      return [...subdirs].sort()
    }
  } catch (err) {
    console.error('Error scanning hymns folder for categories:', err)
  }

  if (!db) return []
  try {
    const rows = db.prepare(`
      SELECT DISTINCT category FROM hymns 
      WHERE category IS NOT NULL 
        AND category != '' 
        AND length(trim(category)) > 0 
      ORDER BY category ASC
    `).all()
    return rows.map((r) => r.category)
  } catch (err) {
    console.error('Error fetching hymn categories:', err)
    return []
  }
}


