function getModel() {
  return localStorage.getItem('st_gemini_model') || 'gemini-flash-lite-latest';
}
function getApiUrl() {
  const model = getModel();
  // Gemma系はv1beta、Gemini系も現在はv1betaが最も広くカバー
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function buildPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  const year  = new Date().getFullYear();
  return `
You are analyzing a screenshot from the Huawei Health app's sleep tracking feature.
Today's date is ${today}. Use this as reference when inferring the year.

Extract the following sleep data and return ONLY a raw JSON object.

Fields:
- date: "YYYY-MM-DD". IMPORTANT: if the screenshot shows only month/day (e.g. "4/23" or "4月23日"), use the year ${year} UNLESS the date would be in the future, in which case use ${year - 1}. Never guess a year more than 2 years in the past.
- bedtime: "HH:MM" 24-hour (when the user fell asleep).
- wake_time: "HH:MM" 24-hour (when the user woke up).
- sleep_duration_min: total sleep duration in minutes as integer. Use the following priority:
  1. If "合計睡眠時間" is present on screen (e.g. "合計睡眠時間 7時間44分"), use that value (it includes naps and gives the full picture).
  2. If only "夜間の睡眠" is shown without "合計睡眠時間", use the "X時間XX分" value directly below "夜間の睡眠".
  Convert "X時間XX分" to minutes: hours×60 + minutes (e.g. "7時間44分" → 464, "6時間38分" → 398).
- deep_sleep_min: deep sleep minutes or null. Look for "深い睡眠" with a duration like "2時間28分".
- light_sleep_min: light (shallow) sleep minutes or null. Look for "浅い睡眠" with a duration like "2時間51分".
- rem_sleep_min: REM sleep minutes or null. Look for "レム睡眠" with a duration like "1時間19分".
- awake_min: awake-during-night minutes or null.
- awake_count: number of times the user woke up during the night as integer, or null. Look for values like "目覚め 3回", "覚醒回数", "Awakenings", "Woke up X times".
- sleep_score: the overall sleep score as an integer, or null. It is displayed as a large bold number with "点" immediately after it (e.g. "82点" → 82, "75点" → 75). It typically appears in the lower portion of the screen, often accompanied by star ratings and text like "XX%のユーザーより上". IMPORTANT: do NOT use "深い睡眠の持続性: XX点" or any sub-category score — only the main top-level score. If you see a number like "82" displayed prominently with "点" next to it, that is the value to extract.

Rules:
- 24-hour format for times. Bedtime after midnight stays as-is (e.g. "00:30").
- For sleep_duration_min, prefer "合計睡眠時間" when present; fall back to "夜間の睡眠" only if 合計 is absent.
- Return ONLY the JSON object, no markdown, no explanation.

Example: {"date":"${year}-03-15","bedtime":"23:20","wake_time":"07:05","sleep_duration_min":464,"deep_sleep_min":98,"light_sleep_min":267,"rem_sleep_min":100,"awake_min":12,"awake_count":2,"sleep_score":82}
`.trim();
}

const Gemini = {
  async extractSleepData(imageFile, onProgress) {
    const apiKey = Storage.getApiKey();
    if (!apiKey) throw new Error('Gemini API キーが設定されていません');

    onProgress?.('画像を圧縮中…', 20);

    const { base64, mimeType } = await resizeAndEncode(imageFile, 1024);

    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: buildPrompt() }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
      }
    };

    // 混雑時は最大3回リトライ（5秒→10秒待機）
    const MAX_RETRIES = 3;
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        onProgress?.(`混雑中のため5秒後に再試行… (${attempt}/${MAX_RETRIES})`, 40);
        await new Promise(r => setTimeout(r, 5000));
      }

      onProgress?.(attempt === 1 ? 'Gemini に送信中…' : '再送信中…', 50);

      const res = await fetch(`${getApiUrl()}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        // 一時的なエラー（503 混雑 / 429 レート制限）ならリトライ
        const isRetryable = res.status === 503 || res.status === 429 ||
          msg.toLowerCase().includes('high demand') ||
          msg.toLowerCase().includes('overloaded') ||
          msg.toLowerCase().includes('try again');
        lastError = new Error(`Gemini API エラー: ${msg}`);
        if (isRetryable && attempt < MAX_RETRIES) continue;
        throw lastError;
      }

      onProgress?.('データを解析中…', 80);

      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini からの応答が空です');

      const cleaned = text.replace(/```json|```/g, '').trim();
      let data;
      try {
        data = JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('JSONの解析に失敗しました');
        data = JSON.parse(match[0]);
      }

      onProgress?.('完了', 100);
      return normalizeExtracted(data);
    }
    throw lastError;
  },

  async testApiKey(apiKey) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    return res.ok;
  },

  async listModels(apiKey) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    const json = await res.json();
    // Filter to vision-capable models only
    return (json.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
  }
};

function normalizeExtracted(raw) {
  const r = {};

  r.date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
    ? raw.date
    : null;

  r.bedtime   = normalizeTime(raw.bedtime);
  r.wake_time = normalizeTime(raw.wake_time);

  r.sleep_duration_min = toIntOrNull(raw.sleep_duration_min);
  r.deep_sleep_min     = toIntOrNull(raw.deep_sleep_min);
  r.light_sleep_min    = toIntOrNull(raw.light_sleep_min);
  r.rem_sleep_min      = toIntOrNull(raw.rem_sleep_min);
  r.awake_min          = toIntOrNull(raw.awake_min);
  r.awake_count        = toIntOrNull(raw.awake_count);
  r.sleep_score        = toIntOrNull(raw.sleep_score);

  // Derive duration from times if not provided
  if (!r.sleep_duration_min && r.bedtime && r.wake_time) {
    r.sleep_duration_min = calcDurationMin(r.bedtime, r.wake_time);
  }

  return r;
}

function normalizeTime(val) {
  if (!val || typeof val !== 'string') return null;
  const match = val.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function toIntOrNull(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function calcDurationMin(bedtime, wake_time) {
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wake_time.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

function resizeAndEncode(file, maxPx = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else                { width  = Math.round(width  * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = url;
  });
}
