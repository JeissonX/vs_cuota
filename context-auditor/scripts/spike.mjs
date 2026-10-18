import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CONV_DIR = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'conversations');
const OUTPUT_FILE = path.join(import.meta.dirname, '..', 'spike_result.json');

function sanitizeText(str, maxLen = 80) {
  if (typeof str !== 'string') return str;
  const home = os.homedir();
  let sanitized = str.replaceAll(home, '~').replaceAll(home.replace(/\\/g, '/'), '~');
  sanitized = sanitized.replace(/C:[\\\/]Users[\\\/][^\\\/]+/gi, '~');
  if (sanitized.length > maxLen) {
    return sanitized.slice(0, maxLen) + '... [TRUNCATED]';
  }
  return sanitized;
}

function sanitizeJson(val, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth) return '[DEPTH_EXCEEDED]';
  if (typeof val === 'string') return sanitizeText(val, 80);
  if (typeof val === 'number' || typeof val === 'boolean' || val === null) return val;
  if (Array.isArray(val)) {
    return val.slice(0, 10).map(x => sanitizeJson(x, maxDepth, currentDepth + 1));
  }
  if (typeof val === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = sanitizeJson(v, maxDepth, currentDepth + 1);
    }
    return res;
  }
  return String(val);
}

function readVarint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  let count = 0;
  while (pos < buf.length) {
    const b = BigInt(buf[pos++]);
    result |= (b & 0x7fn) << shift;
    if ((b & 0x80n) === 0n) {
      const num = Number(result);
      const val = (result <= BigInt(Number.MAX_SAFE_INTEGER)) ? num : result.toString();
      return [val, pos];
    }
    shift += 7n;
    count++;
    if (count > 10) throw new Error('varint overflow');
  }
  throw new Error('unexpected EOF in varint');
}

function decodeProtobuf(buf, depth = 0, maxFields = 40) {
  if (depth > 4) return null;
  if (!buf || !(buf instanceof Uint8Array || Buffer.isBuffer(buf))) return null;
  if (buf.length === 0) return null;

  const fields = {};
  let fieldCount = 0;
  let pos = 0;

  try {
    while (pos < buf.length) {
      if (fieldCount >= maxFields) break;
      const [tag, nextPos] = readVarint(buf, pos);
      pos = nextPos;
      const fieldNum = Math.floor(tag / 8);
      const wireType = tag % 8;

      if (fieldNum === 0 || fieldNum > 10000) return null;

      let val;
      if (wireType === 0) { // Varint
        const [v, p] = readVarint(buf, pos);
        val = v;
        pos = p;
      } else if (wireType === 1) { // 64-bit
        if (pos + 8 > buf.length) return null;
        val = '0x' + Buffer.from(buf.subarray(pos, pos + 8)).toString('hex');
        pos += 8;
      } else if (wireType === 2) { // Length-delimited
        const [len, p] = readVarint(buf, pos);
        pos = p;
        if (len < 0 || pos + len > buf.length) return null;
        const slice = buf.subarray(pos, pos + len);
        pos += len;

        // Try recursive protobuf decode first
        const nested = decodeProtobuf(slice, depth + 1, maxFields);
        if (nested && Object.keys(nested).length > 0) {
          val = nested;
        } else {
          // Check if UTF-8 string
          let isUtf8 = true;
          let text = '';
          try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(slice);
            for (let i = 0; i < text.length; i++) {
              const code = text.charCodeAt(i);
              if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
                isUtf8 = false;
                break;
              }
            }
          } catch {
            isUtf8 = false;
          }

          if (isUtf8 && text.length > 0) {
            try {
              const parsed = JSON.parse(text);
              val = { _type: 'json', data: sanitizeJson(parsed) };
            } catch {
              val = sanitizeText(text, 80);
            }
          } else {
            val = {
              _type: 'bytes',
              len: slice.length,
              hex48: Buffer.from(slice.subarray(0, 48)).toString('hex')
            };
          }
        }
      } else if (wireType === 5) { // 32-bit
        if (pos + 4 > buf.length) return null;
        val = Buffer.from(buf.subarray(pos, pos + 4)).readUInt32LE(0);
        pos += 4;
      } else {
        return null;
      }

      if (fields[fieldNum] === undefined) {
        fields[fieldNum] = val;
      } else {
        if (!Array.isArray(fields[fieldNum])) {
          fields[fieldNum] = [fields[fieldNum]];
        }
        fields[fieldNum].push(val);
      }
      fieldCount++;
    }

    if (fieldCount === 0 || pos !== buf.length) {
      return null;
    }
    return fields;
  } catch {
    return null;
  }
}

