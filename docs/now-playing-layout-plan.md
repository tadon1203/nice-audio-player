# Now Playing レイアウト改善 実装計画

対象: `src/renderer/widgets/now-playing/` (主に `ui/now-playing-content.tsx`, `ui/lyrics-panel.tsx`, `model/use-lyrics-scroll.ts`)

## 背景 / 現状の問題

スクリーンショット (2000×1088, 歌詞あり / なし) で確認した問題。

1. **歌詞ありで画面の約 2/3 が空白。** 左列は `clamp(18rem, 34cqw, 28rem)` で頭打ち、歌詞は `max-w-[32ch]` で頭打ち。広いウィンドウほど右側が余る。
2. **歌詞列が狭く、短い行まで折り返す。** 32ch + `text-2xl` + 4rem の Gutter で実質 270px 程度。
3. **歌詞の有無で構図が変わる。** 歌詞あり = 左上に小さい Sleeve、なし = 中央に Sleeve + 横に情報。曲送りで Sleeve が跳ぶ (DESIGN.md 原則 5, 6 に反する)。
4. **歌詞なしで Sleeve が小さく、上下左右が空く。** `SLEEVE_SIZE_ALONE` が `32rem` / `40cqw` で頭打ち。
5. **Up next の位置が状態で違う。** 歌詞あり = 左列下 (歌詞のフェードと視覚的に重なる)、なし = 右下 absolute。
6. **現在行が弱い。** 全行 `text-2xl`、距離による scale 1% 刻みのみ。現在行も塗り (LineFill) が始まるまで未来行と同じ明るさ。
7. **Gutter のタイムスタンプが常時表示でノイズ。** 全行に `0:18` などが並ぶ。
8. **スクロールバーが見える。** 読み物のような見た目になる。
9. **空行 (間奏) が `1:16` だけの壊れた行に見える。**

## 方針

- どの状態でも **同じ 2 カラムの骨格**。左 = Sleeve + Identity + Up next、右 = 「その曲のいま」(歌詞 or アルバム曲目)。
- Sleeve は **高さ基準で大きく**、位置は歌詞の有無で変わらない。
- 歌詞は **大きく、広く、現在行が縦 40% に定位**。時間の 3 輝度で表す (サイズ・ウェイトは変えない)。
- 歌詞がないときの右列は **アルバム曲目** (実データ・行動につながる・歌詞と同じ「時間のリスト」構造)。

```
┌─────────────────────────────────────────────────────────────────┐
│  p-8                                                             │
│  ┌────────────────────┐     past line            (faint)         │
│  │                    │     past line                            │
│  │      Sleeve        │     CURRENT LINE         (bright) ← 40%  │
│  │   (height-fit)     │     future line          (muted)         │
│  │                    │     future line                          │
│  └────────────────────┘     future line                          │
│  Really Love                                                     │
│  D'Angelo and The Vanguard                                       │
│  Black Messiah                                                   │
│  2014  Track 5 of 12  FLAC 24/96                                 │
│                                                                  │
│  Up next ▢ Back to the Future (Part I)                           │
├─────────────────────────────────────────────────────────────────┤
│  waveform strip                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Step 1 — 骨格の統一 (`now-playing-content.tsx`)

- `showLyrics` による 2 系統の JSX を廃止し、1 つのグリッドにする。
  - `md:grid-cols-[auto_minmax(0,1fr)]`、列間 `gap-12` 前後、外周 `p-8`。
  - 左列: `flex-col justify-between` (上に Identity、下に UpNext)。
  - 右列: `RightColumn` — `showLyrics` なら `LyricsColumn`、そうでなければ `AlbumTracksColumn` (Step 4)。切替は既存の `transitions.content` でクロスフェードのみ。
- Sleeve サイズを 1 本化:
  ```ts
  // 左列の Identity 情報ブロック (~11rem) と Up next (~3rem) と padding を引いた高さ、
  // かつ幅の 42% を超えない。
  const SLEEVE_SIZE = "max(10rem, min(calc(100cqh - 18rem), 42cqw, 40rem))";
  ```
  `SLEEVE_SIZE_WITH_LYRICS` / `SLEEVE_SIZE_ALONE` と `Identity` の `alone` 分岐を削除。
  - 目安: 2000×1088 (論理 ~1333×725 @150%) で約 30rem、フル HD 100% で 40rem 上限。
- Identity は常に縦積み (Sleeve の下に情報)。タイトルは `text-3xl md:text-4xl line-clamp-2`。
- `LyricsHint` は Identity から外し、右列 (`AlbumTracksColumn`) のヘッダへ移す (Step 4)。
- UpNext は常に左列下。`absolute right-6 bottom-4` の分岐を削除。高さ 640px 未満で隠す既存ルールは維持。
- `< md` (1 カラム) は現行どおり: 小さい Sleeve (size-16) + 情報を横並び、下に右列の中身。

## Step 2 — 歌詞の見た目 (`lyrics-panel.tsx`)

- 列幅: `max-w-[32ch]` → `max-w-[44ch]`、`min-w` は据え置き。フォントを `text-2xl` → `text-[clamp(1.5rem,2.4cqw,2.25rem)]`、`leading-snug`、行間は `py-2`。
  - 44ch はおおむね 1 行に収まる長さ。長い行だけ折り返す。
- 3 輝度を明確に:
  - past: `--faint-foreground`
  - current: `--foreground` をベースに (現在は muted のまま LineFill 待ち)、その上に LineFill (artwork 色)
  - future: `--muted-foreground`
  - 距離による `scale` は削除 (サイズで状態を表さない原則 4)。代わりに現在行から離れるほど opacity をわずかに下げてもよい (輝度なのでOK)。
- スクロールバー非表示: スクロール容器に `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`。キーボードスクロールとフォーカスリングは維持。
- フェードマスクを `black_12%,black_75%` → 現在行位置に合わせ `black_18%,black_70%` 程度に調整。

## Step 3 — Gutter と間奏

- Gutter (タイムスタンプ): 既定で `opacity-0`、行ホバー / 行内フォーカス / スクロール `free` モード時に表示。
  - 実装: 行を `group`、Gutter に `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`、パネルに `data-mode={scroll.mode}` を付け `free` のとき全表示。
  - 幅は確保したまま (レイアウトが動かない)。Tab 移動で到達でき、ボタンの役割 (シーク) は不変。
  - 文字は 14px 以上 (`text-sm` を維持)。
- 間奏 (空テキストの行): 空白の代わりに **細い進捗バー** を描く。
  - `line.text.trim() === ""` のとき `IntervalLine` を描画: 幅 `6rem`、高さ 2px、`lineSpan` の区間で `position` から進捗を計算して塗る (artwork 色 = いま)。現在行でなければ faint のトラックのみ。
  - 「装飾はデータ」: 実際の間奏の進み具合を示す。Calm motion でも位置表示なので動いてよいが、他の自走モーションは無し。
  - `aria-label="Instrumental, 0:51"` (長さ) を付ける。

## Step 4 — 歌詞なしの右列: アルバム曲目 (`ui/album-tracks-column.tsx` 新規)

- `useAlbumTracks(item.albumKey)` (entities/library) を使う。`albumKey === null` なら Up next のキュー先頭数件にフォールバック、それもなければヘッダのみ。
- 見た目は歌詞と同じリズム: 行 = Gutter (トラック番号, tabular) + タイトル + 右端に長さ。
  - 再生中の曲: `--foreground` + 番号位置に小さい再生中インジケータ (artwork 色)。前の曲 faint、後の曲 muted (3 輝度)。
  - 行クリックで再生: アルバム詳細ページのトラック行と同じ再生アクションを再利用 (実装時にアルバムページの行コンポーネントを確認して合わせる)。
- ヘッダ (1 行, `text-sm muted`): 既存 `LyricsHint` の内容をここへ。`No lyrics for this track` / `Couldn't read the lyrics file` + `.lrc` パスのコピー。
- 初期スクロールで再生中の曲を 40% 位置へ (長いアルバム用)。自動追従はしない (曲が変わったときのみ)。
- ページングは既存の infinite query。Now Playing では 1 アルバム分なので `hasMore` のときだけ末尾で `loadMore`。

