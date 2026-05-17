// ── App State ──────────────────────────────────────────────
const State = {
  page:       'dashboard',
  // Charts page state
  chartTab:   'week',
  chartType:  'duration',
  weekOffset:  0,
  monthOffset: 0,
  yearOffset:  0,
  // Dashboard chart state
  dashChartTab:   'week',
  dashChartType:  'duration',
  dashWeekOffset:  0,
  dashMonthOffset: 0,
  dashYearOffset:  0,
  // Sub-unit shifts from swipe (week/month: days; year: months)
  dashWeekShift:   0,
  dashMonthShift:  0,
  dashYearShift:   0,
  extractedData: null,
  uploadedFile:  null,
};

// ── Chart rendering contexts ────────────────────────────────
const CHART_CTX_MAIN = {
  canvas:   'main-chart',
  navLabel: 'chart-nav-label',
  navPrev:  'nav-prev',
  navNext:  'nav-next',
  sumAvg:   'sum-avg',
  sumMax:   'sum-max',
  sumMin:   'sum-min',
  noData:   'chart-no-data',
};
const CHART_CTX_DASH = {
  canvas:   'dash-chart',
  navLabel: 'dash-nav-label',
  navPrev:  'dash-nav-prev',
  navNext:  'dash-nav-next',
  sumAvg:   'dash-sum-avg',
  sumMax:   'dash-sum-max',
  sumMin:   'dash-sum-min',
  sumLbl1:  'dash-sum-lbl1',
  sumLbl2:  'dash-sum-lbl2',
  sumLbl3:  'dash-sum-lbl3',
  noData:   'dash-no-data',
};

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  initNav();
  initDashChartTabs(); // dashboard tabs
  initCalendar();      // date / calendar popup
  initEditModal();
  _initConfirmModal();
  renderDashboard();
  initUpload();
  initSettings();
  showPage('dashboard');
});

// ── Navigation ─────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      showPage(page);
    });
  });
}

function showPage(page) {
  State.page = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`.nav-btn[data-page="${page}"]`)?.classList.add('active');

  // ページ切替時にエラートーストをクリア
  const toast = document.getElementById('toast');
  if (toast) { toast.classList.remove('show'); clearTimeout(_toastTimer); }

  if (page === 'dashboard') renderDashboard();
  if (page === 'data')      renderDataPage();
}

// ── Dashboard ──────────────────────────────────────────────
function renderDashboard() {
  // Update today's date button
  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'short' });
  // Jump to latest data, then render
  _jumpToLatest(false);
  renderDashCharts();
}

function buildStageBar(record) {
  const total = record.sleep_duration_min || 1;
  const dp = record.deep_sleep_min  || 0;
  const lp = record.light_sleep_min || 0;
  const rp = record.rem_sleep_min   || 0;
  const ap = record.awake_min       || 0;

  if (!dp && !lp && !rp) return '';

  return `
    <hr class="divider">
    <div class="stage-bar">
      <div class="stage-bar-deep"  style="width:${pct(dp,total)}%"></div>
      <div class="stage-bar-light" style="width:${pct(lp,total)}%"></div>
      <div class="stage-bar-rem"   style="width:${pct(rp,total)}%"></div>
      <div class="stage-bar-awake" style="width:${pct(ap,total)}%"></div>
    </div>
    <div class="stage-legend">
      ${dp ? `<span class="stage-dot"><i class="dot-deep"></i>深い ${formatDuration(dp)}</span>` : ''}
      ${rp ? `<span class="stage-dot"><i class="dot-rem"></i>レム ${formatDuration(rp)}</span>` : ''}
      ${lp ? `<span class="stage-dot"><i class="dot-light"></i>浅い ${formatDuration(lp)}</span>` : ''}
      ${ap ? `<span class="stage-dot"><i class="dot-awake"></i>覚醒 ${formatDuration(ap)}</span>` : ''}
    </div>
  `;
}

function buildSleepItem(r) {
  const score = r.sleep_score ?? sleepScore(r);
  const id = r.id;
  return `
    <div class="sleep-item" data-id="${id}">
      <div class="sleep-item-date">${formatDate(r.date)}</div>
      <div class="sleep-item-times">
        <div class="times">${formatTime(r.bedtime)} → ${formatTime(r.wake_time)}</div>
        <div class="dur">${formatDuration(r.sleep_duration_min)}</div>
      </div>
      <div class="sleep-item-score">${score ?? '--'}</div>
      <button class="sleep-item-edit" onclick="openEditModal('${id}')" aria-label="編集">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="sleep-item-del" onclick="confirmDelete('${id}')" aria-label="削除">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
        </svg>
      </button>
    </div>
  `;
}

// ── Upload & Extraction ─────────────────────────────────────
function initUpload() {
  const zone     = document.getElementById('upload-zone');
  const fileInput= document.getElementById('file-input');
  const result   = document.getElementById('extract-result');
  const saveBtn  = document.getElementById('save-btn');

  // Drag and drop
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
  });

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });

  saveBtn.addEventListener('click', saveExtracted);
}

