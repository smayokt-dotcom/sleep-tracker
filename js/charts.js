// ── Shared chart defaults ──────────────────────────────────
Chart.defaults.color = '#8888a8';
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
Chart.defaults.font.size = 11;

// PC: ホバー / スマホ: タッチ — どちらでもツールチップを表示
Chart.defaults.interaction.mode      = 'index';
Chart.defaults.interaction.intersect = false;

// 平均線データセットはツールチップに表示しない
Chart.defaults.plugins.tooltip.filter = item => !item.dataset._isAvg;

const C = {
  accent:  '#7c6fff',
  accentL: '#a594ff',
  cyan:    '#00d4ff',
  green:   '#00e676',
  yellow:  '#ffd54f',
  orange:  '#ff9800',
  red:     '#ff5252',
  grid:    'rgba(255,255,255,0.05)',
  bg:      'rgba(124,111,255,0.15)',
  bgCyan:  'rgba(0,212,255,0.15)',
};

// ── Average line + right-edge label plugin ─────────────────
const avgLinePlugin = {
  id: 'avgLine',
  afterDatasetsDraw(chart) {
    const avgs = chart.data.datasets.filter(ds => ds._isAvg && ds._avgLabel != null);
    if (!avgs.length) return;
    const { ctx, chartArea: { right }, scales: { y } } = chart;
    ctx.save();
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    avgs.forEach(ds => {
      if (ds._avgValue == null) return;
      const yPx = y.getPixelForValue(ds._avgValue);
      ctx.fillStyle = typeof ds.borderColor === 'string' ? ds.borderColor : C.yellow;
      ctx.fillText(ds._avgLabel, right + 6, yPx);
    });
    ctx.restore();
  }
};
Chart.register(avgLinePlugin);

// avgValue: チャート座標系の値, labelText: 右端に表示する文字列
function _makeAvgDs(len, avgValue, labelText, color) {
  if (avgValue == null) return null;
  return {
    label: '平均',
    data: Array(len).fill(avgValue),
    _isAvg: true,
    _avgValue: avgValue,
    _avgLabel: labelText,
    type: 'line',
    borderColor: color,
    borderWidth: 1.5,
    borderDash: [6, 3],
    pointRadius: 0,
    fill: false,
    tension: 0,
    order: -1,
  };
}

function _avgOf(arr) {
  const nn = arr.filter(v => v != null && !isNaN(v));
  return nn.length ? nn.reduce((a, b) => a + b, 0) / nn.length : null;
}

function baseGridOpts() {
  return {
    color: C.grid,
    drawBorder: false,
  };
}

function baseTickOpts() {
  return { maxRotation: 0, autoSkipPadding: 8 };
}

