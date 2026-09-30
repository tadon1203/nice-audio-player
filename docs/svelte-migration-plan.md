# React → Svelte 移行プラン

レンダラーを React から SvelteKit (Svelte 5) へ全面移行し、同時にレンダラーの構造的問題を直す。Rust (`backend/`, `src-tauri/`) の振る舞いは変えない。移行が終わったらこのファイルは削除し、恒久的な内容は [ADR](./adr/) と [CONTRIBUTING.md](../CONTRIBUTING.md) に移す (`architecture.md` は廃止済み)。

## 0. 前提

- 規模: `src/` 約 15,000 行、`.tsx` のうち `motion` を使うファイル 35、`layoutId` 12 箇所、Base UI を使うファイル 15。純粋なモデルとそのテスト (`*-model.ts`, `lib/*.ts`) はフレームワーク非依存で、そのまま移せる。
- 安全網: Playwright の renderer E2E (15 ファイル、ロケーターの大半が `getByRole` / `getByLabel`) はフレームワークに依存しない。**この E2E を仕様として扱い、マークアップの役割・ラベル・`data-slot` / `data-region` / `data-tone` を保てば通る状態を目標にする。**
- 参照テンプレート: `pnpm create tauri-app@latest <dir> --template svelte-ts --manager pnpm -y` で生成したもの (SvelteKit 2.65 / Svelte 5.56 / vite-plugin-svelte 7 / adapter-static 3 / Vite 8 / TypeScript 6)。作業時に同じコマンドで一時ディレクトリへ作り直して参照する。要点は §3。

## 1. 判断: SvelteKit を使う

SvelteKit (`adapter-static` + `ssr = false` の SPA) を採用する。素の Svelte + ルーターライブラリにはしない。

- **ルーティングが要る。** 8 ルート、動的セグメント、リダイレクト、ネストしたレイアウトがある。素の Svelte ではルーターを追加で選ぶことになり、SvelteKit のファイルベースルーティングを自前で再現するだけになる。
- **Now Playing の要件にそのまま合う。** 現在は「履歴 state に `nowPlaying` を置いたレイヤー (Back で閉じる、下のライブラリはマウントされたまま)」を TanStack Router で実装している。SvelteKit の shallow routing (`pushState('', { nowPlaying: true })` と `page.state`) が同じものを標準機能として提供する。`parentArtist` / `artwork` の受け渡しも `goto(url, { state })` で置き換えられる。
- **公式の組み合わせ。** Tauri 公式テンプレートと Tauri のドキュメントは SvelteKit + adapter-static。Svelte の AI ツール (`sv add ai-tools`、MCP、skills) も SvelteKit を前提にしている。
- **SSR やサーバーは使わない。** `+page.server.ts` / form actions / `load` は使わない (データは TanStack Query がネイティブから読む)。使う機能はルーティング、レイアウト、shallow routing、`snapshot`、`$lib` だけ。

## 2. 目標構成

FSD の 6 層をやめ、SvelteKit の標準 (`src/routes` + `src/lib`) に合わせた、ドメイン単位の構成にする。理由は §4 の S1。

```text
src/
  app.html, app.d.ts, app.css      エントリ HTML、PageState 型、デザイントークン (旧 app/styles.css)
  routes/                          画面とアプリシェル。画面専用の部品はルートのフォルダに同居させる
    +layout.svelte                 AppShell (タイトルバー、ナビ、ワークスペース、Now Playing、ドック、キュー)
    +layout.ts                     ssr = false, prerender = false
    +page.ts                       → /library/albums へリダイレクト
    library/
      +layout.svelte               ライブラリ共通 (ツールバーとワークスペース枠)
      albums/+page.svelte
      albums/[albumArtist]/[albumTitle]/+page.svelte
      album-artists/+page.svelte
      album-artists/[artistName]/+page.svelte
      tracks/+page.svelte
    settings/+page.svelte, settings/*.svelte
  lib/
    native/        生成された IPC 契約 (bindings.ts)、唯一のアダプタ native.ts、エラー型
    playback/      再生状態 (runes)、クロック、コマンド、波形・出力デバイスのクエリ、純粋ロジック
    library/       カタログのクエリ・ミューテーション・イベント反映、ソート、名前の表示
    lyrics/        歌詞のクエリとイベント反映
    settings/      バックエンド設定のミラー (1 つのストア)
    shell/         画面をまたぐ UI 状態: Now Playing の開閉、キューパネル、歌詞⇔波形のリンク、スクロール記憶
    components/    ドメインを組み合わせた部品: dock/, now-playing/, queue-panel/, track-table/, media-details/
    ui/            見た目の部品: shadcn/ (shadcn-svelte), artwork, artwork-light, waveform, rolling-number,
                   media-grid, workspace-*, motion/ (トークンと遷移)
    utils/         format, graphemes, sort-index など
```