async function handleFile(file) {
  const apiKey = Storage.getApiKey();
  if (!apiKey) {
    showToast('先にGemini APIキーを設定してください', 'error');
    showPage('settings');
    return;
  }

  State.uploadedFile = file;
  const result = document.getElementById('extract-result');
  result.classList.add('show');

  // Preview
  const preview = document.getElementById('extract-preview');
  preview.src = URL.createObjectURL(file);

  // Show progress
  showProgress(true);
  setExtractFields(null);
  document.getElementById('save-btn').disabled = true;

  try {
    const data = await Gemini.extractSleepData(file, (msg, pct) => {
      updateProgress(pct, msg);
    });
    State.extractedData = data;
    setExtractFields(data);
    document.getElementById('save-btn').disabled = false;

    const autoSave = Storage.getSettings().autoSave !== false; // デフォルトon
    if (autoSave) {
      showToast('抽出完了 — 自動保存します…', 'success');
      await doSave(data);
    } else {
      showToast('データを抽出しました。確認して保存してください', 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
    setExtractFields({});
  } finally {
    showProgress(false);
  }
}

function setExtractFields(data) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  set('field-date',        data?.date);
  set('field-bedtime',     data?.bedtime);
  set('field-wake',        data?.wake_time);
  set('field-duration',    data?.sleep_duration_min != null ? formatDuration(data.sleep_duration_min) : '');
  set('field-deep',        data?.deep_sleep_min  != null ? formatDuration(data.deep_sleep_min)  : '');
  set('field-light',       data?.light_sleep_min != null ? formatDuration(data.light_sleep_min) : '');
  set('field-rem',         data?.rem_sleep_min   != null ? formatDuration(data.rem_sleep_min)   : '');
  set('field-awake-count',  data?.awake_count  != null ? data.awake_count  : '');
  set('field-sleep-score',  data?.sleep_score  != null ? data.sleep_score  : '');
  set('field-nap',          data?.nap_min      != null ? formatDuration(data.nap_min) : '');
}

// 保存ボタンから呼ばれる（手動保存）
function saveExtracted() {
  const dateVal = document.getElementById('field-date').value.trim();
  const bedVal  = document.getElementById('field-bedtime').value.trim();
  const wakeVal = document.getElementById('field-wake').value.trim();

  if (!dateVal) { highlightEmpty('field-date');    showToast('日付を入力してください', 'error'); return; }
  if (!bedVal)  { highlightEmpty('field-bedtime'); showToast('就寝時間を入力してください', 'error'); return; }
  if (!wakeVal) { highlightEmpty('field-wake');    showToast('起床時間を入力してください', 'error'); return; }

  doSave(buildRecordFromFields());
}

// フォームからレコードを組み立て
function buildRecordFromFields() {
  const dateVal = document.getElementById('field-date').value.trim();
  const bedVal  = document.getElementById('field-bedtime').value.trim();
  const wakeVal = document.getElementById('field-wake').value.trim();
  const dur = parseHHMM(document.getElementById('field-duration').value) ??
              (bedVal && wakeVal ? calcDurationMinFromForm(bedVal, wakeVal) : null);
  return {
    date:               dateVal,
    bedtime:            bedVal,
    wake_time:          wakeVal,
    sleep_duration_min: dur,
    deep_sleep_min:     parseHHMM(document.getElementById('field-deep').value),
    light_sleep_min:    parseHHMM(document.getElementById('field-light').value),
    rem_sleep_min:      parseHHMM(document.getElementById('field-rem').value),
    awake_count:        parseInt(document.getElementById('field-awake-count').value)  || null,
    sleep_score:        parseInt(document.getElementById('field-sleep-score').value)  || null,
    nap_min:            parseHHMM(document.getElementById('field-nap').value),
    awake_min:          null,
    notes:              null,
  };
}

// 実際の保存処理（自動・手動共通）
async function doSave(recordOrData) {
  // extraction dataオブジェクトかform recordか両対応
  const record = recordOrData.date ? recordOrData : buildRecordFromFields();
  if (!record.date) { showToast('日付が取得できませんでした', 'error'); return; }

  // 同日付の既存レコードがあれば上書き確認
  const existing = Storage.getAll().find(r => r.date === record.date);
  if (existing) {
    showConfirmModal(
      `${formatDate(record.date)} を上書き`,
      `${formatDate(record.date)} のデータがすでにあります。上書きしますか？`,
      () => commitSave(record),
      '上書き保存'
    );
    return;
  }

  commitSave(record);
}

function commitSave(record) {
  Storage.add(record);
  document.getElementById('extract-result').classList.remove('show');
  State.extractedData = null;
  State.uploadedFile  = null;
  document.getElementById('save-btn').disabled = true;
  showToast('保存しました！', 'success');
  setTimeout(() => showPage('dashboard'), 500);
}

function highlightEmpty(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = 'var(--red)';
  setTimeout(() => { el.style.borderColor = ''; }, 2500);
}

function parseHHMM(str) {
  if (!str) return null;
  // Accept "Xh Ym" or "Xh" or plain minutes
  const hm = str.match(/(\d+)h\s*(?:(\d+)m?)?/);
  if (hm) return parseInt(hm[1]) * 60 + (parseInt(hm[2]) || 0);
  const onlyM = str.match(/^(\d+)m?$/);
  if (onlyM) return parseInt(onlyM[1]);
  return null;
}

function calcDurationMinFromForm(bedtime, wake_time) {
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wake_time.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

// ── Progress ───────────────────────────────────────────────
function showProgress(show) {
  document.getElementById('progress-wrap').style.display = show ? 'block' : 'none';
}
function updateProgress(pct, label) {
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = label;
}

// ── Charts Page ────────────────────────────────────────────
// タブのイベントリスナーは1回だけ登録（initで呼ぶ）
function initChartTabs() {
  document.querySelectorAll('#page-charts .chart-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#page-charts .chart-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.chartTab = btn.dataset.tab;
      renderCharts();
    };
  });

  document.querySelectorAll('#page-charts .chart-type-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#page-charts .chart-type-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.chartType = btn.dataset.type;
      renderCharts();
    };
  });

  document.getElementById('nav-prev').onclick = () => {
    if (State.chartTab === 'week')  State.weekOffset--;
    if (State.chartTab === 'month') State.monthOffset--;
    if (State.chartTab === 'year')  State.yearOffset--;
    renderCharts();
  };
  document.getElementById('nav-next').onclick = () => {
    if (State.chartTab === 'week'  && State.weekOffset  < 0) State.weekOffset++;
    if (State.chartTab === 'month' && State.monthOffset < 0) State.monthOffset++;
    if (State.chartTab === 'year'  && State.yearOffset  < 0) State.yearOffset++;
    renderCharts();
  };
}