function inspectBlob(buf) {
  if (!buf) return null;
  if (!(buf instanceof Uint8Array || Buffer.isBuffer(buf))) {
    return { error: 'not a buffer', type: typeof buf };
  }
  const hex48 = Buffer.from(buf.subarray(0, 48)).toString('hex');
  let utf8Text = null;
  let isJson = false;
  let parsedJson = null;

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    let printable = true;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        printable = false;
        break;
      }
    }
    if (printable && text.length > 0) {
      utf8Text = sanitizeText(text, 80);
      try {
        parsedJson = sanitizeJson(JSON.parse(text));
        isJson = true;
      } catch {
        // not json
      }
    }
  } catch {
    // not utf8
  }

  const proto = decodeProtobuf(buf, 0, 40);

  return {
    length: buf.length,
    hex48,
    utf8Text,
    isJson,
    parsedJson,
    protobuf: proto
  };
}

function openReadOnlyDb(filePath) {
  const db = new DatabaseSync(filePath, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 3000;');
  db.exec('PRAGMA query_only = ON;');
  return db;
}

async function runSpike() {
  console.log(`Scanning conversations in: ${CONV_DIR}`);
  if (!fs.existsSync(CONV_DIR)) {
    throw new Error(`Directory not found: ${CONV_DIR}`);
  }

  const files = fs.readdirSync(CONV_DIR);
  const dbFiles = files.filter(f => f.endsWith('.db'));
  console.log(`Found ${dbFiles.length} .db files`);

  // Spaced readings for mtime
  const mtimeObservation1 = {};
  for (const f of files) {
    if (f.endsWith('.db') || f.endsWith('.db-wal') || f.endsWith('.db-shm')) {
      const st = fs.statSync(path.join(CONV_DIR, f));
      mtimeObservation1[f] = { mtimeMs: st.mtimeMs, size: st.size };
    }
  }

  await new Promise(r => setTimeout(r, 600));

  const mtimeObservation2 = {};
  for (const f of files) {
    if (f.endsWith('.db') || f.endsWith('.db-wal') || f.endsWith('.db-shm')) {
      const st = fs.statSync(path.join(CONV_DIR, f));
      mtimeObservation2[f] = { mtimeMs: st.mtimeMs, size: st.size };
    }
  }

  // Count step_type across ALL .db
  const globalStepTypeDistribution = {};
  const dbSummaries = [];

  for (const dbName of dbFiles) {
    const fullPath = path.join(CONV_DIR, dbName);
    try {
      const db = openReadOnlyDb(fullPath);
      let stepCounts = {};
      try {
        const rows = db.prepare('SELECT step_type, COUNT(*) as cnt FROM steps GROUP BY step_type').all();
        for (const r of rows) {
          stepCounts[r.step_type] = r.cnt;
          globalStepTypeDistribution[r.step_type] = (globalStepTypeDistribution[r.step_type] || 0) + r.cnt;
        }
      } catch (err) {
        stepCounts = { error: err.message };
      }
      db.close();

      const st = fs.statSync(fullPath);
      const walPath = fullPath + '-wal';
      const walExists = fs.existsSync(walPath);
      const walStat = walExists ? fs.statSync(walPath) : null;

      dbSummaries.push({
        db: dbName,
        mtimeMs: st.mtimeMs,
        size: st.size,
        walSize: walStat ? walStat.size : 0,
        walMtimeMs: walStat ? walStat.mtimeMs : 0,
        stepCounts
      });
    } catch (err) {
      dbSummaries.push({ db: dbName, error: err.message });
    }
  }

  // Sort DBs by mtime / walMtime descending
  dbSummaries.sort((a, b) => Math.max(b.walMtimeMs || 0, b.mtimeMs || 0) - Math.max(a.walMtimeMs || 0, a.mtimeMs || 0));
  const mostRecentDbName = dbSummaries[0]?.db;
  console.log(`Most recent DB: ${mostRecentDbName}`);

  const recentFullPath = path.join(CONV_DIR, mostRecentDbName);
  const recentDb = openReadOnlyDb(recentFullPath);

  // 1. Schema of all tables
  const tables = recentDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  const tableSchemas = {};
  const tableRowCounts = {};
  const otherTableSamples = {};

  for (const tbl of tables) {
    const info = recentDb.prepare(`PRAGMA table_info("${tbl}")`).all();
    tableSchemas[tbl] = info;
    const countRow = recentDb.prepare(`SELECT COUNT(*) as c FROM "${tbl}"`).get();
    tableRowCounts[tbl] = countRow.c;

    if (tbl !== 'steps') {
      try {
        const samples = recentDb.prepare(`SELECT * FROM "${tbl}" LIMIT 3`).all();
        otherTableSamples[tbl] = samples.map(row => {
          const sanitizedRow = {};
          for (const [col, val] of Object.entries(row)) {
            if (typeof val === 'string') {
              sanitizedRow[col] = sanitizeText(val, 300);
            } else if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
              sanitizedRow[col] = inspectBlob(val);
            } else {
              sanitizedRow[col] = val;
            }
          }
          return sanitizedRow;
        });
      } catch (err) {
        otherTableSamples[tbl] = { error: err.message };
      }
    }
  }

  // Distinct step_format in steps
  let stepFormats = [];
  try {
    stepFormats = recentDb.prepare('SELECT DISTINCT step_format FROM steps').all().map(r => r.step_format);
  } catch (e) {
    stepFormats = [e.message];
  }

  // Distribution of step_type in most recent DB
  const recentStepTypeCounts = recentDb.prepare('SELECT step_type, COUNT(*) as cnt FROM steps GROUP BY step_type').all();

  // 2 sample rows per step_type with full BLOB inspection
  const samplesByStepType = {};
  for (const stRow of recentStepTypeCounts) {
    const stType = stRow.step_type;
    const sampleRows = recentDb.prepare('SELECT * FROM steps WHERE step_type = ? ORDER BY idx DESC LIMIT 2').all(stType);
    samplesByStepType[stType] = sampleRows.map(row => {
      const sanitized = {};
      for (const [col, val] of Object.entries(row)) {
        if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
          sanitized[col] = inspectBlob(val);
        } else if (typeof val === 'string') {
          sanitized[col] = sanitizeText(val, 80);
        } else {
          sanitized[col] = val;
        }
      }
      return sanitized;
    });
  }

  recentDb.close();

  const report = {
    timestamp: new Date().toISOString(),
    conversationsDir: '~/.gemini/antigravity-ide/conversations',
    totalDbs: dbFiles.length,
    mostRecentDb: mostRecentDbName,
    mtimeComparisons: {
      t1: mtimeObservation1,
      t2: mtimeObservation2
    },
    allDbsSummary: dbSummaries,
    globalStepTypeDistribution,
    recentDb: {
      name: mostRecentDbName,
      tables,
      tableRowCounts,
      tableSchemas,
      stepFormats,
      stepTypeDistribution: recentStepTypeCounts,
      samplesByStepType,
      otherTableSamples
    }
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Spike completed successfully. Report written to ${OUTPUT_FILE}`);
}

runSpike().catch(err => {
  console.error('Spike error:', err);
  process.exit(1);
});