// ── Chart instances ────────────────────────────────────────
const Charts = {
  _instances: {},

  destroy(id) {
    if (this._instances[id]) {
      this._instances[id].destroy();
      delete this._instances[id];
    }
  },

  getCtx(id) {
    return document.getElementById(id)?.getContext('2d') ?? null;
  },

  // ── Duration bar chart (week / month) ────────────────────
  renderDuration(canvasId, labels, values, { highlightIdx = -1, napValues = null } = {}) {
    this.destroy(canvasId);
    const ctx = this.getCtx(canvasId);
    if (!ctx) return;

    const hasNap = napValues && napValues.some(v => v != null && v > 0);
    const totalH = values.map(v => v != null ? +(v / 60).toFixed(2) : null);
    const avg    = _avgOf(totalH);
    const avgDs  = _makeAvgDs(labels.length, avg,
      avg != null ? formatDuration(Math.round(avg * 60)) : null, C.yellow);

    let datasets;
    if (hasNap) {
      const nightH = values.map((v, i) => {
        if (v == null) return null;
        const nap = (napValues[i] ?? 0);
        return +((v - nap) / 60).toFixed(2);
      });
      const napH = napValues.map(v => (v != null && v > 0) ? +(v / 60).toFixed(2) : null);
      datasets = [
        {
          label: '夜間睡眠',
          data: nightH,
          backgroundColor: hexAlpha(C.accent, 0.75),
          borderColor: C.accent,
          borderWidth: 1.5,
          borderRadius: 0,
          borderSkipped: false,
          stack: 'sleep',
        },
        {
          label: '仮眠',
          data: napH,
          backgroundColor: hexAlpha(C.orange, 0.80),
          borderColor: C.orange,
          borderWidth: 1.5,
          borderRadius: 4,
          borderSkipped: false,
          stack: 'sleep',
        },
        ...(avgDs ? [avgDs] : []),
      ];
    } else {
      const bgColors = values.map((_, i) => i === highlightIdx ? C.accentL : C.accent);
      const alphas   = values.map((_, i) => i === highlightIdx ? 1 : 0.65);
      datasets = [
        {
          label: '睡眠時間',
          data: totalH,
          backgroundColor: bgColors.map((c, i) => hexAlpha(c, alphas[i])),
          borderColor: bgColors,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        },
        ...(avgDs ? [avgDs] : []),
      ];
    }

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        layout: { padding: { right: 52 } },
        plugins: {
          legend: { display: hasNap, labels: { boxWidth: 12, padding: 12 } },
          tooltip: {
            callbacks: {
              label: c => {
                if (c.dataset._isAvg) return '';
                return ` ${c.dataset.label}: ${c.raw != null ? formatDuration(Math.round(c.raw * 60)) : '--'}`;
              },
              footer: items => {
                if (!hasNap) return '';
                const sum = items
                  .filter(c => !c.dataset._isAvg && c.raw != null)
                  .reduce((a, c) => a + c.raw, 0);
                return sum > 0 ? `合計: ${formatDuration(Math.round(sum * 60))}` : '';
              },
            }
          }
        },
        scales: {
          x: { grid: baseGridOpts(), ticks: baseTickOpts(), stacked: hasNap },
          y: {
            grid: baseGridOpts(),
            ticks: { ...baseTickOpts(), callback: v => `${v}h`, stepSize: 1 },
            stacked: hasNap,
            min: 0,
            suggestedMax: 10,
          }
        }
      }
    });
  },

  // ── Bedtime / wake time line chart ────────────────────────
  renderBedtimes(canvasId, labels, bedtimes, wakeTimes) {
    this.destroy(canvasId);
    const ctx = this.getCtx(canvasId);
    if (!ctx) return;

    // HH:MM文字列 or 既に小数時刻の数値、どちらにも対応
    const toD = v => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number') return v;   // 年集計は既に小数
      return toDecimalHour(v);               // 週・月はHH:MM文字列
    };
    const bedDec  = bedtimes.map(toD);
    const wakeDec = wakeTimes.map(toD);

    const decToHHMM = val => {
      if (val == null) return null;
      const h = Math.floor(val % 24);
      const m = Math.round((val % 1) * 60);
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    };
    const avgBed  = _avgOf(bedDec);
    const avgWake = _avgOf(wakeDec);
    const avgBedDs  = _makeAvgDs(labels.length, avgBed,  decToHHMM(avgBed),  C.accent);
    const avgWakeDs = _makeAvgDs(labels.length, avgWake, decToHHMM(avgWake), C.cyan);

    const tickFn = val => {
      const h = Math.floor(val % 24);
      const m = Math.round((val % 1) * 60);
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    };

    this._instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '就寝',
            data: bedDec,
            borderColor: C.accent,
            backgroundColor: C.bg,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: C.accent,
            tension: 0.3,
            fill: false,
            spanGaps: true,
          },
          {
            label: '起床',
            data: wakeDec,
            borderColor: C.cyan,
            backgroundColor: C.bgCyan,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: C.cyan,
            tension: 0.3,
            fill: false,
            spanGaps: true,
          },
          ...(avgBedDs  ? [avgBedDs]  : []),
          ...(avgWakeDs ? [avgWakeDs] : []),
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        layout: { padding: { right: 52 } },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              boxWidth: 12, padding: 14, color: '#8888a8',
              filter: item => !item.text.includes('平均'), // 凡例に平均は出さない
            }
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                if (ctx.raw === null) return '';
                const h = Math.floor(ctx.raw % 24);
                const m = Math.round((ctx.raw % 1) * 60);
                return ` ${ctx.dataset.label}: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
              }
            }
          }
        },
        scales: {
          x: { grid: baseGridOpts(), ticks: baseTickOpts() },
          y: {
            grid: baseGridOpts(),
            // reverse: true → 大きい値(起床)が下、小さい値(就寝)が上
            reverse: true,
            ticks: { ...baseTickOpts(), callback: tickFn, stepSize: 1 },
          }
        }
      }
    });
  },

  // ── Monthly average bar chart (yearly view) ───────────────
  renderMonthlyAvg(canvasId, labels, avgValues) {
    this.destroy(canvasId);
    const ctx = this.getCtx(canvasId);
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, hexAlpha(C.accent, 0.9));
    gradient.addColorStop(1, hexAlpha(C.cyan, 0.6));

    const chartVals = avgValues.map(v => v ? +(v / 60).toFixed(2) : null);
    const avg = _avgOf(chartVals);
    const avgDs = _makeAvgDs(labels.length, avg,
      avg != null ? formatDuration(Math.round(avg * 60)) : null, C.yellow);

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '平均睡眠時間',
            data: chartVals,
            backgroundColor: gradient,
            borderColor: C.accentL,
            borderWidth: 1.5,
            borderRadius: 8,
            borderSkipped: false,
          },
          ...(avgDs ? [avgDs] : []),
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        layout: { padding: { right: 52 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ctx.raw != null ? ` ${formatDuration(Math.round(ctx.raw * 60))}` : ' データなし',
            }
          }
        },
        scales: {
          x: { grid: baseGridOpts(), ticks: baseTickOpts() },
          y: {
            grid: baseGridOpts(),
            ticks: { ...baseTickOpts(), callback: v => `${v}h` },
            min: 0,
            suggestedMax: 10,
          }
        }
      }
    });
  },

  // ── Sleep stage area chart ────────────────────────────────
  renderStages(canvasId, labels, deep, light, rem, awake) {
    this.destroy(canvasId);
    const ctx = this.getCtx(canvasId);
    if (!ctx) return;

    const toH = arr => arr.map(v => v ? +(v / 60).toFixed(2) : null);

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '深い睡眠', data: toH(deep),  backgroundColor: hexAlpha(C.accent, 0.85), stack: 'stages', borderRadius: 0 },
          { label: 'レム睡眠', data: toH(rem),   backgroundColor: hexAlpha(C.yellow, 0.75), stack: 'stages', borderRadius: 0 },
          { label: '浅い睡眠', data: toH(light), backgroundColor: hexAlpha(C.cyan, 0.65),   stack: 'stages', borderRadius: 0 },
          { label: '覚醒',     data: toH(awake), backgroundColor: hexAlpha('#555577', 0.7), stack: 'stages', borderRadius: 0 },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { boxWidth: 10, padding: 12, color: '#8888a8' }
          },
          tooltip: {
            callbacks: {
              label: ctx => ctx.raw !== null ? ` ${ctx.dataset.label}: ${formatDuration(Math.round(ctx.raw * 60))}` : '',
            }
          }
        },
        scales: {
          x: { stacked: true, grid: baseGridOpts(), ticks: baseTickOpts() },
          y: {
            stacked: true,
            grid: baseGridOpts(),
            ticks: { callback: v => `${v}h` },
            min: 0,
          }
        }
      }
    });
  },

  // ── Sleep score line chart ────────────────────────────────
  renderScore(canvasId, labels, scores) {
    this.destroy(canvasId);
    const ctx = this.getCtx(canvasId);
    if (!ctx) return;

    // スコアに応じた点の色（80以上:緑, 60以上:黄, それ以下:赤）
    const pointColors = scores.map(v =>
      v == null ? 'transparent' : v >= 80 ? C.green : v >= 60 ? C.yellow : C.red
    );

    const avg = _avgOf(scores.filter(v => v != null));
    const avgDs = _makeAvgDs(labels.length, avg,
      avg != null ? Math.round(avg) + '点' : null, C.yellow);

    this._instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'スコア',
            data: scores,
            borderColor: C.accentL,
            backgroundColor: hexAlpha(C.accentL, 0.1),
            borderWidth: 2,
            pointRadius: 5,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            tension: 0.3,
            fill: true,
            spanGaps: true,
          },
          ...(avgDs ? [avgDs] : []),
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        layout: { padding: { right: 52 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ctx.raw != null ? ` スコア: ${ctx.raw}点` : '',
            }
          }
        },
        scales: {
          x: { grid: baseGridOpts(), ticks: baseTickOpts() },
          y: {
            grid: baseGridOpts(),
            ticks: { ...baseTickOpts(), callback: v => `${v}点` },
            min: 0,
            max: 100,
          }
        }
      }
    });
  },

  // ── Awake count bar chart ─────────────────────────────────
  renderAwakeCount(canvasId, labels, counts) {
    this.destroy(canvasId);
    const ctx = this.getCtx(canvasId);
    if (!ctx) return;

    // Color per bar: 0 → green, 1-2 → yellow, 3+ → red
    const barColors = counts.map(v =>
      v == null ? 'transparent' : v === 0 ? C.green : v <= 2 ? C.yellow : C.red
    );

    const avg = _avgOf(counts.filter(v => v != null));
    const avgDs = _makeAvgDs(labels.length, avg,
      avg != null ? (Math.round(avg * 10) / 10) + '回' : null, C.yellow);

    this._instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '覚醒回数',
            data: counts,
            backgroundColor: barColors.map((c, i) => counts[i] == null ? 'transparent' : hexAlpha(c, 0.7)),
            borderColor: barColors,
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false,
          },
          ...(avgDs ? [avgDs] : []),
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        layout: { padding: { right: 52 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ctx.raw != null ? ` 覚醒: ${ctx.raw}回` : '',
            }
          }
        },
        scales: {
          x: { grid: baseGridOpts(), ticks: baseTickOpts() },
          y: {
            grid: baseGridOpts(),
            ticks: { ...baseTickOpts(), callback: v => `${v}回`, stepSize: 1 },
            min: 0,
            suggestedMax: 5,
          }
        }
      }
    });
  },

  destroyAll() {
    Object.keys(this._instances).forEach(id => this.destroy(id));
  }
};

// ── Date range helpers ─────────────────────────────────────
function getWeekRange(offset = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offset * 7);
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: toYMD(mon), to: toYMD(sun), label: weekLabel(mon, sun) };
}

function getMonthRange(offset = 0) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const first = new Date(y, m, 1);
  const last  = new Date(y, m + 1, 0);
  return {
    from:  toYMD(first),
    to:    toYMD(last),
    label: `${first.getFullYear()}年${first.getMonth() + 1}月`,
    year:  first.getFullYear(),
    month: first.getMonth(),
  };
}

function getYearRange(offset = 0) {
  const y = new Date().getFullYear() + offset;
  return {
    from:  `${y}-01-01`,
    to:    `${y}-12-31`,
    label: `${y}年`,
    year:  y,
  };
}

// sleep_duration_min が null でも就寝/起床から計算できる場合は計算する
function _durFromRec(rec) {
  if (!rec) return null;
  if (rec.sleep_duration_min) return rec.sleep_duration_min;
  if (rec.bedtime && rec.wake_time) {
    const [bh, bm] = rec.bedtime.split(':').map(Number);
    const [wh, wm] = rec.wake_time.split(':').map(Number);
    let m = (wh * 60 + wm) - (bh * 60 + bm);
    if (m < 0) m += 1440;
    return m || null;
  }
  return null;
}

function buildWeekData(records, from) {
  const labels = [], values = [], bedtimes = [], wakeTimes = [], awakeCounts = [];
  const DAY_NAMES = ['月','火','水','木','金','土','日'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(from + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const ymd = toYMD(d);
    const rec = records.find(r => r.date === ymd);
    labels.push(`${DAY_NAMES[i]} ${d.getMonth()+1}/${d.getDate()}`);
    values.push(_durFromRec(rec));
    bedtimes.push(rec?.bedtime ?? null);
    wakeTimes.push(rec?.wake_time ?? null);
    awakeCounts.push(rec?.awake_count ?? null);
  }
  return { labels, values, bedtimes, wakeTimes, awakeCounts };
}

function buildMonthData(records, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const labels = [], values = [], bedtimes = [], wakeTimes = [], awakeCounts = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rec = records.find(r => r.date === ymd);
    labels.push(`${d}`);
    values.push(_durFromRec(rec));
    bedtimes.push(rec?.bedtime ?? null);
    wakeTimes.push(rec?.wake_time ?? null);
    awakeCounts.push(rec?.awake_count ?? null);
  }
  return { labels, values, bedtimes, wakeTimes, awakeCounts };
}

function buildYearData(records, year) {
  const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const labels = MONTH_NAMES;
  const avgValues = [], deep = [], light = [], rem = [], awake = [];
  const avgBedtimes = [], avgWakeTimes = [], avgAwakeCounts = [];
  for (let m = 0; m < 12; m++) {
    const from = `${year}-${String(m+1).padStart(2,'0')}-01`;
    const last = new Date(year, m + 1, 0).getDate();
    const to   = `${year}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
    const recs = records.filter(r => r.date >= from && r.date <= to);
    const avg    = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    const avgDec = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
    avgValues.push(avg(recs.map(r=>r.sleep_duration_min).filter(Boolean)));
    deep.push(avg(recs.map(r=>r.deep_sleep_min).filter(Boolean)));
    light.push(avg(recs.map(r=>r.light_sleep_min).filter(Boolean)));
    rem.push(avg(recs.map(r=>r.rem_sleep_min).filter(Boolean)));
    awake.push(avg(recs.map(r=>r.awake_min).filter(Boolean)));
    const acounts = recs.map(r=>r.awake_count).filter(v=>v!=null);
    avgAwakeCounts.push(acounts.length ? +(avgDec(acounts).toFixed(1)) : null);
    // 月平均の就寝・起床（小数時刻で平均）
    const bedDecs  = recs.map(r=>toDecimalHour(r.bedtime)).filter(v=>v!==null);
    const wakeDecs = recs.map(r=>toDecimalHour(r.wake_time)).filter(v=>v!==null);
    avgBedtimes.push(avgDec(bedDecs));
    avgWakeTimes.push(avgDec(wakeDecs));
  }
  return { labels, avgValues, deep, light, rem, awake, avgBedtimes, avgWakeTimes, avgAwakeCounts };
}