依存の向き: `routes → components → shell → {playback, library, lyrics, settings} → {ui, utils, native}`。ドメイン同士 (`playback` ↔ `library` など) は互いを import しない。2 つのドメインを結ぶもの (例: シグナルパス = 再生状態 + トラック情報) は使う側 (`components/`) に置く。`oxlint` の `no-restricted-imports` で下向き以外を禁止する (今の FSD ルールの置き換え)。

## 3. テンプレートとの差分

テンプレートから取り込むもの / 変えるもの:

| 項目                    | テンプレート                                                     | このプロジェクト                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svelte.config.js`      | `adapter-static({ fallback: "index.html" })`, `vitePreprocess()` | 同じ。`kit.alias` は追加しない (`$lib` を使う)                                                                                                                |
| `src/routes/+layout.ts` | `export const ssr = false`                                       | 同じ + `prerender = false`                                                                                                                                    |
| `vite.config`           | `sveltekit()`、port 1420、`TAURI_DEV_HOST`                       | `sveltekit()` + `tailwindcss()`。host `127.0.0.1` / port 1420 / strictPort は今の設定を維持。`watch.ignored` に `src-tauri/**` と `backend/**`                |
| `tsconfig.json`         | `.svelte-kit/tsconfig.json` を extends                           | 同じ。`tsconfig.app/renderer.json` は削除し、ツール用 (`tsconfig.tools.json`) と `tests/tsconfig.json` だけ残す                                               |
| 型検査                  | `svelte-check`                                                   | `pnpm typecheck` = `svelte-kit sync && svelte-check` + `tsc -b` (ツールとテスト)                                                                              |
| `tauri.conf.json`       | `frontendDist: "../build"`                                       | `../build` に変更。`beforeDevCommand` は `pnpm exec vite dev --host 127.0.0.1 --port 1420 --strictPort`。CSP は §9 の検証結果で決める                         |
| `app.html`              | `%sveltekit.head%` / `%sveltekit.body%`                          | 今の `src/app/index.html` の内容 (フォント preload、`lang` など) を移す。`data-sveltekit-preload-data` は付けない (ネイティブ読み込みを hover で先読みしない) |
| `static/`               | favicon など                                                     | そのまま (`static/fonts` もそのまま、`scripts/fonts.mjs` は変更不要)                                                                                          |
| `plugin-opener`         | 含む                                                             | 取り込まない                                                                                                                                                  |

`pnpm-workspace.yaml` の `allowBuilds` に `esbuild` 以外で必要なもの (`@sveltejs/kit` の postinstall はない) がないことを確認する。

## 4. 構造的問題と修正

移行と同時に直す。どれも React 固有の回避策か、今の構成が生んだ負債。

| #   | 問題                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 修正                                                                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **FSD の層が実体に合っていない。** `features/` 4 スライスのうち 3 つ (`toggle-queue-panel`, `lyrics-waveform-link`, `now-playing-transition`) はユーザー機能ではなく、「兄弟 widget を import しない」規則を満たすための状態置き場。`now-playing-transition` は開閉状態・ID・遷移・音量レベル・波形帯 UI の寄せ集めで、しかも兄弟 feature (`lyrics-waveform-link`) を import しており自らの規則に違反している。`app/routes` と `pages/` が同じものを二重に表している | §2 の構成へ。画面またぎの UI 状態は `lib/shell/` に集め、名前で中身が分かるファイルに分ける (`now-playing.svelte.ts`, `queue-panel.svelte.ts`, `lyrics-waveform-link.svelte.ts`)。`pages/` は `routes/` に統合                                                                                                                                                                      |
| S2  | **ライブラリの表示状態が URL にある。** ルートルートの search に 11 個のパラメータ (`albumsFilter` ... `tracksDirection`) を置き、`retainSearchParams(true)` で全ルートに持ち回り、zod で検証している。デスクトップアプリにアドレスバーはなく、更新は全て `replace` なので履歴にも意味がない                                                                                                                                                                         | `lib/shell/library-views.svelte.ts` に表示ごとの `{ filter, sortKey, direction }` を runes で持つ。要件「表示ごとにフィルタとスクロールを保つ」はそのまま満たせる。zod と search スキーマは削除                                                                                                                                                                                     |
| S3  | **スクロール復元がルーター内部に依存。** `getScrollRestorationKey` の分岐、`data-scroll-restoration-id`、`useElementScrollRestoration`、`__TSR_key`                                                                                                                                                                                                                                                                                                                  | 明示的な `lib/shell/scroll-memory.ts`: ライブラリ表示はパス単位、詳細ページは履歴エントリ単位 (SvelteKit の `export const snapshot`) で `WorkspaceScroll` のオフセットを保存・復元する                                                                                                                                                                                              |
| S4  | **再生状態の読み取りが React の再レンダー対策で複雑。** zustand ストア + `useShallow` のセレクタフックが 10 個 (`usePlaybackItem`, `usePlaybackTransport` ...)。`playbackController` は `api!` の非 null 断言だらけで、`initialize(api)` まで壊れた状態で存在する                                                                                                                                                                                                    | `lib/playback/playback.svelte.ts` に 1 つのクラス。フィールドは `$state.raw`、`transport` などは `$derived`。Svelte の細粒度リアクティビティで「変化の速さごとのフック」は不要になる。ネイティブ API はブート時に 1 度解決して渡す (`createPlayback(api)`)                                                                                                                          |
| S5  | **設定のミラーが設定項目ごとに別ストア。** `artwork-backdrop` と `calm-motion` がほぼ同じコードで、楽観的に書き換えたあと失敗を `catch(() => undefined)` で握りつぶす (UI とバックエンドが食い違ったまま、原則 12 違反)。部分更新で他の項目に手で `null` を書いている                                                                                                                                                                                                | `lib/settings/settings.svelte.ts` に `Settings` 全体のミラー 1 つと `update(patch)`。失敗したら元に戻し、エラーを表示できる形で返す。localStorage からの旧設定移行 (`LEGACY_BACKDROP_KEY`) は役目を終えたので削除                                                                                                                                                                   |
| S6  | **ネイティブへの入口が 2 つあり、1 つは迂回されている。** 例外を投げる `nativeApi()` と `getNativeApiOrNull()` が混在し、呼び出し側ごとに扱いが違う。`widgets/window-controls` は `native.ts` を通さず `@tauri-apps/api/window` を直接呼んでいる (CONTRIBUTING 違反)                                                                                                                                                                                                 | ウィンドウ操作 (最小化・最大化・閉じる・最大化状態の購読) も `lib/native` のアダプタに入れる。`@tauri-apps/*` を import してよいのは `lib/native` だけ、を lint で強制する。`lib/native` は `native` (利用可能ならアダプタ、なければ null) を 1 度だけ解決して公開。ブリッジがない場合の表示はシェルが 1 箇所で持つ。テスト用の `window.__TAURI_TEST_API__` 注入は維持 (E2E が依存) |
| S7  | **TanStack Table を列定義と `flexRender` のためだけに使っている。** 並べ替えはバックエンド、行モデルは `getCoreRowModel` のみ                                                                                                                                                                                                                                                                                                                                        | 削除。列は型付きの配列 (id, ヘッダ, 幅, ブレークポイント) + セルは snippet で描く                                                                                                                                                                                                                                                                                                   |
| S8  | **共有要素アニメーションが `motion` の `layoutId` に密結合。** `WorkspaceScroll` がレイアウトアニメーションのために `layoutScroll` を知っている、`SharedArtwork` が角丸をインラインにする回避策、`entities/library` がアニメーション ID (`albumArtworkLayoutId`) を公開している                                                                                                                                                                                      | `lib/ui/motion/shared-element.ts` に共有要素の仕組みを 1 つ置き、キーの生成もそこに置く。方式は Phase 0 のスパイクで決める (§6.5)                                                                                                                                                                                                                                                   |
| S9  | **モーショントークンが `motion/react` の `Transition` 型。** トークンの定義がライブラリの型に縛られている                                                                                                                                                                                                                                                                                                                                                            | フレームワーク非依存のトークン (`{ kind: "spring", visualDuration, bounce }` / `{ kind: "tween", duration, ease }`) にし、Svelte の transition、CSS 変数、命令的アニメーションへの変換関数を `lib/ui/motion` に置く                                                                                                                                                                 |
| S10 | **型検査が 5 つの tsconfig に分散し、Vite の `root` が `src/app`。**                                                                                                                                                                                                                                                                                                                                                                                                 | SvelteKit 標準の配置と生成 tsconfig に寄せる (§3)                                                                                                                                                                                                                                                                                                                                   |

直さないもの: Rust 側のモジュール構成、IPC 契約 (tauri-specta による生成)、TanStack Query によるキャッシュとイベント駆動の無効化 (Svelte 版の Query がそのまま使え、問題がない)。

## 5. ライブラリ対応表

| React 版                                             | Svelte 版                                                                           | 備考                                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| react, react-dom                                     | svelte 5 (runes)                                                                    | `experimental.async` は使わない                                                                               |
| @tanstack/react-router, @tanstack/router-plugin, zod | SvelteKit (`$app/navigation`, `$app/state`)                                         | zod は search スキーマ以外で使っていないので削除                                                              |
| @tanstack/react-query                                | @tanstack/svelte-query (runes 版、`createQuery(() => options)`)                     | `queryOptions` / キー / `applyXEvent` はほぼそのまま                                                          |
| zustand                                              | `.svelte.ts` のクラス / モジュールの `$state`                                       | ストアは S4, S5 と `lib/shell` に吸収                                                                         |
| @tanstack/react-virtual                              | @tanstack/svelte-virtual (または virtua)                                            | Phase 0 で Svelte 5 との相性を確認して決める                                                                  |
| @tanstack/react-table                                | なし                                                                                | S7                                                                                                            |
| @base-ui/react + shadcn (base-nova)                  | bits-ui + shadcn-svelte                                                             | `components.json` は shadcn-svelte の形式で作り直す。デザイントークン (`app.css`) は維持                      |
| class-variance-authority, cn                         | tailwind-variants, `cn` (clsx + tailwind-merge)                                     | shadcn-svelte の既定に合わせる                                                                                |
| lucide-react                                         | @lucide/svelte                                                                      |                                                                                                               |
| motion (`motion/react`)                              | `svelte/transition`, `svelte/animate` (`flip`), `svelte/motion` + `motion` (バニラ) | バニラの `motion` はスプリングの計算 (`visualDuration` / `bounce` を保つため) と命令的 `animate()` にだけ使う |
| @vitejs/plugin-react                                 | @sveltejs/kit, @sveltejs/vite-plugin-svelte, @sveltejs/adapter-static, svelte-check |                                                                                                               |
| vitest + jsdom                                       | 同じ + @testing-library/svelte (コンポーネントのテストのみ)                         | vitest の設定に `sveltekit()` と `resolve.conditions: ["browser"]`                                            |
| oxlint (react プラグイン), oxfmt                     | oxlint (`.svelte` の `<script>` を lint)、フォーマッタは §9 で確認                  | `react/*` ルールは削除                                                                                        |

## 6. 移植方針 (領域別)

### 6.1 IPC とネイティブ境界

- `src/shared/ipc/bindings.ts` → `src/lib/native/bindings.ts`。`src-tauri/src/bin/export-bindings.rs` の出力パスとメッセージ、`pnpm bindings` / `bindings:check` を更新する。
- `native.ts` の中身 (エラー変換、イベント名の検査、ダイアログ) はそのまま移す。変更は S6 のみ。
- `tests/fixtures/native-api.ts` の import パスを `$lib/native` に相当するパスへ (tests の tsconfig に alias を追加)。

### 6.2 状態

- **再生 (`lib/playback/playback.svelte.ts`)**: `acceptsRevision`、`pendingNavigation`、シーク・音量の合流 (coalesce) など今の `createPlaybackController` のロジックは維持し、`store.setState` を `$state.raw` への代入に置き換える。単体テスト (`playback-session.test.ts`) は API を合わせて移す。
- **クロック (`lib/playback/clock.ts`)**: フレームワーク非依存の純粋 TS にする。`position` は `motionValue` をやめ、`subscribe(fn)` で毎フレームの値を配る。描画側は attachment (`{@attach bindClock(node, draw)}`) で CSS 変数か `style` を直接書き換え、コンポーネントは再実行しない。`onJump` / `lastJump` は `createSubscriber` で Svelte から読めるようにする。シーク時のグライドはバニラ `motion` の `animate` を使う。
- **設定**: S5。
- **画面またぎの UI 状態 (`lib/shell/`)**: Now Playing (`page.state.nowPlaying` を読む薄いモジュール + `open/close/toggle`)、キューパネル、歌詞⇔波形リンク (ポインタで頻繁に変わるので `$state.raw` の個別フィールド)、ライブラリ表示 (S2)、スクロール記憶 (S3)。
- **イベント購読**: 今の `NativeSession` はルートの `+layout.svelte` の初期化 (1 回だけ) に移す。各ドメインは `applyXEvent(queryClient, event)` をそのまま持つ。

### 6.3 データ取得

- `queries.ts` の `queryOptions` / キーはほぼそのまま。`useX()` フックは `createQuery(() => libraryQueryOptions.x(...))` を返す関数か、コンポーネント内で直接呼ぶ形にする。
- `useDeferredValue` によるフィルタの遅延は、入力値と問い合わせ値を分けた `$derived` + 短いデバウンス、または `placeholderData` (前の結果を保持) で置き換える。入力が引っかからないことを large-library E2E で確認する。
- `useFlattenedInfiniteQuery` は `$derived` でページを平坦化する関数にする。

### 6.4 ルーティング

| 今                                            | SvelteKit                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `routes/index.tsx` (redirect)                 | `routes/+page.ts` で `redirect(307, "/library/albums")`                                                                    |
| `library.index.tsx`                           | `routes/library/+page.ts` で同様                                                                                           |
| `library.albums.$albumArtist.$albumTitle.tsx` | `routes/library/albums/[albumArtist]/[albumTitle]/+page.svelte`。空の名前は今の `toNameSegment` / `fromNameSegment` を使う |
| 履歴 state `nowPlaying`                       | `pushState("", { ...page.state, nowPlaying: true })`、閉じるときは `history.back()` (戻れないときは `replaceState`)        |
| 履歴 state `parentArtist`, `artwork`          | `goto(url, { state: { parentArtist, artwork } })`、型は `app.d.ts` の `App.PageState`                                      |
| `Link`                                        | `<a href>` (SvelteKit のクライアント遷移)。`defaultPreload: "intent"` は再現しない                                         |

注意: shallow routing の `page.state` は通常の遷移で引き継がれない。今の「Now Playing 内のリンクを辿ると閉じる」と同じ挙動になる。

### 6.5 モーション

- `svelte/transition` の `fade` / `fly` をトークンから作る関数 (`transitionFor("mediumMove")`) で包み、reduced motion (`prefersReducedMotion` from `svelte/motion`) と Calm motion (設定) をそこで解決する。モーション予算 (`useMotionBudget`) は `lib/shell/motion-budget.svelte.ts`。
- スプリングは、`motion` の `spring({ visualDuration, bounce })` から得たイージングを Svelte の transition の `easing` に渡す。これで今の感触 (`visualDuration` 指定の臨界減衰スプリング) を保つ。
- キューの並べ替えやソートでのタイルの移動は `animate:flip`。
- **共有要素 (S8)**: ドック ⇔ Now Playing の Sleeve、アルバムタイル ⇔ 詳細ヘッダ。Phase 0 で次の 2 案を試作して決める:
  - A. `crossfade` (`svelte/transition` の send/receive) を拡張し、`transform` で位置とサイズを補間、角丸はクリップで扱う。中断可能で、スクロール中の領域でも位置を計算できる。
  - B. View Transitions API (`document.startViewTransition` + `view-transition-name`、SvelteKit の `onNavigate`)。WebView2 (Chromium) で使える。実装は小さいが、遷移中は入力を受け付けず中断できない。
  - 判断基準: 原則 1 (モーションが操作を遅らせない) と原則 7 (中断・reduced motion で情報を失わない)。既定は A を想定。
- `KineticText`, `RollingNumber` (`FlapText`) など文字の演出は、原則 10 のとおり実テキストの上に重ねるレイヤーとして移す。純粋モデル (`rolling-model.ts`) はそのまま。

### 6.6 UI 部品

- shadcn-svelte を初期化し、今使っている 20 部品 (alert-dialog, alert, button-group, button, checkbox, empty, field, input-group, input, item, label, progress, scroll-area, select, separator, sheet, slider, spinner, switch, table, textarea, tooltip) を `pnpm dlx shadcn-svelte@latest add ...` で追加する。独自に手を入れていた部品は差分を確認して同じ調整を施す。
- Base UI の `render` プロップ / `useRender` + `mergeProps` (`button-group`, `item`) は bits-ui の `child` snippet と `mergeProps` に置き換える。
- React Context は 2 つ (`TrackTableContext`, `MediaGrid` の `TileEventsContext`)。どちらも Svelte の `createContext` (型付き get/set) に置き換える。
- `useLayoutEffect` (`media-grid`, `upcoming-list`, `queue-panel`) は `$effect.pre` か attachment。最新値を ref に写すだけのもの (`media-grid`) は Svelte では不要 (props は常に最新)。
- `menu.tsx` (コンテキストメニュー) は bits-ui の `ContextMenu` / `DropdownMenu`。
- 仮想化 (`MediaGrid`, `TrackTable`, `UpcomingList`) は Phase 0 で選んだライブラリで。`MediaGrid` の矢印キー移動と RovingLight は、今の Context を Svelte の `setContext` / `getContext` (型付きの `createContext`) に置き換える。
- ポインタ操作 (`use-pointer-seek`, キューのドラッグ) はロジック (`waveform-model.ts`, `queue-drag.ts`) をそのまま使い、DOM への結合を attachment にする。

### 6.7 テスト

- 純粋ロジックのテスト (`*.test.ts`) はパスだけ変えて移す。
- React のフックに依存するテスト (`use-now-playing.test.tsx`, `use-lyrics-scroll.test.tsx`, `now-playing-columns.test.tsx`) は、ロジックを純粋関数に切り出してテストするか、@testing-library/svelte で書き直す。
- Playwright の renderer E2E は `webServer` を `vite dev` に変えるだけで流用する。落ちたら、原則としてテストではなく実装側のマークアップを合わせる。
- Tauri E2E (`tests/tauri/startup.e2e.ts`, wdio) はビルド出力先 (`build/`) の変更だけ反映する。

## 7. AI 統合 (Svelte AI tools)

Phase 0 の最初、Svelte のコードを書く前に入れる。以降の移植作業すべてで使うため。

1. `pnpm dlx sv add ai-tools` を実行し、IDE に Claude Code、配布方法に **plugin** を選ぶ。`.claude/settings.json` に Svelte プラグイン (マーケットプレイス `sveltejs/ai-tools`) が有効化される形で書かれるので、コミットする。これで次が入る:
   - MCP サーバー (ローカル、`@sveltejs/mcp`): `list-sections`, `get-documentation`, `svelte-autofixer`, `playground-link`
   - skills: `svelte-code-writer`, `svelte-core-bestpractices`
   - サブエージェント: `svelte-file-editor` (`.svelte` / `.svelte.ts` の作成・編集・レビュー専用)
   - 手動で入れる場合: `/plugin marketplace add sveltejs/ai-tools` → `/plugin install svelte`
2. `sv add ai-tools` が `AGENTS.md` などに指示文を書き出した場合、その内容は `CLAUDE.md` から参照する形にまとめる (CONTRIBUTING.md の Principles: ドキュメントは木構造、重複させない)。`CLAUDE.md` に 1 行足す: 「`.svelte` / `.svelte.ts` の作成・編集は `svelte-file-editor` サブエージェントに任せ、完了前に `svelte-autofixer` で問題がなくなるまで直す」。これは既存の「大きな探索はサブエージェントへ」とも合う。
3. `scripts/svelte-autofix.mjs` を追加する: 変更された `.svelte` / `.svelte.ts` に `npx @sveltejs/mcp svelte-autofixer <path>` を順に実行し、`issues` が 1 件でもあれば失敗する (`suggestions` は表示のみ)。`pnpm svelte:autofix` として CONTRIBUTING の「Verification」に追加。CI には入れない (ネットワークと実行時間のため。必要になったら再検討)。
4. 確認: 新しいセッションで MCP サーバーとサブエージェントが見えること (`/mcp`, `/agents`)。

## 8. フェーズ

`svelte` ブランチで進め、最後に `main` へマージする (CONTRIBUTING: 大きく危険な変更はブランチ)。React と Svelte を同じビルドで共存させる段階は作らない (2 つのフレームワークとルーターの同居は、得るものより複雑さが大きい)。各フェーズの終わりにコミットする。

### Phase 0: 土台とスパイク

- ブランチ作成。§7 の AI 統合。
- 一時ディレクトリにテンプレートを生成し、§3 のとおり SvelteKit の設定・`svelte.config.js`・`app.html`・`+layout.ts` をこのリポジトリに取り込む。React のコードは `src-react/` に退避して参照用に残す (Phase 7 で削除)。
- Tailwind v4 + `app.css` (トークン) + shadcn-svelte の初期化。
- ツール: `svelte-check`、oxlint の設定 (react ルール削除、import 方向ルールを §2 に合わせて書き直す)、フォーマッタ (§9)、vitest 設定。
- スパイク (捨ててよいコード):
  1. 共有要素遷移の A / B (§6.5)
  2. 50,000 件の仮想化グリッドとテーブル (@tanstack/svelte-virtual と virtua の比較)
  3. `pnpm package` 相当のビルドを Tauri で起動し、CSP とフォールバック `index.html`、`nice-artwork` プロトコルが動くこと
- 完了条件: 空のシェルが `pnpm dev` (Tauri) で起動し、`pnpm check` が通る。スパイクの結論をこのファイルの §10 に追記。

### Phase 1: フレームワーク非依存コードの移動

- `lib/native` (bindings の出力先変更を含む)、`lib/utils`、各ドメインの純粋ロジック (`sort`, `unknown-name`, `library-errors`, `playback-clock-model`, `track-energy`, `volume-step`, `playback-errors`, `playback-technical-status`, `light-model`, `waveform-model`, `rolling-model`, `interpolate-position`, `queue-drag`, `album-strip-model`, `loudness`, `distance-opacity` など) とそのテスト。
- モーショントークンの型変更 (S9)。
- 完了条件: `pnpm test:renderer` の純粋テストが全て通る。`pnpm bindings:check` が新パスで通る。

### Phase 2: 状態とデータ層

- `lib/playback` (S4、クロック)、`lib/settings` (S5)、`lib/shell` (S1, S2, S3)、各ドメインのクエリとミューテーション、イベント反映、QueryClient とブートの初期化 (S6)。
- 完了条件: 状態のユニットテストが通る。E2E のモック API で、画面なしでも初期化とイベント反映が動く (簡単な検証用ページで確認し、後で消す)。

### Phase 3: UI の基礎部品

- shadcn-svelte の部品、`Artwork`, `ArtworkLight` / `RovingLight`, `Acrylic`, `WorkspaceScroll` / `WorkspaceContainer` / `WorkspaceStatus`, `MediaGrid`, `ScrollIndex`, `CollectionSortControl`, `Waveform` (bars, seek), `RollingNumber`, `KineticText`, `PlayPauseIcon`, `FactLine`, `Headings`, `BackLink`, `Menu`, 共有要素 (S8)。
- 完了条件: `accessibility.e2e.ts` が対象にする部品でフォーカスとロールが正しい (Phase 4 以降の E2E で最終確認)。

### Phase 4: シェルとライブラリ画面

- `+layout.svelte` (タイトルバー、ナビ、ウィンドウ操作、`ArtworkAccent`、`LyricsPrefetch`、ショートカットは `<svelte:window onkeydown>`)。
- ライブラリ 3 表示 (`LibraryWorkspace`, ツールバー)、アルバム詳細、アーティスト詳細 (`MediaDetailsLayout`, `MediaDetailsHeader`, `AlbumStrip`)、`TrackTable` (S7) とプロパティシート、設定画面。
- 完了条件: `foundation`, `app-shell`, `workspace-layout`, `library-review`, `large-library`, `playable-library`, `error-states`, `interaction` の E2E が通る。

### Phase 5: 再生 UI

- ドック (`PlaybackRegion`, identity, transport, volume, signal path, next-track preview)、キューパネル (ドラッグ、シャッフル時のカスケード)、Now Playing (レイヤー、Sleeve、Identity、TrackFacts、歌詞パネルとスクロール同期、読み取り帯、キュー列、Up next、波形帯、Light)。
- 完了条件: `dock`, `queue`, `queue-scale`, `now-playing-layout`, `keyboard`, `motion` の E2E が通る。

### Phase 6: 仕上げと検証

- `pnpm validate` (check, check:native, test, test:e2e, build) と `pnpm package` が通る。
- 実機確認: 大きなライブラリでのスクロールとフィルタ、再生中の CPU 使用率 (フレームループがクロックを保持しているときだけ回ること)、Windows スケーリング 100–200%、reduced motion と Calm motion、フォーカス表示。
- DESIGN.md の原則に照らした目視確認 (特に原則 5, 6, 7)。

### Phase 7: 片付けとドキュメント

- `src-react/`、React 関連の依存と設定 (`@vitejs/plugin-react`, `@tanstack/router-plugin`, `routeTree.gen.ts`, `history-state.d.ts`, `tsconfig.app/renderer.json`, `.oxlintrc.json` の react プラグイン) を削除。
- ドキュメント更新: `CONTRIBUTING.md` (Router / Query / Zustand の規則、`src/shared/lib/native.ts` のパス、shadcn のコマンド、「3 ファイル超でセグメント分け」規則は §2 の構成に合わせて書き直す)、`DESIGN.md` の「Where the details live」のパス、`README.md`、`CLAUDE.md` (§7)。
- このファイルを削除。`main` にマージ。

## 9. 未確認事項 (Phase 0 で確かめる)

| 項目                                                                   | 確認方法                                                                                                                                | 駄目だった場合                                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| CSP `script-src 'self'` と SvelteKit のインライン起動スクリプト        | `tauri build` した実行ファイルで起動し、コンソールに CSP 違反が出ないか。Tauri はバンドル内のインラインスクリプトにハッシュを付けるはず | `kit.csp` の `mode: "hash"` を使う、または起動スクリプトを外部ファイルにする設定を探す |
| oxfmt が `.svelte` を整形できるか                                      | `pnpm oxfmt --check` を `.svelte` に対して実行                                                                                          | `.svelte` だけ prettier + prettier-plugin-svelte                                       |
| oxlint の `.svelte` 対応範囲 (`<script>` 部分、type-aware)             | 意図的な違反を置いて `pnpm lint`                                                                                                        | 型を使うルールは `svelte-check` に任せる。import 方向の規則が効くことだけは必須        |
| @tanstack/svelte-virtual の Svelte 5 対応                              | スパイク 2                                                                                                                              | virtua (Svelte 対応)                                                                   |
| `sv add ai-tools` が既存の `CLAUDE.md` / `.claude/` をどう扱うか       | 実行後の `git diff`                                                                                                                     | 手動で `.claude/settings.json` に plugin を追記                                        |
| shadcn-svelte の Tailwind v4 テーマと今の `app.css` のトークン名の違い | 初期化後の差分                                                                                                                          | トークン名を shadcn-svelte に合わせ、`app.css` 側をリネーム                            |

## 10. 決定事項 (実装中に蒸し返さない)

- **D1** SvelteKit (adapter-static, SPA)。SSR・サーバー機能は使わない。
- **D2** FSD をやめ、§2 の構成と依存方向にする。
- **D3** ライブラリの表示状態は URL ではなくメモリ (S2)。
- **D4** TanStack Query は継続。zustand, TanStack Router, TanStack Table, zod は廃止。
- **D5** `motion` はバニラ版をスプリング計算と命令的アニメーションにだけ使う。コンポーネントの出入りは Svelte の transition。
- **D6** E2E を仕様とし、テストよりマークアップを合わせる。
- **D7** Svelte のコードを書く前に AI tools を入れ、`svelte-autofixer` を通したものだけをコミットする。
- **D8** フォーマッタ: `.ts` などは oxfmt、`.svelte` だけ prettier + prettier-plugin-svelte (oxfmt は `.svelte` を対象にしない)。oxlint は `.svelte` の `<script>` を lint でき、import 方向と `@tauri-apps/**` の制限も効く (パターンは `*` ではなく `**`)。
- **D9** `motion` はバニラ版のみ。コミュニティ製の Svelte ラッパー (`@humanspeak/svelte-motion` など) は使わない。共有要素が方式 A で作れなかったときだけ再検討する。
- **D10** `lib/native` は `native` (解決済みアダプタまたは null) と `requireNative()` と `nativeWindow` を公開する。`artwork-url` は utils ではなく `lib/native` に置く。
- **D11** 残りの作業 (Phase 3 以降) は層ごとではなく、画面 / E2E 単位の縦切りチケットにする。必要な基礎部品は、それを使うチケットの中で作る。チケットの完了条件は「対象の E2E ファイル + `pnpm check` + `svelte-autofixer` の指摘ゼロ」。`pnpm validate` 全体は Phase 6 でだけ回す。
- **D12** E2E が React 固有の DOM 構造に依存していた場合に限り、テストを直してよい。役割・ラベル・`data-slot` / `data-region` / `data-tone` の契約は変えない。直したらチケットに理由を 1 行書く。
- **D13** 移行中、`main` のレンダラー (React) は凍結する。Rust 側の変更は可。
- **D14** スパイクが失敗したら、§9 の「駄目だった場合」の代替案を再協議せずに採用し、理由だけを ADR に書く。
- **D15** 仮想化: まず `@tanstack/svelte-virtual` を 50,000 件のグリッドとテーブルで時間を区切って試す。駄目ならテーブルと一覧だけ `virtua`。グリッドの代替は、そのとき決める。
- **D16** 共有要素 (S8) は方式 A を試作する。方式 B は A が作れなかったときの最後の手段 ([ADR 0004](./adr/0004-shared-element-transition-by-crossfade.md))。
- **D17** CSP の実機確認 (`tauri build` した実行ファイルの起動) は最初のチケットにする。
- (検索で確認した範囲) CSP: Tauri はバンドル内のローカルスクリプトをハッシュ化して CSP に追記すると文書化されている。実機での確認は未了。仮想化: `@tanstack/svelte-virtual` は peerDependencies が Svelte 5 に対応済みだが、Svelte 5 で空表示になる報告 (#866) があり現状は未確認。`virtua` の Svelte 版は `VList` のみ (グリッドなし)。共有要素の方式、仮想化ライブラリ、CSP の実機確認は Phase 0 のスパイクとして未了。
- **チケット 01 の結果 (CSP スパイク、実機確認済み)** `tauri build --no-bundle` した実行ファイルで確認。CSP は変更不要 (`script-src 'self'` のまま、`kit.csp` も不要): コンソールに CSP 違反なし、シェルは起動して IPC 経由の状態も表示 (`connection: ready`)。存在しないルート `/albums` の直接読み込みと再読み込みはフォールバック `index.html` で SvelteKit の 404 ページまで到達 (Tauri のログで確認)。`nice-artwork` の実アートワーク (1200x1200 JPEG) は読み込めた。