## Step 5 — 追従位置 (`use-lyrics-scroll.ts`)

- `FOLLOW_POSITION_FRACTION` を `1/3` → `0.4`。行の上端ではなく **行の中心** を合わせる (`line.offsetTop + line.offsetHeight / 2`)。折り返した行でも中心が安定する。
- 先頭付近では `max(0, …)` のままでよい (先頭行が上に来るのは自然)。上部に余白 `padding-top: 40cqh` を入れて最初の行から 40% 位置に置く案もあるが、今回は入れない (開いた瞬間に上が空くため)。

## Step 6 — 狭い / 低いウィンドウ

原則 6 の順: 並べ替え → 二次情報を落とす → 最後に文字を縮める。

| 条件         | 振る舞い                                                                |
| ------------ | ----------------------------------------------------------------------- |
| `< md`       | 1 カラム。上に小 Sleeve + 情報、下に右列 (現行の挙動を維持)             |
| 高さ < 640px | Up next 非表示 (既存)、Facts 行は維持                                   |
| 高さ < 520px | 左列の Sleeve が `10rem` 下限に達したら album 行 (Black Messiah) を隠す |
| 歌詞フォント | `clamp` の下限 1.5rem を最後の手段として効かせる                        |

## Step 7 — ドキュメントとテスト

- `docs/requirements.md` の Now Playing の記述 (歌詞なしで中央配置、など) があれば更新。
- 既存テスト: `use-lyrics-sync.test.ts` は影響なし。`use-lyrics-scroll` の追従位置を変えるので、テストがあれば期待値を更新。
- 新規テスト:
  - `AlbumTracksColumn`: 再生中の曲が current として `aria-current` を持つ、`albumKey === null` でフォールバックする。
  - 間奏行: 空テキスト行が `IntervalLine` になり、`aria-label` に長さを含む。
- 目視確認 (run スキル): 2000×1088 / 1280×720 / 900×600 / 歌詞あり・なし・plain・sourceFailed、曲送りで Sleeve が動かないこと、Reduced motion。

## 実装順

1. Step 1 (骨格) + Step 5 (追従位置) — 空白と構図の飛びがこれで解消
2. Step 2, 3 (歌詞の見た目)
3. Step 4 (アルバム曲目)
4. Step 6, 7

## やらないこと

- 背景の Light / 波形帯のデザイン変更
- 歌詞のオンライン取得 (要件外)
- 歌詞の翻訳・ふりがな表示
