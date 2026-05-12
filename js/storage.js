// Storage keys
const KEYS = {
  RECORDS: 'st_records',
  API_KEY:  'st_gemini_key',
  SETTINGS: 'st_settings',
};

// ── Record shape ──────────────────────────────────────────
// {
//   id:                    string (timestamp-based)
//   date:                  "YYYY-MM-DD"
//   bedtime:               "HH:MM"  (24h)
//   wake_time:             "HH:MM"  (24h)
//   sleep_duration_min:    number
//   deep_sleep_min:        number | null
//   light_sleep_min:       number | null
//   rem_sleep_min:         number | null
//   awake_min:             number | null
//   awake_count:           number | null   (times woken up)
//   sleep_score:           number | null   (Huawei Health score 0-100)
//   notes:                 string | null
//   created_at:            ISO string
// }

const Storage = {
  // ── Records ─────────────────────────────────────────────
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.RECORDS) || '[]');
    } catch { return []; }
  },

  save(records) {
    localStorage.setItem(KEYS.RECORDS, JSON.stringify(records));
  },

  add(record) {
    const records = this.getAll();
    const existing = records.findIndex(r => r.date === record.date);
    if (existing >= 0) {
      records[existing] = { ...records[existing], ...record };
    } else {
      records.push({ ...record, id: Date.now().toString(), created_at: new Date().toISOString() });
    }
    records.sort((a, b) => b.date.localeCompare(a.date));
    this.save(records);
    return records;
  },

  update(id, changes) {
    const records = this.getAll().map(r => String(r.id) === String(id) ? { ...r, ...changes } : r);
    records.sort((a, b) => b.date.localeCompare(a.date));
    this.save(records);
    return records;
  },

  remove(id) {
    const records = this.getAll().filter(r => String(r.id) !== String(id));
    this.save(records);
    return records;
  },

  getByDateRange(from, to) {
    return this.getAll().filter(r => r.date >= from && r.date <= to);
  },

  // ── API Key ──────────────────────────────────────────────
  getApiKey()       { return localStorage.getItem(KEYS.API_KEY) || ''; },
  setApiKey(key)    { localStorage.setItem(KEYS.API_KEY, key); },

  // ── Settings ─────────────────────────────────────────────
  getSettings() {
    try { return JSON.parse(localStorage.getItem(KEYS.SETTINGS) || '{}'); }
    catch { return {}; }
  },
  setSetting(key, value) {
    const s = this.getSettings();
    s[key] = value;
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(s));
  },

  // ── Export ───────────────────────────────────────────────
  exportJSON() {
    const data = {
      version: 1,
      exported_at: new Date().toISOString(),
      records: this.getAll(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `sleep-tracker-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── Import ───────────────────────────────────────────────
  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          const incoming = Array.isArray(data) ? data : (data.records || []);
          if (!Array.isArray(incoming)) throw new Error('Invalid format');

          const existing = this.getAll();
          const existingDates = new Set(existing.map(r => r.date));
          let added = 0, skipped = 0;

          for (const r of incoming) {
            if (!r.date) { skipped++; continue; }
            if (existingDates.has(r.date)) { skipped++; continue; }
            existing.push({ ...r, id: r.id || Date.now().toString() + Math.random(), created_at: r.created_at || new Date().toISOString() });
            existingDates.add(r.date);
            added++;
          }
          existing.sort((a, b) => b.date.localeCompare(a.date));
          this.save(existing);
          resolve({ added, skipped, total: incoming.length });
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('File read error'));
      reader.readAsText(file);
    });
  },

  // ── Statistics helpers ───────────────────────────────────
  stats(records = this.getAll()) {
    if (!records.length) return null;
    const durations = records.map(r => r.sleep_duration_min).filter(Boolean);
    const avg = d => d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null;
    return {
      count: records.length,
      avg_duration_min: avg(durations),
      max_duration_min: durations.length ? Math.max(...durations) : null,
      min_duration_min: durations.length ? Math.min(...durations) : null,
    };
  },
};

// Helpers
function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTime(hhmm) {
  if (!hhmm) return '--';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function formatDate(yyyymmdd) {
  if (!yyyymmdd) return '--';
  const d = new Date(yyyymmdd + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
}

function sleepScore(record) {
  if (!record?.sleep_duration_min) return null;
  const dur = record.sleep_duration_min;
  if (dur <= 0) return 0;

  // ── 睡眠時間スコア (理想: 7.5h = 450min) ──────────────
  const d = Math.abs(dur - 450);
  let durScore;
  if (d <= 30)       durScore = 95 - d * 0.17;         // 7〜8h:  90-95
  else if (d <= 90)  durScore = 90 - (d - 30) * 0.67;  // 6〜9h:  50-90
  else               durScore = Math.max(0, 50 - (d - 90) * 0.5); // それ以外

  // ── 睡眠ステージスコア (各0-100) ─────────────────────
  const stages = [];

  if (record.deep_sleep_min != null) {
    // 理想: 総睡眠の 20%
    const r = record.deep_sleep_min / dur;
    stages.push(Math.max(0, 100 - Math.abs(r - 0.20) * 500));
  }
  if (record.rem_sleep_min != null) {
    // 理想: 総睡眠の 22%
    const r = record.rem_sleep_min / dur;
    stages.push(Math.max(0, 100 - Math.abs(r - 0.22) * 400));
  }
  if (record.awake_min != null) {
    // 覚醒割合が低いほど高評価
    stages.push(Math.max(0, 100 - (record.awake_min / dur) * 800));
  }

  if (stages.length > 0) {
    const avgStage = stages.reduce((a, b) => a + b, 0) / stages.length;
    // 時間55% + ステージ45% で合成
    return Math.max(0, Math.min(100, Math.round(durScore * 0.55 + avgStage * 0.45)));
  }
  // ステージデータなし → 時間のみ、上限75
  return Math.max(0, Math.min(75, Math.round(durScore)));
}