// ── Dashboard Chart Tabs ────────────────────────────────────
function initDashChartTabs() {
  document.querySelectorAll('#page-dashboard .chart-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#page-dashboard .chart-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.dashChartTab = btn.dataset.tab;
      // Clear sub-unit shifts on tab change so the new tab starts at a clean unit boundary
      State.dashWeekShift = 0;
      State.dashMonthShift = 0;
      State.dashYearShift = 0;
      renderDashCharts();
    };
  });

  document.querySelectorAll('#page-dashboard .chart-type-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#page-dashboard .chart-type-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.dashChartType = btn.dataset.type;
      renderDashCharts();
    };
  });

  document.getElementById('dash-nav-prev').onclick = () => {
    // Arrow = step by unit (week/month/year). Clear sub-unit shift for clean jumps.
    if (State.dashChartTab === 'week')  { State.dashWeekOffset--;  State.dashWeekShift  = 0; }
    if (State.dashChartTab === 'month') { State.dashMonthOffset--; State.dashMonthShift = 0; }
    if (State.dashChartTab === 'year')  { State.dashYearOffset--;  State.dashYearShift  = 0; }
    renderDashCharts();
  };
  document.getElementById('dash-nav-next').onclick = () => {
    if (document.getElementById('dash-nav-next').disabled) return;
    if (State.dashChartTab === 'week')  { State.dashWeekOffset++;  State.dashWeekShift  = 0; }
    if (State.dashChartTab === 'month') { State.dashMonthOffset++; State.dashMonthShift = 0; }
    if (State.dashChartTab === 'year')  { State.dashYearOffset++;  State.dashYearShift  = 0; }
    renderDashCharts();
  };

  attachDashSwipe();
}

// ── Touch swipe handler for the dashboard chart ────────────
function attachDashSwipe() {
  const el = document.getElementById('dash-chart-wrapper');
  if (!el || el._swipeAttached) return;
  el._swipeAttached = true;

  let startX = 0, startY = 0, lastAppliedSteps = 0, locked = null, active = false;

  const barCount = () => State.dashChartTab === 'year' ? 12 : (State.dashChartTab === 'week' ? 7 : 30);
  const barWidth = () => el.clientWidth / barCount();

  // dir: -1 = newer (forward), +1 = older (back)
  const tryShift = (dir) => {
    const t = State.dashChartTab;
    const offKey   = t === 'week' ? 'dashWeekOffset' : t === 'month' ? 'dashMonthOffset' : 'dashYearOffset';
    const shiftKey = t === 'week' ? 'dashWeekShift'  : t === 'month' ? 'dashMonthShift'  : 'dashYearShift';

    // dir=-1 → newer: check we wouldn't push range.to past today
    if (dir < 0) {
      const probe = getDashRange(t, State[offKey], State[shiftKey] + 1);
      const todayYMD = toYMD(new Date());
      if (probe.to > todayYMD) return false;
      State[shiftKey] += 1;
    } else {
      State[shiftKey] -= 1;
    }
    renderDashCharts();
    return true;
  };

  el.addEventListener('touchstart', e => {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    lastAppliedSteps = 0; locked = null; active = true;
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    if (!active) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (locked === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        locked = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'h' : 'v';
      }
    }
    if (locked !== 'h') return;
    if (e.cancelable) e.preventDefault();

    const bw = barWidth() || 40;
    // dx > 0 (swipe right) → older → positive "steps back"
    const steps = Math.trunc(dx / bw);
    const delta = steps - lastAppliedSteps;
    if (delta === 0) return;
    for (let i = 0; i < Math.abs(delta); i++) {
      // delta > 0 means more "older" steps (dir = +1)
      const ok = tryShift(delta > 0 ? 1 : -1);
      if (!ok) break;
    }
    lastAppliedSteps = steps;
  }, { passive: false });

  el.addEventListener('touchend',   () => { active = false; }, { passive: true });
  el.addEventListener('touchcancel',() => { active = false; }, { passive: true });
}

function renderChartPage() {
  _jumpToLatest(true);
  renderCharts();
}

// isMain=true → charts page state;  isMain=false → dashboard state
function _jumpToLatest(isMain) {
  const records = Storage.getAll();
  if (!records.length) return;

  const now    = new Date();
  const latest = new Date(records[0].date + 'T00:00:00');

  const monthOffset = (latest.getFullYear() - now.getFullYear()) * 12
                    + (latest.getMonth()     - now.getMonth());
  const yearOffset  = latest.getFullYear() - now.getFullYear();
  const msPerWeek   = 7 * 24 * 60 * 60 * 1000;
  const nowMonday   = getMondayOf(now);
  const latMonday   = getMondayOf(latest);
  const weekOffset  = Math.round((latMonday - nowMonday) / msPerWeek);

  const oldest      = new Date(records[records.length - 1].date + 'T00:00:00');
  const spanMonths  = (latest.getFullYear() - oldest.getFullYear()) * 12
                    + (latest.getMonth()    - oldest.getMonth());

  if (isMain) {
    State.monthOffset = monthOffset;
    State.yearOffset  = yearOffset;
    State.weekOffset  = weekOffset;
    if (spanMonths >= 1 && State.chartTab === 'week') {
      State.chartTab = 'month';
      document.querySelectorAll('#page-charts .chart-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'month');
      });
    }
  } else {
    State.dashMonthOffset = monthOffset;
    State.dashYearOffset  = yearOffset;
    State.dashWeekOffset  = weekOffset;
    State.dashWeekShift   = 0;
    State.dashMonthShift  = 0;
    State.dashYearShift   = 0;
    if (spanMonths >= 1 && State.dashChartTab === 'week') {
      State.dashChartTab = 'month';
      document.querySelectorAll('#page-dashboard .chart-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'month');
      });
    }
  }
}

// Keep old name as alias for backward compat (used implicitly)
function jumpToLatestData() { _jumpToLatest(true); }

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function renderCharts() {
  try {
    _renderChartsInner(CHART_CTX_MAIN, {
      tab: State.chartTab, type: State.chartType,
      weekOffset: State.weekOffset, monthOffset: State.monthOffset, yearOffset: State.yearOffset,
    });
  } catch (err) {
    console.error('Chart render error:', err);
  }
}

function renderDashCharts() {
  try {
    const t = State.dashChartTab;
    const offset = t === 'week' ? State.dashWeekOffset : t === 'month' ? State.dashMonthOffset : State.dashYearOffset;
    const shift  = t === 'week' ? State.dashWeekShift  : t === 'month' ? State.dashMonthShift  : State.dashYearShift;
    _renderChartsInner(CHART_CTX_DASH, {
      tab: t, type: State.dashChartType,
      weekOffset: State.dashWeekOffset, monthOffset: State.dashMonthOffset, yearOffset: State.dashYearOffset,
      offset, shift, useSliding: true,
    });
  } catch (err) {
    console.error('Dash chart render error:', err);
  }
}