// ── Utility ────────────────────────────────────────────────
// 小数時刻 → HH:MM文字列（24h表記）
function decToHHMM(val) {
  if (val == null) return null;
  const h = Math.floor(val % 24);
  const m = Math.round((val % 1) * 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// HH:MM → 小数時刻（12時未満は翌日扱いで+24）
function toDecimalHour(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  let dec = h + m / 60;
  if (dec < 12) dec += 24;
  return dec;
}

function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function weekLabel(mon, sun) {
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  return `${fmt(mon)} – ${fmt(sun)}`;
}

// ── Sliding-window range helpers (dashboard) ───────────────
// Returns {tab, from, to, label, days|months, startYear?, startMonth?}
function getDashRange(tab, offset, shift) {
  const now = new Date();
  now.setHours(0,0,0,0);

  if (tab === 'week') {
    // Window ends at this Sunday + offset*7 + shift days. 7 days back from end.
    const dow = now.getDay();                       // 0=Sun..6=Sat
    const toSun = dow === 0 ? 0 : (7 - dow);
    const end = new Date(now);
    end.setDate(now.getDate() + toSun + offset * 7 + shift);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return { tab, from: toYMD(start), to: toYMD(end), label: _dateRangeLabel(start, end), days: 7 };
  }

  if (tab === 'month') {
    // 30-day window ending at today + offset*30 + shift days.
    const end = new Date(now);
    end.setDate(now.getDate() + offset * 30 + shift);
    const start = new Date(end);
    start.setDate(end.getDate() - 29);
    return { tab, from: toYMD(start), to: toYMD(end), label: _dateRangeLabel(start, end), days: 30 };
  }

  // year: 12-month window ending at current month + offset*12 + shift months.
  const endIdx   = now.getFullYear() * 12 + now.getMonth() + offset * 12 + shift;
  const startIdx = endIdx - 11;
  const endY = Math.floor(endIdx / 12);
  const endM = ((endIdx % 12) + 12) % 12;
  const sY   = Math.floor(startIdx / 12);
  const sM   = ((startIdx % 12) + 12) % 12;
  const startDate = new Date(sY,   sM,   1);
  const endDate   = new Date(endY, endM + 1, 0);     // last day of end month
  return {
    tab,
    from: toYMD(startDate), to: toYMD(endDate),
    label: `${sY}年${sM+1}月 – ${endY}年${endM+1}月`,
    months: 12,
    startYear: sY, startMonth: sM,
  };
}

function _dateRangeLabel(d1, d2) {
  const same = d1.getFullYear() === d2.getFullYear();
  const fmt  = d => `${d.getMonth()+1}/${d.getDate()}`;
  const fmtY = d => `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
  return same ? `${fmt(d1)} – ${fmt(d2)}` : `${fmtY(d1)} – ${fmtY(d2)}`;
}

function buildDashLabels(range) {
  if (range.tab === 'year') {
    const out = [];
    for (let i = 0; i < range.months; i++) {
      const m  = range.startMonth + i;
      const y  = range.startYear + Math.floor(m / 12);
      const mm = ((m % 12) + 12) % 12;
      out.push((i === 0 || mm === 0) ? `${y}/${mm+1}` : `${mm+1}月`);
    }
    return out;
  }
  const out = [];
  const start = new Date(range.from + 'T00:00:00');
  for (let i = 0; i < range.days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (range.tab === 'week') {
      const DAY = ['日','月','火','水','木','金','土'];
      out.push(`${DAY[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`);
    } else {
      out.push(`${d.getMonth()+1}/${d.getDate()}`);
    }
  }
  return out;
}

function eachDayOfRange(range, fn) {
  const out = [];
  const start = new Date(range.from + 'T00:00:00');
  for (let i = 0; i < range.days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(fn(toYMD(d), i));
  }
  return out;
}

function eachMonthOfRange(range, fn) {
  const out = [];
  for (let i = 0; i < range.months; i++) {
    const m  = range.startMonth + i;
    const y  = range.startYear + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    const from = `${y}-${String(mm+1).padStart(2,'0')}-01`;
    const last = new Date(y, mm+1, 0).getDate();
    const to   = `${y}-${String(mm+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
    out.push(fn(from, to, i));
  }
  return out;
}

function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
