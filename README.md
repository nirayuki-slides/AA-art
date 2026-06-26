# ASCII Art Studio

ブラウザだけで完結する画像 → アスキーアート変換ツール。画像をアップロードすると、文字セット・トーン・ディザ・エッジなどを調整しながらリアルタイムにアスキーアートへ変換できる。変換処理は Web Worker 上で動くので UI は固まらない。サーバー送信は一切なく、すべてローカルで処理される。

**Live demo:** https://nirayuki-slides.github.io/AA-art/

## 機能

- **画像入力**: クリックでファイル選択 / クリップボードからペースト / ドラッグ&ドロップ
- **出力設定**: 幅（文字数）、フォント（Consolas / MS ゴシック / Noto Sans Mono）、文字セット（4 種）、スペース許可
- **トーン調整**: 明るさ・コントラスト・ガンマ・輝度反転
- **ディテール**: ディザ（None / Ordered / Floyd–Steinberg）、エッジ強調、行高、文字色 / 背景色
- **プレビュー 3 モード**: Text / Image（canvas 描画）/ Compare（元画像と並べて比較）
- **書き出し**: クリップボードへコピー / TXT ダウンロード / PNG ダウンロード（2x 解像度、サイズ上限ガード付き）

## 技術スタック

- React 19 + TypeScript
- Vite 8（ビルド / 開発サーバー）
- Web Worker による変換処理
- 依存: `lucide-react`（アイコン）, `@fontsource/noto-sans-mono`（同梱フォント）

## ローカル開発

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # 型チェック + 本番ビルド (dist/)
npm run preview  # ビルド成果物をプレビュー
```

Node.js 20.19+ または 22.12+ が必要（Vite 8 の要件）。

## GitHub Pages へのデプロイ

`main` ブランチへ push すると `.github/workflows/deploy.yml` が自動でビルドし、GitHub Pages へ公開する。

初回のみリポジトリ側で1回だけ設定が必要:

1. リポジトリの **Settings → Pages** を開く
2. **Build and deployment → Source** を **GitHub Actions** に設定

以降は push のたびに自動デプロイされる。public リポジトリであることが前提（GitHub Free で private リポジトリの Pages は使えない）。`vite.config.ts` の `base: './'`（相対パス）により、`/AA-art/` のサブパス配信でもローカルでもそのまま動作する。

## ライセンス

MIT