function _renderChartsInner(ctx, st) {
  const records = Storage.getAll();
  const tab     = st.tab;
  const type    = st.type;

  // Sliding-window range (used by the dashboard); fall back to legacy unit ranges otherwise.
  let range, label;
  if (st.useSliding) {
    range = getDashRange(tab, st.offset, st.shift);
    label = range.label;
  } else if (tab === 'week') {
    const r = getWeekRange(st.weekOffset);
    range = r; label = r.label;
  } else if (tab === 'month') {
    const r = getMonthRange(st.monthOffset);
    range = r; label = r.label;
  } else {
    const r = getYearRange(st.yearOffset);
    range = r; label = r.label;
  }

  document.getElementById(ctx.navLabel).textContent = label;
  const todayYMD = toYMD(new Date());
  document.getElementById(ctx.navNext).disabled = st.useSliding
    ? (range.to >= todayYMD)
    : (
        (tab === 'week'  && st.weekOffset  >= 0) ||
        (tab === 'month' && st.monthOffset >= 0) ||
        (tab === 'year'  && st.yearOffset  >= 0)
      );

  const rangeRecs = Storage.getByDateRange(range.from, range.to);

  // Build datasets
  let labels, values, bedtimes, wakeTimes, deep, light, rem, awake, scores, awakeCounts, napValues;

  if (st.useSliding) {
    labels = buildDashLabels(range);
    const findRec = ymd => records.find(r => r.date === ymd);
    const _avgFld = (recs, fld) => {
      const vs = recs.map(r => r[fld]).filter(v => v != null);
      return vs.length ? Math.round(vs.reduce((a,b)=>a+b,0)/vs.length) : null;
    };

    if (tab === 'year') {
      values      = eachMonthOfRange(range, (f,t) => _avgFld(records.filter(r => r.date >= f && r.date <= t), 'sleep_duration_min'));
      bedtimes    = eachMonthOfRange(range, (f,t) => {
        const recs = records.filter(r => r.date >= f && r.date <= t);
        const dec  = recs.map(r => toDecimalHour(r.bedtime)).filter(v => v != null);
        return dec.length ? dec.reduce((a,b)=>a+b,0)/dec.length : null;
      });
      wakeTimes   = eachMonthOfRange(range, (f,t) => {
        const recs = records.filter(r => r.date >= f && r.date <= t);
        const dec  = recs.map(r => toDecimalHour(r.wake_time)).filter(v => v != null);
        return dec.length ? dec.reduce((a,b)=>a+b,0)/dec.length : null;
      });
      deep  = eachMonthOfRange(range, (f,t) => _avgFld(records.filter(r => r.date >= f && r.date <= t), 'deep_sleep_min'));
      light = eachMonthOfRange(range, (f,t) => _avgFld(records.filter(r => r.date >= f && r.date <= t), 'light_sleep_min'));
      rem   = eachMonthOfRange(range, (f,t) => _avgFld(records.filter(r => r.date >= f && r.date <= t), 'rem_sleep_min'));
      awake = eachMonthOfRange(range, (f,t) => _avgFld(records.filter(r => r.date >= f && r.date <= t), 'awake_min'));
      scores = eachMonthOfRange(range, (f,t) => {
        const recs = records.filter(r => r.date >= f && r.date <= t);
        const ss   = recs.map(r => r.sleep_score ?? sleepScore(r)).filter(v => v != null);
        return ss.length ? Math.round(ss.reduce((a,b)=>a+b,0)/ss.length) : null;
      });
      awakeCounts = eachMonthOfRange(range, (f,t) => {
        const recs = records.filter(r => r.date >= f && r.date <= t);
        const ac   = recs.map(r => r.awake_count).filter(v => v != null);
        return ac.length ? +(ac.reduce((a,b)=>a+b,0)/ac.length).toFixed(1) : null;
      });
      napValues = eachMonthOfRange(range, (f,t) => {
        const recs = records.filter(r => r.date >= f && r.date <= t);
        const naps = recs.map(r => r.nap_min).filter(v => v != null && v > 0);
        return naps.length ? Math.round(naps.reduce((a,b)=>a+b,0)/naps.length) : null;
      });
    } else {
      values      = eachDayOfRange(range, ymd => findRec(ymd)?.sleep_duration_min ?? null);
      bedtimes    = eachDayOfRange(range, ymd => findRec(ymd)?.bedtime   ?? null);
      wakeTimes   = eachDayOfRange(range, ymd => findRec(ymd)?.wake_time ?? null);
      deep        = eachDayOfRange(range, ymd => findRec(ymd)?.deep_sleep_min  ?? null);
      light       = eachDayOfRange(range, ymd => findRec(ymd)?.light_sleep_min ?? null);
      rem         = eachDayOfRange(range, ymd => findRec(ymd)?.rem_sleep_min   ?? null);
      awake       = eachDayOfRange(range, ymd => findRec(ymd)?.awake_min       ?? null);
      scores      = eachDayOfRange(range, ymd => {
        const rec = findRec(ymd);
        return rec ? (rec.sleep_score ?? sleepScore(rec) ?? null) : null;
      });
      awakeCounts = eachDayOfRange(range, ymd => findRec(ymd)?.awake_count ?? null);
      napValues   = eachDayOfRange(range, ymd => findRec(ymd)?.nap_min     ?? null);
    }
  } else if (tab === 'week') {
    const d = buildWeekData(records, range.from);
    ({ labels, values, bedtimes, wakeTimes } = d);
    scores = labels.map((_, i) => {
      const d2 = new Date(range.from + 'T00:00:00');
      d2.setDate(d2.getDate() + i);
      const rec = records.find(r => r.date === toYMD(d2));
      return rec ? (rec.sleep_score ?? sleepScore(rec) ?? null) : null;
    });
    awakeCounts = labels.map((_, i) => {
      const d2 = new Date(range.from + 'T00:00:00');
      d2.setDate(d2.getDate() + i);
      const rec = records.find(r => r.date === toYMD(d2));
      return rec?.awake_count ?? null;
    });
    napValues = labels.map((_, i) => {
      const d2 = new Date(range.from + 'T00:00:00');
      d2.setDate(d2.getDate() + i);
      const rec = records.find(r => r.date === toYMD(d2));
      return rec?.nap_min ?? null;
    });
  } else if (tab === 'month') {
    const d = buildMonthData(records, range.year, range.month);
    ({ labels, values, bedtimes, wakeTimes } = d);
    scores = labels.map((_, i) => {
      const dd = String(i + 1).padStart(2, '0');
      const rec = records.find(r => r.date === `${range.year}-${String(range.month+1).padStart(2,'0')}-${dd}`);
      return rec ? (rec.sleep_score ?? sleepScore(rec) ?? null) : null;
    });
    awakeCounts = labels.map((_, i) => {
      const dd = String(i + 1).padStart(2, '0');
      const rec = records.find(r => r.date === `${range.year}-${String(range.month+1).padStart(2,'0')}-${dd}`);
      return rec?.awake_count ?? null;
    });
    napValues = labels.map((_, i) => {
      const dd = String(i + 1).padStart(2, '0');
      const rec = records.find(r => r.date === `${range.year}-${String(range.month+1).padStart(2,'0')}-${dd}`);
      return rec?.nap_min ?? null;
    });
  } else {
    const d = buildYearData(records, range.year);
    labels = d.labels; values = d.avgValues;
    deep = d.deep; light = d.light; rem = d.rem; awake = d.awake;
    bedtimes = d.avgBedtimes; wakeTimes = d.avgWakeTimes;
    awakeCounts = d.avgAwakeCounts;
    scores = labels.map((_, m) => {
      const from = `${range.year}-${String(m+1).padStart(2,'0')}-01`;
      const last = new Date(range.year, m + 1, 0).getDate();
      const to   = `${range.year}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
      const recs = records.filter(r => r.date >= from && r.date <= to);
      const ss   = recs.map(r => r.sleep_score ?? sleepScore(r)).filter(v => v != null);
      return ss.length ? Math.round(ss.reduce((a,b)=>a+b,0)/ss.length) : null;
    });
    napValues = labels.map((_, m) => {
      const from = `${range.year}-${String(m+1).padStart(2,'0')}-01`;
      const last = new Date(range.year, m + 1, 0).getDate();
      const to   = `${range.year}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
      const recs = records.filter(r => r.date >= from && r.date <= to);
      const naps = recs.map(r => r.nap_min).filter(v => v != null && v > 0);
      return naps.length ? Math.round(naps.reduce((a,b)=>a+b,0)/naps.length) : null;
    });
  }

  // Render the right chart
  if (type === 'duration') {
    if (tab === 'year') {
      Charts.renderMonthlyAvg(ctx.canvas, labels, values);
    } else {
      Charts.renderDuration(ctx.canvas, labels, values, { napValues });
    }
  } else if (type === 'bedtime') {
    Charts.renderBedtimes(ctx.canvas, labels, bedtimes, wakeTimes);
  } else if (type === 'score') {
    Charts.renderScore(ctx.canvas, labels, scores);
  } else if (type === 'awake') {
    Charts.renderAwakeCount(ctx.canvas, labels, awakeCounts);
  } else if (type === 'stages') {
    if (tab === 'year') {
      Charts.renderStages(ctx.canvas, labels, deep, light, rem, awake);
    } else if (st.useSliding) {
      // sliding-window path already built deep/light/rem per day
      Charts.renderStages(ctx.canvas, labels, deep, light, rem, []);
    } else {
      const d_arr = values.map((_, i) => {
        const rec = rangeRecs.find(r => {
          if (tab === 'week') {
            const d = new Date(range.from + 'T00:00:00');
            d.setDate(d.getDate() + i);
            return r.date === toYMD(d);
          }
          const dd = String(i + 1).padStart(2, '0');
          return r.date === `${range.year}-${String(range.month+1).padStart(2,'0')}-${dd}`;
        });
        return rec?.deep_sleep_min ?? null;
      });
      const l_arr = values.map((_, i) => {
        const rec = rangeRecs.find(r => {
          if (tab === 'week') {
            const d = new Date(range.from + 'T00:00:00');
            d.setDate(d.getDate() + i);
            return r.date === toYMD(d);
          }
          const dd = String(i + 1).padStart(2, '0');
          return r.date === `${range.year}-${String(range.month+1).padStart(2,'0')}-${dd}`;
        });
        return rec?.light_sleep_min ?? null;
      });
      const r_arr = values.map((_, i) => {
        const rec = rangeRecs.find(r => {
          if (tab === 'week') {
            const d = new Date(range.from + 'T00:00:00');
            d.setDate(d.getDate() + i);
            return r.date === toYMD(d);
          }
          const dd = String(i + 1).padStart(2, '0');
          return r.date === `${range.year}-${String(range.month+1).padStart(2,'0')}-${dd}`;
        });
        return rec?.rem_sleep_min ?? null;
      });
      Charts.renderStages(ctx.canvas, labels, d_arr, l_arr, r_arr, []);
    }
  }

  // データなし表示
  const noData = document.getElementById(ctx.noData);
  const hasValues =
    type === 'score' ? Array.isArray(scores)       && scores.some(v => v !== null) :
    type === 'awake' ? Array.isArray(awakeCounts)  && awakeCounts.some(v => v !== null) :
                       Array.isArray(values)        && values.some(v => v !== null);
  if (noData) noData.style.display = hasValues ? 'none' : 'block';

  // Summary stats — type-aware
  const _avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const _max = arr => arr.length ? Math.max(...arr) : null;
  const _min = arr => arr.length ? Math.min(...arr) : null;
  let sumLbl1, sumVal1, sumLbl2, sumVal2, sumLbl3, sumVal3;

  if (type === 'duration') {
    const s = Storage.stats(rangeRecs);
    sumLbl1 = '平均';   sumVal1 = s ? formatDuration(s.avg_duration_min) : '--';
    sumLbl2 = '最長';   sumVal2 = s ? formatDuration(s.max_duration_min) : '--';
    sumLbl3 = '最短';   sumVal3 = s ? formatDuration(s.min_duration_min) : '--';

  } else if (type === 'bedtime') {
    const bedDecs  = rangeRecs.map(r => toDecimalHour(r.bedtime)).filter(v => v != null);
    const wakeDecs = rangeRecs.map(r => toDecimalHour(r.wake_time)).filter(v => v != null);
    const avgBed   = _avg(bedDecs);
    const avgWake  = _avg(wakeDecs);
    const s        = Storage.stats(rangeRecs);
    sumLbl1 = '就寝平均'; sumVal1 = avgBed  != null ? formatTime(decToHHMM(avgBed))  : '--';
    sumLbl2 = '起床平均'; sumVal2 = avgWake != null ? formatTime(decToHHMM(avgWake)) : '--';
    sumLbl3 = '平均時間'; sumVal3 = s ? formatDuration(s.avg_duration_min) : '--';

  } else if (type === 'stages') {
    const deepArr  = rangeRecs.map(r => r.deep_sleep_min).filter(v => v != null);
    const remArr   = rangeRecs.map(r => r.rem_sleep_min).filter(v => v != null);
    const lightArr = rangeRecs.map(r => r.light_sleep_min).filter(v => v != null);
    const avg = arr => arr.length ? Math.round(_avg(arr)) : null;
    sumLbl1 = '深い平均';  sumVal1 = avg(deepArr)  != null ? formatDuration(avg(deepArr))  : '--';
    sumLbl2 = 'レム平均';  sumVal2 = avg(remArr)   != null ? formatDuration(avg(remArr))   : '--';
    sumLbl3 = '浅い平均';  sumVal3 = avg(lightArr) != null ? formatDuration(avg(lightArr)) : '--';

  } else if (type === 'score') {
    const ss = rangeRecs.map(r => r.sleep_score ?? sleepScore(r)).filter(v => v != null);
    const avg = ss.length ? Math.round(_avg(ss)) : null;
    sumLbl1 = '平均';  sumVal1 = avg           != null ? avg           + '点' : '--';
    sumLbl2 = '最高';  sumVal2 = _max(ss)      != null ? _max(ss)      + '点' : '--';
    sumLbl3 = '最低';  sumVal3 = _min(ss)      != null ? _min(ss)      + '点' : '--';

  } else if (type === 'awake') {
    const ac = rangeRecs.map(r => r.awake_count).filter(v => v != null);
    const avg = ac.length ? +(_avg(ac).toFixed(1)) : null;
    sumLbl1 = '平均回数'; sumVal1 = avg      != null ? avg      + '回' : '--';
    sumLbl2 = '最多';     sumVal2 = _max(ac) != null ? _max(ac) + '回' : '--';
    sumLbl3 = '最少';     sumVal3 = _min(ac) != null ? _min(ac) + '回' : '--';
  }

  document.getElementById(ctx.sumAvg).textContent = sumVal1 ?? '--';
  document.getElementById(ctx.sumMax).textContent = sumVal2 ?? '--';
  document.getElementById(ctx.sumMin).textContent = sumVal3 ?? '--';
  if (ctx.sumLbl1) {
    document.getElementById(ctx.sumLbl1).textContent = sumLbl1 ?? '';
    document.getElementById(ctx.sumLbl2).textContent = sumLbl2 ?? '';
    document.getElementById(ctx.sumLbl3).textContent = sumLbl3 ?? '';
  }
}

