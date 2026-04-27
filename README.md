# 🌙 Sleep Tracker

Huawei Health アプリのスクリーンショットから睡眠データを自動抽出し、グラフで可視化する PWA（Progressive Web App）です。

**🔗 デモ:** https://smayokt-dotcom.github.io/sleep-tracker/

---

## 主な機能

| 機能 | 説明 |
|---|---|
| 📸 スクショ取込 | Huawei Health の睡眠画面を撮影→アップロードするだけでデータ自動抽出 |
| 📊 グラフ表示 | 睡眠時間 / 就寝・起床時刻 / ステージ / スコア / 覚醒回数 を週・月・年単位で表示 |
| 📅 カレンダー | 今日の日付をタップ→カレンダー表示、データのある日をハイライト、日付タップで該当週へジャンプ |
| ✏️ 手動編集 | 抽出値が誤っていた場合にモーダルから修正可能 |
| 📤 エクスポート | 全データを JSON ファイルとして保存 |
| 📥 インポート | 別端末からエクスポートした JSON を読み込んで復元 |
| 📱 PWA | ホーム画面に追加してネイティブアプリのように使用可能 |

---

## 技術スタック

| 分類 | 内容 |
|---|---|
| フロントエンド | Vanilla JS（フレームワーク不使用）|
| グラフ | [Chart.js 4.4.0](https://www.chartjs.org/) |
| AI 解析 | [Google Gemini API](https://aistudio.google.com/) |
| ストレージ | localStorage（サーバー不要、端末内完結）|
| PWA | Web App Manifest + Service Worker |
| デプロイ | GitHub Pages |

---

## セットアップ

### ローカル開発

```bash
git clone https://github.com/smayokt-dotcom/sleep-tracker.git
cd sleep-tracker
# 静的ファイルなのでそのままブラウザで開くか、ローカルサーバーを使用
npx serve .
# または
python -m http.server 8080
```

### Gemini API キーの取得

1. [Google AI Studio](https://aistudio.google.com/app/apikey) にアクセス
2. 「Create API key」でキーを生成
3. アプリの **設定タブ** → **APIキー** 欄に貼り付け
4. 「テスト」ボタンで疎通確認

> APIキーは端末の localStorage にのみ保存されます。外部サーバーには送信されません。

---

## 使い方

### 1. スクリーンショットの取込

1. **追加タブ** を開く
2. Huawei Health の睡眠詳細画面のスクショを選択（JPEG / PNG）
3. Gemini API が自動解析し、各フィールドに値を入力
4. 内容を確認して「保存する」

> **自動保存（デフォルト ON）:** 設定タブで有効にしていると抽出完了後に確認なしで自動保存されます。

### 2. グラフの見方

ホーム画面に以下のタブが表示されます：

| タブ | 内容 |
|---|---|
| 睡眠時間 | 1日ごとの合計睡眠時間（棒グラフ）|
| 就寝/起床 | 就寝・起床時刻の推移（折れ線グラフ）。Y軸が逆転しており就寝が上・起床が下 |
| ステージ | 深い睡眠 / レム睡眠 / 浅い睡眠 / 覚醒の積み上げ棒グラフ |
| スコア | 睡眠スコアの推移（折れ線グラフ）|
| 覚醒回数 | 夜間に目覚めた回数（棒グラフ）|

- **週 / 月 / 年** タブで集計期間を切り替え
- 年表示は月ごとの平均値
- グラフ右端に **平均値ライン** と数値ラベルを表示
- PC はホバー、スマホはタッチでその日のデータをツールチップ表示
- ◀ ▶ ボタンで過去・未来の期間へナビゲーション

### 3. カレンダーナビゲーション

ヘッダーの **日付ボタン**（例：`2026年4月27日(月)`）をタップするとカレンダーが開きます。

- 紫背景の日 = データあり
- 枠線の日 = 今日
- 日付をタップ → その週のグラフへジャンプ

### 4. データの編集・削除

**データタブ** の一覧から各レコードの ✏️ / 🗑️ ボタンで操作できます。

---

## データ仕様

### レコード形式

localStorage のキー `st_records` に JSON 配列として保存されます。

```json
{
  "id": "1714234567890",
  "date": "2026-04-23",
  "bedtime": "23:20",
  "wake_time": "07:05",
  "sleep_duration_min": 465,
  "deep_sleep_min": 98,
  "light_sleep_min": 267,
  "rem_sleep_min": 100,
  "awake_min": 12,
  "awake_count": 2,
  "notes": null,
  "created_at": "2026-04-23T12:00:00.000Z"
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | タイムスタンプベースの一意ID |
| `date` | string | `YYYY-MM-DD` 形式 |
| `bedtime` | string | 就寝時刻 `HH:MM`（24時間）|
| `wake_time` | string | 起床時刻 `HH:MM`（24時間）|
| `sleep_duration_min` | number \| null | 合計睡眠時間（分）|
| `deep_sleep_min` | number \| null | 深い睡眠（分）|
| `light_sleep_min` | number \| null | 浅い睡眠（分）|
| `rem_sleep_min` | number \| null | レム睡眠（分）|
| `awake_min` | number \| null | 夜間覚醒時間（分）|
| `awake_count` | number \| null | 夜間に目覚めた回数 |
| `created_at` | string | ISO 8601 形式の登録日時 |

### localStorage キー一覧

| キー | 内容 |
|---|---|
| `st_records` | 睡眠レコード配列（JSON）|
| `st_gemini_key` | Gemini API キー |
| `st_settings` | アプリ設定（autoSave など）|
| `st_gemini_model` | 使用する Gemini モデル名 |

---

## 睡眠スコアの計算式

0〜100 点のスコアを以下のロジックで算出します。

### 1. 睡眠時間スコア（`durScore`）

理想睡眠時間を **7.5 時間（450 分）** として偏差を評価します。

| 理想からの偏差 | 計算式 |
|---|---|
| ±30 分以内（7〜8h）| `95 − 偏差 × 0.17`（最大 95pt）|
| ±30〜90 分（6〜9h）| `90 − (偏差 − 30) × 0.67`（50〜90pt）|
| それ以外 | `max(0, 50 − (偏差 − 90) × 0.5)` |

### 2. 睡眠ステージスコア

データがある項目のみ評価し、平均を取ります。

| 項目 | 理想比率 | 計算式 |
|---|---|---|
| 深い睡眠 | 20% | `max(0, 100 − |実績比率 − 0.20| × 500)` |
| レム睡眠 | 22% | `max(0, 100 − |実績比率 − 0.22| × 400)` |
| 覚醒時間 | 少ないほど良 | `max(0, 100 − 覚醒比率 × 800)` |

### 3. 合成

```
最終スコア = durScore × 55% + ステージ平均 × 45%
```

> ステージデータがない場合は `durScore` のみで算出し、**上限 75 点** に制限されます。

---

## ファイル構成

```
sleep-tracker/
├── index.html          # アプリシェル（PWA, モーダル含む）
├── manifest.json       # Web App Manifest
├── sw.js               # Service Worker（オフラインキャッシュ）
├── css/
│   └── app.css         # ダークテーマ UI スタイル
├── js/
│   ├── app.js          # メインコントローラー（状態管理・ページ制御）
│   ├── charts.js       # Chart.js グラフ描画・データ集計
│   ├── gemini.js       # Gemini API 呼び出し・データ正規化
│   └── storage.js      # localStorage CRUD・スコア計算・フォーマット関数
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## Gemini モデルについて

設定画面から使用モデルを変更できます。

| モデル | 備考 |
|---|---|
| `gemini-flash-lite-latest` | 推奨。無料枠で動作確認済み・高速 |
| `gemini-2.5-flash-preview-04-17` | 高精度だが消費量大 |
| `gemma-3-27b-it` | オープンモデル、無料枠で利用可 |

---

## ライセンス

MIT
