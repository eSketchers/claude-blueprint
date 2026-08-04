// _shared.mjs — pure helpers shared by every log-source adapter.
//
// Adapters keep their network/CLI call thin and delegate all parsing to these
// pure functions so the logic is unit-testable without creds or a live service.

/**
 * Coerce a variety of timestamp representations to an ISO-8601 string.
 * Accepts: epoch seconds/millis (number or numeric string), ISO strings, or
 * anything Date can parse. Returns '' for empty/unparseable input.
 * @param {string|number|null|undefined} x
 * @returns {string}
 */
export function normalizeTimestamp(x) {
  if (x === null || x === undefined || x === '') return '';
  // numeric epoch (seconds or milliseconds)
  if (typeof x === 'number' || /^\d+(\.\d+)?$/.test(String(x))) {
    let n = Number(x);
    if (n < 1e11) n *= 1000; // seconds -> ms (anything below ~2001 in ms is really seconds)
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? String(x) : d.toISOString();
}

/**
 * Case-insensitive substring OR-match. Empty/absent pattern list = match all
 * (server-side filtering already happened). Used by client-side adapters
 * (file/command) that fetch raw lines and must filter themselves.
 * @param {string} message
 * @param {string[]} [patterns]
 * @returns {boolean}
 */
export function matchesPatterns(message, patterns) {
  if (!patterns || patterns.length === 0) return true;
  const m = String(message).toLowerCase();
  return patterns.some((p) => m.includes(String(p).toLowerCase()));
}

/**
 * Read a possibly-dotted field path out of an object. `getField(o, 'a.b')`.
 * @param {object} obj
 * @param {string} path
 * @returns {*}
 */
export function getField(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

/** Coerce any field value to a single-line string message. */
export function toMessage(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

/**
 * Extract the row array from a parsed API/JSON payload — tries common envelope
 * keys used across logging providers before falling back to [payload].
 * @param {*} payload
 * @returns {any[]}
 */
export function pickArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const k of ['data', 'results', 'items', 'logs', 'events', 'entries', 'records']) {
      if (Array.isArray(payload[k])) return payload[k];
    }
  }
  return payload == null ? [] : [payload];
}

/**
 * Generic parser for the `command` and `file` adapters.
 * @param {string|object} payload  raw stdout/file text, or already-parsed JSON
 * @param {{format?:'lines'|'json'|'jsonl', timestamp_field?:string, message_field?:string, patterns?:string[]}} opts
 * @returns {Array<{timestamp:string, message:string}>}
 */
export function parseRows(payload, opts = {}) {
  const { format = 'lines', timestamp_field = 'timestamp', message_field = 'message', patterns } = opts;

  if (format === 'lines') {
    return String(payload)
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0)
      .filter((l) => matchesPatterns(l, patterns))
      .map((l) => ({ timestamp: '', message: l }));
  }

  let items;
  if (format === 'jsonl') {
    items = String(payload)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } else {
    // 'json'
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    items = pickArray(parsed);
  }

  return items
    .map((it) => ({
      timestamp: normalizeTimestamp(getField(it, timestamp_field)),
      message: toMessage(getField(it, message_field) ?? it),
    }))
    .filter((r) => r.message)
    .filter((r) => matchesPatterns(r.message, patterns));
}

/**
 * Minimal JSON HTTP client over the built-in fetch (Node 18+). Adapters use
 * this for their live call; the response is handed to a pure parser for tests.
 * @param {string} url
 * @param {{method?:string, headers?:object, body?:any}} [opts]
 * @returns {Promise<any>}
 */
export async function httpJson(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body != null ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

/** Read an env var by NAME (config stores names, never secrets). Throws if unset. */
export function requireEnv(name, sourceName) {
  const v = name ? process.env[name] : undefined;
  if (!v) throw new Error(`[source:${sourceName}] missing env var ${name} (set it, or reference the right *_env in config)`);
  return v;
}