// ── Data Page ──────────────────────────────────────────────
function renderDataPage() {
  const records = Storage.getAll();
  const listEl  = document.getElementById('all-list');
  listEl.innerHTML = records.length
    ? records.map(r => buildSleepItem(r)).join('')
    : `<div class="empty-state"><div class="empty-icon">📭</div><p>データがありません</p></div>`;
  document.getElementById('record-count').textContent = `${records.length}件`;
}

// ── Settings ───────────────────────────────────────────────
function initSettings() {
  const keyInput = document.getElementById('api-key-input');
  keyInput.value = Storage.getApiKey();

  keyInput.addEventListener('input', () => {
    const val = keyInput.value.trim();
    Storage.setApiKey(val);
    updateApiStatus();
  });

  // Model selector
  const modelSelect = document.getElementById('model-select');
  const savedModel  = localStorage.getItem('st_gemini_model') || 'gemini-1.5-flash';
  modelSelect.value = savedModel;
  // Add saved model as option if not in list
  if (!modelSelect.value) {
    const opt = document.createElement('option');
    opt.value = savedModel; opt.textContent = savedModel;
    modelSelect.prepend(opt);
    modelSelect.value = savedModel;
  }
  modelSelect.addEventListener('change', () => {
    localStorage.setItem('st_gemini_model', modelSelect.value);
    showToast(`モデルを ${modelSelect.value} に変更しました`, 'success');
  });

  // 自動保存トグル
  const autoSaveToggle = document.getElementById('autosave-toggle');
  const autoSaveTrack  = document.getElementById('autosave-track');
  const autoSaveThumb  = document.getElementById('autosave-thumb');
  const setToggle = on => {
    autoSaveTrack.style.background = on ? 'var(--accent)' : 'var(--t3)';
    autoSaveThumb.style.left = on ? '23px' : '3px';
    autoSaveToggle.checked = on;
  };
  setToggle(Storage.getSettings().autoSave !== false); // デフォルトon
  autoSaveTrack.parentElement.addEventListener('click', () => {
    const next = !autoSaveToggle.checked;
    setToggle(next);
    Storage.setSetting('autoSave', next);
    showToast(next ? '自動保存 ON' : '自動保存 OFF（手動で保存ボタンを押してください）', 'success');
  });

  updateApiStatus();

  document.getElementById('test-api-btn').addEventListener('click', async () => {
    const key = Storage.getApiKey();
    if (!key) { showToast('APIキーを入力してください', 'error'); return; }
    const btn = document.getElementById('test-api-btn');
    btn.disabled = true;
    btn.textContent = 'テスト中…';
    try {
      const ok = await Gemini.testApiKey(key);
      showToast(ok ? 'APIキー有効です ✓' : 'APIキーが無効です', ok ? 'success' : 'error');
    } catch { showToast('接続エラー', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'テスト'; }
  });

  document.getElementById('list-models-btn').addEventListener('click', async () => {
    const key = Storage.getApiKey();
    if (!key) { showToast('APIキーを入力してください', 'error'); return; }
    const btn    = document.getElementById('list-models-btn');
    const result = document.getElementById('model-list-result');
    btn.disabled = true;
    btn.textContent = '取得中…';
    result.style.display = 'none';
    try {
      const models = await Gemini.listModels(key);
      // Rebuild select with actual available models
      modelSelect.innerHTML = '';
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        modelSelect.appendChild(opt);
      });
      // Pick best vision model
      const preferred = ['gemini-flash-lite-latest', 'gemini-2.5-flash-preview-04-17', 'gemma-3-27b-it', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      const best = preferred.find(p => models.includes(p)) || models[0];
      if (best) {
        modelSelect.value = best;
        localStorage.setItem('st_gemini_model', best);
      }
      result.style.display = 'block';
      result.textContent = `${models.length}件のモデルが見つかりました。「${best}」を選択しました。`;
      showToast('モデルを自動選択しました ✓', 'success');
    } catch (err) {
      showToast('モデル取得エラー: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'モデル確認';
    }
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    Storage.exportJSON();
    showToast('エクスポートしました', 'success');
  });

  document.getElementById('import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const result = await Storage.importJSON(file);
      showToast(`${result.added}件追加 (${result.skipped}件スキップ)`, 'success');
      renderDashboard();
    } catch (err) {
      showToast(`インポートエラー: ${err.message}`, 'error');
    }
    e.target.value = '';
  });

  document.getElementById('fix-year-btn').addEventListener('click', () => {
    const fixed = fixYearErrors();
    if (fixed === 0) {
      showToast('修正対象のデータはありませんでした', 'success');
    } else {
      showToast(`${fixed}件の日付を修正しました`, 'success');
      renderDashboard();
    }
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    showConfirmModal(
      '全データを削除',
      'すべての睡眠データを削除します。この操作は元に戻せません。',
      () => {
        Storage.save([]);
        renderDashboard();
        renderDataPage();
        showToast('全データを削除しました');
      }
    );
  });
}

