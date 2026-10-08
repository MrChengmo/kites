import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS documents (collection TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(collection,id));
    CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, routine_id TEXT NOT NULL, occurrence TEXT UNIQUE, body TEXT NOT NULL);
  `);
  return {
    all(collection) {
      return db
        .prepare('SELECT body FROM documents WHERE collection=? ORDER BY rowid DESC')
        .all(collection)
        .map((row) => JSON.parse(row.body));
    },
    get(collection, id) {
      const row = db
        .prepare('SELECT body FROM documents WHERE collection=? AND id=?')
        .get(collection, id);
      return row ? JSON.parse(row.body) : undefined;
    },
    put(collection, value) {
      const record = { ...value, id: value.id || randomUUID() };
      db.prepare(
        'INSERT INTO documents VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET body=excluded.body',
      ).run(collection, record.id, JSON.stringify(record));
      return record;
    },
    remove(collection, id) {
      db.prepare('DELETE FROM documents WHERE collection=? AND id=?').run(collection, id);
    },
    runs() {
      return db
        .prepare('SELECT body FROM runs ORDER BY rowid DESC LIMIT 200')
        .all()
        .map((row) => JSON.parse(row.body));
    },
    claim(run) {
      return (
        db
          .prepare('INSERT OR IGNORE INTO runs VALUES(?,?,?,?)')
          .run(run.id, run.routineId, run.occurrence, JSON.stringify(run)).changes > 0
      );
    },
    updateRun(run) {
      db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(run), run.id);
    },
    close() {
      db.close();
    },
  };
}

export function validateRoutine(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120)
    throw new Error('Give this routine a name (up to 120 characters).');
  if (typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 32000)
    throw new Error('Add instructions (up to 32,000 characters).');
  if (typeof value.agentId !== 'string' || !value.agentId) throw new Error('Choose a bot.');
  if (!['daily', 'weekdays', 'interval'].includes(value.schedule))
    throw new Error('Choose a valid schedule.');
  if (
    value.schedule === 'interval' &&
    (!Number.isInteger(value.minutes) || value.minutes < 5 || value.minutes > 10080)
  )
    throw new Error('The interval must be between 5 minutes and 7 days.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time || '')) throw new Error('Choose a valid time.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format();
  } catch {
    throw new Error('Choose a valid time zone.');
  }
  if (typeof value.timezone !== 'string' || !value.timezone) throw new Error('Choose a time zone.');
  return {
    avatar: typeof value.avatar === 'string' && value.avatar.length < 1000 ? value.avatar : '',
    name: value.name.trim(),
    prompt: value.prompt.trim(),
    agentId: value.agentId,
    schedule: value.schedule,
    minutes: value.minutes || 60,
    time: value.time,
    timezone: value.timezone,
    enabled: value.enabled === true,
  };
}

// Search actual instants so local times across DST follow the selected IANA zone.
// A repeated wall-clock minute runs once; an absent minute is skipped that day.
export function nextOccurrence(routine, after = Date.now()) {
  if (routine.schedule === 'interval') return after + routine.minutes * 60000;
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: routine.timezone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const current = Object.fromEntries(format.formatToParts(after).map((p) => [p.type, p.value]));
  const today = `${current.year}-${current.month}-${current.day}`;
  const alreadyPassed = `${current.hour}:${current.minute}` >= routine.time;
  for (let t = Math.floor(after / 60000) * 60000 + 60000; t <= after + 8 * 86400000; t += 60000) {
    const parts = Object.fromEntries(format.formatToParts(t).map((p) => [p.type, p.value]));
    if (alreadyPassed && `${parts.year}-${parts.month}-${parts.day}` === today) continue;
    if (
      `${parts.hour}:${parts.minute}` === routine.time &&
      (routine.schedule !== 'weekdays' || !['Sat', 'Sun'].includes(parts.weekday))
    )
      return t;
  }
  throw new Error('No scheduled time found in the next week.');
}