function updateApiStatus() {
  const key   = Storage.getApiKey();
  const badge = document.getElementById('api-status');
  if (key) {
    badge.textContent = '設定済み';
    badge.className   = 'badge badge-green';
  } else {
    badge.textContent = '未設定';
    badge.className   = 'badge badge-red';
  }
}

// ── Edit Modal ──────────────────────────────────────────────
// Store the record id currently being edited
let _editRecordId = null;

function openEditModal(id) {
  // id comes from data-id attribute (always a string)
  const all = Storage.getAll();
  const record = all.find(r => String(r.id) === String(id));
  if (!record) {
    showToast('記録が見つかりませんでした', 'error');
    return;
  }
  _editRecordId = record.id;

  document.getElementById('edit-date').value     = record.date      ?? '';
  document.getElementById('edit-bedtime').value  = record.bedtime   ?? '';
  document.getElementById('edit-wake').value     = record.wake_time ?? '';
  document.getElementById('edit-duration').value = record.sleep_duration_min != null ? formatDuration(record.sleep_duration_min) : '';
  document.getElementById('edit-deep').value     = record.deep_sleep_min     != null ? formatDuration(record.deep_sleep_min)     : '';
  document.getElementById('edit-rem').value      = record.rem_sleep_min      != null ? formatDuration(record.rem_sleep_min)      : '';
  document.getElementById('edit-light').value    = record.light_sleep_min    != null ? formatDuration(record.light_sleep_min)    : '';
  document.getElementById('edit-awake').value       = record.awake_min   != null ? formatDuration(record.awake_min) : '';
  document.getElementById('edit-awake-count').value  = record.awake_count  != null ? record.awake_count  : '';
  document.getElementById('edit-sleep-score').value  = record.sleep_score  != null ? record.sleep_score  : '';
  document.getElementById('edit-nap').value           = record.nap_min      != null ? formatDuration(record.nap_min) : '';

  document.getElementById('edit-modal').classList.add('show');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('show');
  _editRecordId = null;
}

function commitEdit() {
  if (!_editRecordId) return;

  const dateVal = document.getElementById('edit-date').value.trim();
  const bedVal  = document.getElementById('edit-bedtime').value.trim();
  const wakeVal = document.getElementById('edit-wake').value.trim();

  if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    const inp = document.getElementById('edit-date');
    inp.style.borderColor = 'var(--red)';
    setTimeout(() => { inp.style.borderColor = ''; }, 2500);
    showToast('日付はYYYY-MM-DD形式で入力してください', 'error');
    return;
  }

  // Build changes object — only fields that are filled in
  const all = Storage.getAll();
  const current = all.find(r => String(r.id) === String(_editRecordId));
  if (!current) { showToast('記録が見つかりませんでした', 'error'); closeEditModal(); return; }

  const durVal = parseHHMM(document.getElementById('edit-duration').value);
  const dur = durVal ?? (bedVal && wakeVal ? calcDurationMinFromForm(bedVal, wakeVal) : current.sleep_duration_min);

  const changes = {
    date:               dateVal,
    bedtime:            bedVal  || current.bedtime,
    wake_time:          wakeVal || current.wake_time,
    sleep_duration_min: dur,
    deep_sleep_min:     parseHHMM(document.getElementById('edit-deep').value)  ?? current.deep_sleep_min,
    light_sleep_min:    parseHHMM(document.getElementById('edit-light').value) ?? current.light_sleep_min,
    rem_sleep_min:      parseHHMM(document.getElementById('edit-rem').value)   ?? current.rem_sleep_min,
    awake_min:          parseHHMM(document.getElementById('edit-awake').value) ?? current.awake_min,
    awake_count:        parseInt(document.getElementById('edit-awake-count').value)  || current.awake_count  || null,
    sleep_score:        parseInt(document.getElementById('edit-sleep-score').value)  || current.sleep_score  || null,
    nap_min:            parseHHMM(document.getElementById('edit-nap').value) ?? current.nap_min ?? null,
  };

  // If the new date conflicts with a DIFFERENT record, ask to overwrite
  const conflict = all.find(r => String(r.id) !== String(_editRecordId) && r.date === dateVal);
  if (conflict) {
    showConfirmModal(
      `${formatDate(dateVal)} を上書き`,
      `${formatDate(dateVal)} のデータがすでにあります。既存データを削除して上書きしますか？`,
      () => {
        Storage.remove(conflict.id);           // delete conflicting record first
        Storage.update(_editRecordId, changes); // then update this one
        closeEditModal();
        renderDashboard();
        renderDataPage();
        showToast('保存しました', 'success');
      },
      '上書き保存'
    );
    return;
  }

  // No conflict — straightforward update
  Storage.update(_editRecordId, changes);
  closeEditModal();
  renderDashboard();
  renderDataPage();
  showToast('保存しました', 'success');
}

function initEditModal() {
  document.getElementById('edit-modal-save').addEventListener('click', commitEdit);
  document.getElementById('edit-modal-cancel').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
  });
}

// ── Delete confirmation ─────────────────────────────────────
function confirmDelete(id) {
  showConfirmModal('記録を削除', 'この睡眠記録を削除しますか？', () => {
    Storage.remove(id);
    renderDashboard();
    if (State.page === 'data') renderDataPage();
    showToast('削除しました');
  });
}

// ── Confirm Modal ──────────────────────────────────────────
// Single callback variable — no listener accumulation possible
let _confirmCb = null;

function _initConfirmModal() {
  const modal      = document.getElementById('confirm-modal');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn  = document.getElementById('modal-cancel');

  const close = () => { modal.classList.remove('show'); _confirmCb = null; };

  confirmBtn.addEventListener('click', () => {
    if (_confirmCb) { const cb = _confirmCb; close(); cb(); }
  });
  cancelBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

function showConfirmModal(title, body, onConfirm, confirmLabel = '削除する') {
  document.getElementById('modal-title').textContent   = title;
  document.getElementById('modal-body').textContent    = body;
  document.getElementById('modal-confirm').textContent = confirmLabel;
  _confirmCb = onConfirm;
  document.getElementById('confirm-modal').classList.add('show');
}

// ── Toast ──────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `show ${type}`;
  clearTimeout(_toastTimer);
  // Errors stay until tapped; other messages auto-dismiss after 3s
  if (type === 'error') {
    el.style.cursor = 'pointer';
    el.onclick = () => el.classList.remove('show');
  } else {
    el.style.cursor = '';
    el.onclick = null;
    _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }
}

// 警告トースト：3秒で自動消え（エラーと違い残留しない）
function showWarn(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'show';
  el.style.cursor = '';
  el.onclick = null;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Helpers ────────────────────────────────────────────────
function pct(val, total) { return total ? Math.min(100, Math.round((val / total) * 100)) : 0; }

// 年の誤推定を修正：各レコードの日付の曜日と月/日から正しい年を特定する
function fixYearErrors() {
  const records   = Storage.getAll();
  const thisYear  = new Date().getFullYear();
  const today     = new Date();
  today.setHours(0, 0, 0, 0);

  let fixed = 0;
  const updated = records.map(r => {
    if (!r.date) return r;
    const d = new Date(r.date + 'T00:00:00');
    const storedYear = d.getFullYear();

    // すでに今年か昨年なら問題なし
    if (storedYear === thisYear || storedYear === thisYear - 1) return r;

    // 月と日を保持したまま今年・昨年でどちらが未来でないか試す
    const month = d.getMonth();
    const day   = d.getDate();

    const tryThis = new Date(thisYear, month, day);
    const tryLast = new Date(thisYear - 1, month, day);

    // 未来の日付は除外、より直近の日付を採用
    let bestDate = null;
    if (tryThis <= today) bestDate = tryThis;
    else bestDate = tryLast;

    const newDateStr = toYMD(bestDate);
    if (newDateStr !== r.date) {
      fixed++;
      return { ...r, date: newDateStr };
    }
    return r;
  });

  if (fixed > 0) {
    updated.sort((a, b) => b.date.localeCompare(a.date));
    Storage.save(updated);
  }
  return fixed;
}

// toYMD は charts.js で定義済み

// ── Calendar ───────────────────────────────────────────────
let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth(); // 0-indexed
let _calOpen  = false;

function initCalendar() {
  const btn = document.getElementById('today-date');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    _calOpen ? closeCalendar() : openCalendar();
  });

  document.getElementById('cal-prev').addEventListener('click', e => {
    e.stopPropagation();
    _calMonth--;
    if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', e => {
    e.stopPropagation();
    _calMonth++;
    if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    renderCalendar();
  });

  // Close when clicking outside
  document.addEventListener('click', e => {
    if (!_calOpen) return;
    const popup = document.getElementById('calendar-popup');
    if (!popup.contains(e.target)) closeCalendar();
  });
}

function openCalendar() {
  _calYear  = new Date().getFullYear();
  _calMonth = new Date().getMonth();
  renderCalendar();
  document.getElementById('calendar-popup').classList.add('show');
  _calOpen = true;
}

function closeCalendar() {
  document.getElementById('calendar-popup').classList.remove('show');
  _calOpen = false;
}

function renderCalendar() {
  const records   = Storage.getAll();
  const dateset   = new Set(records.map(r => r.date));
  const todayStr  = toYMD(new Date());
  const year      = _calYear, month = _calMonth;

  document.getElementById('cal-month-label').textContent =
    new Date(year, month, 1).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });

  const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sun
  const lastDate     = new Date(year, month + 1, 0).getDate();
  const grid         = document.getElementById('cal-grid');

  let html = '';
  // Blank cells before first day
  for (let i = 0; i < firstWeekday; i++) {
    html += '<button class="cal-day" disabled></button>';
  }
  for (let d = 1; d <= lastDate; d++) {
    const ds  = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = ['cal-day',
      dateset.has(ds) ? 'has-data' : '',
      ds === todayStr ? 'is-today' : '',
    ].filter(Boolean).join(' ');
    html += `<button class="${cls}" data-date="${ds}">${d}</button>`;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.cal-day[data-date]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      jumpToDateFromCal(btn.dataset.date);
      closeCalendar();
    });
  });
}

function jumpToDateFromCal(dateStr) {
  // Jump dashboard chart to the week containing dateStr
  const target     = new Date(dateStr + 'T00:00:00');
  const now        = new Date();
  const msPerWeek  = 7 * 24 * 60 * 60 * 1000;
  const nowMonday  = getMondayOf(now);
  const tgtMonday  = getMondayOf(target);
  State.dashChartTab    = 'week';
  State.dashWeekOffset  = Math.round((tgtMonday - nowMonday) / msPerWeek);
  State.dashWeekShift   = 0;
  State.dashMonthShift  = 0;
  State.dashYearShift   = 0;

  // Update tab UI
  document.querySelectorAll('#page-dashboard .chart-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === 'week');
  });

  renderDashCharts();
}
