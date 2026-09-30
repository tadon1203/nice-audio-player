# Now Playing 改善 実装計画 (第 2 版)

対象: `src/renderer/widgets/now-playing/`、`src/renderer/shared/ui/kinetic-text.tsx`、`src/renderer/features/now-playing-transition/ui/playback-waveform-band.tsx`

前提: 作業ツリーにある第 1 版の実装 (1 つの骨格、アルバム曲目列、間奏バー、追従位置 40%) の上に行う。第 1 版は git 履歴 (`586dfa7` 時点のこのファイル) を参照。

この計画で決めていないことは DESIGN.md の原則で決め、コードのコメントに残す。迷ったら「本文の決定」>「DESIGN.md」の順に従う。

---

## 0. 目標

1. **余白は残し、無駄な空白は残さない。** 余白 = 何かに属していて上限がある (外周、Sleeve と右列の間の 1 本、現在行の上下)。空白 = 固定サイズの中身が可変の画面で余った領域。判定は「消すと何かが窮屈になるか」。
2. **「いま」は常に同じ高さ (上から 40%) にある。** 歌詞でもキューでも、曲頭でも曲末でも。
3. **右列は「この再生の時間」を示す。** 歌詞があれば歌詞、なければキュー (実際に流れる順)。
4. **動きはすべて事実どおり。** タイトルのアニメーションがレイアウトを変えない。

## 1. 確認済みの問題と原因

スクリーンショット (1100×680 / 1360×900 / 1920×1080) とコードで確認済み。

| #   | 問題                                                                                                    | 原因                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | 1360×900 で Up next が波形に重なる。2 行タイトルでは Facts も重なる                                     | `SLEEVE_SIZE` の `100cqh` がレイヤー全体 (波形帯込み) を基準にしている (`now-playing-content.tsx:32`)                                                                                                                                                                                                 |
| P2  | 曲切替中、タイトルの単語が消え (例: `Motion Picture` だけ表示)、約 0.74 秒後に急に現れる。位置も跳ぶ    | `KineticText` のオーバーレイが `absolute inset-0` でインライン span に重なるため、幅が実テキスト幅ぴったり (1 行) または最終行の幅 (複数行) になる。文字ごとの span は字詰めが変わり折り返す。溢れた行は `line-clamp-2` で見えない。オーバーレイと実テキストは縦に約 3px ずれており、外した瞬間に跳ぶ |
| P3  | 曲切替でタイトルの行数 (1⇄2) が変わると、アーティスト以下が約 40px 上下する                             | タイトルの高さが内容で決まる                                                                                                                                                                                                                                                                          |
| P4  | 右側の空白: 1360 幅で約 1/3、1920 幅で約半分。歌詞なしで短いアルバムだと下が空く                        | 歌詞が `max-w-[44ch]` で止まり、文字サイズは画面幅 (`2.4cqw`) 基準。一覧は上詰め                                                                                                                                                                                                                      |
| P5  | 歌詞のハイライトがほぼ見えない                                                                          | 現在行 (白または明るくしたアートワーク色) と次行 (`muted-foreground`) の差が小さく、距離による減光は 1 行 8%                                                                                                                                                                                          |
| P6  | 一覧の再生中の行が次の行より暗く見える                                                                  | 先頭行が一覧上端のフェードマスク (0–8%) の中にある                                                                                                                                                                                                                                                    |
| P7  | アルバム一覧をクリックするとキューが Undo なしで置き換わる。シャッフル中は明るさの過去/未来が事実と違う | 右列がキューではなくアルバムを出している                                                                                                                                                                                                                                                              |
| P8  | 曲頭で現在行が上から下がってきてからスクロールが始まる。イントロ中は何も起きない                        | 上に余白がなく `max(0, …)` で上端に張り付く。`currentIndex = -1` の間は何も描かない                                                                                                                                                                                                                   |
| P9  | 曲の途中で開くと、先頭から歌詞がスクロールしていくのが見える。大きなシークでも何十行も流れる            | マウント時もシーク時も同じアニメーションでスクロールする                                                                                                                                                                                                                                              |
| P10 | 歌詞の上にポインタを置いたままだと自動追従に戻らない                                                    | 戻る条件が「4 秒操作なし かつ ポインタが外」                                                                                                                                                                                                                                                          |
| P11 | Jump to current line が常に右下にあり、方向を示さない。現在行が見えていても出る                         | 表示条件が `mode === "free"` のみ                                                                                                                                                                                                                                                                     |
| P12 | 波形でシークしても自動追従に戻らない                                                                    | `resetToFollow` を呼ぶのはガターのシークだけ                                                                                                                                                                                                                                                          |
| P13 | Up next が高さ 640px 以下と `md` 未満で消え、次の曲が分からない                                         | `[@container(max-height:640px)]:hidden`                                                                                                                                                                                                                                                               |
| P14 | 「No lyrics for this track」が一覧の見出しに見える                                                      | `LyricsHint` を `AlbumTracksColumn` の先頭に置いている                                                                                                                                                                                                                                                |
| P15 | 歌詞なしで初めて開いた曲は、右列が一瞬空になる                                                          | `showLyrics` の初期値が `true`                                                                                                                                                                                                                                                                        |

## 2. 決定事項 (議論済み。実装中に蒸し返さない)

- **D1** 右列 (歌詞なし) は**アルバム曲目ではなくキュー**を出す。アルバムから再生していればキュー = アルバムなので見た目は同じ。
- **D2** Up next は**波形帯の右端**に置く。左列には置かない。
- **D3** 右列にキューが出ているとき (歌詞なし、または幅広のキュー列あり) は、波形帯の Up next を出さない (同じものを 2 か所に出さない)。
- **D4** 歌詞ありでレイヤー幅が 1440px 以上のときだけ、右端に**キュー列** (幅 20rem) を足す。狭くなったら最初に消す。
- **D5** 歌詞の文字サイズは**列の幅**から決める。列を狭めて空白を作らない。
- **D6** ハイライトは H1 (明るさの差を広げる) + H2 (固定の読み取り帯) + H3 (ガターの ▶)。行を左から塗る案 (H4) は**やらない** (動きの予算の原則 7 に反する)。
- **D7** タイトルアニメーションは**文字ごとのオーバーレイを廃止**し、実テキストのマスクワイプ + 8px スライドにする。
- **D8** タイトル欄は**常に 2 行分の高さ**を確保する。
- **D9** 歌詞の行テキストをクリックしてもシークしない (選択と衝突するため)。シークはガターのみ。
- **D10** 曲の終わりに次の曲名を歌詞の続きとして出す案は**やらない** (D2 と重複)。
- **D11** 歌詞の状態 (なし / 読めない / 非同期 / 埋め込みに切替) は**Facts 行**に出す。右列には置かない。

## 3. 完成形

```
幅 < 1440 (歌詞あり)
┌──────────────────────────────────────────────────────────┐
│ ┌──────────────┐   past line                (最も暗い)   │
│ │              │   past line                              │
│ │   Sleeve     │ ▶ CURRENT LINE ░░読み取り帯░░ ← 40%      │
│ │              │   future line              (中間)       │
│ └──────────────┘   future line                            │
│ Title (常に 2 行分)                                         │
│ Artist / Album                                             │
│ 2019  Track 1 of 12  FLAC 24/96  No lyrics …              │
├──────────────────────────────────────────────────────────┤
│ 0:12 ▁▃▅▇▅▃▁▃▅▇▅▃▁▃▅▇▅▃▁▃▅▇▅▃  −1:48 │ ▢ Next title      │
│                                        │   Next artist     │
└──────────────────────────────────────────────────────────┘

幅 ≥ 1440 (歌詞あり)                          ← Up next は波形帯から消える
│ Sleeve+情報 │ 歌詞 (文字は上限まで) │ Up next      │
│             │                       │ ▢ Track 002  │
│             │                       │ ▢ Track 003  │

歌詞なし (全幅)                                ← Up next は波形帯から消える
│ Sleeve+情報 │   Track 009   (過去: 最も暗い)       │
│             │ ▶ Track 010   (現在)  ← 40%          │
│             │ 1 Track 011   (未来: 中間)           │
│             │ 2 Track 012                          │
```

## Step 1 — 修正のみ (P1, P3, P6, P15)

`now-playing-content.tsx`

1. **サイズ基準の分離 (P1)**: `[container-type:size]` を外側のレイヤー div からグリッド側のラッパーに移す。ラッパーは波形帯を含まない領域 (`flex-1 min-h-0`) で、`padding` は持たない。`container-name: np` を付ける (Tailwind: `@container/np` 相当。サイズクエリなので `[container-type:size]` と `[container-name:np]` を併記)。
   - `waveformHeightFor` 用の `useLayerHeight` は外側のまま。
2. **タイトル 2 行確保 (P3, D8)**: タイトルの `<p>` に `min-h-[2lh]` を付ける。
3. **Sleeve サイズ**:
   ```ts
   // 高さ: グリッド領域から外周 (4rem)、Sleeve と情報の間 (1rem)、情報ブロック (~10rem) を引く。
   const SLEEVE_SIZE = "max(10rem, min(calc(100cqh - 15rem), 38cqw, 40rem))";
   ```
   `15rem` は目安の値。e2e (Step 9) の「情報ブロックの下端 ≤ グリッド領域の下端」が 3 サイズで通る最小値に調整する。
4. **初期値 (P15)**: `showLyrics` の初期値を `true` ではなく、`resolution` がまだ無ければ「前の曲の値」、初回は `false` (キュー) にする。キャッシュ済み (事前取得済み) の曲なら初回から正しい値になる。
5. P6 は Step 4 の上下余白で解消するので、ここでは何もしない。

**完了条件**: 3 サイズ × 1 行/2 行タイトルで、情報ブロックが波形帯に重ならない。1 行と 2 行のタイトルを交互に送っても、アーティスト行の y が変わらない。

## Step 2 — タイトルアニメーション (P2, D7)

`src/renderer/shared/ui/kinetic-text.tsx` を書き直す。API (`text`, `direction`, `className`) は変えない。利用箇所は `now-playing-content.tsx` のみ。

- 描画は `<m.span className="block">{text}</m.span>` の **1 つだけ**。`aria-hidden` のオーバーレイ、`graphemes`、`playing` の state、`setTimeout` は削除する。
- アニメーション:
  - `x`: `8 * direction` px → `0` (トークン `smallMove`)。
  - マスク: `style.maskImage = linear-gradient(to right, black calc(var(--reveal) - 20%), transparent var(--reveal))`。`--reveal` を `0%` → `120%` に animate する。時間は約 320ms。`tokens.ts` にある tween のトークンを使い、なければ `mediumMove` を使う。どちらの方向でも左から右 (読む順) に現れ、スライドの向きだけが `direction` で変わる。
  - 完了後 (`onAnimationComplete`) に `maskImage` を `none` に戻す。
- Reduced motion: `useMotionTransition` の既定どおり、opacity のクロスフェードだけにする (`x` とマスクは使わない)。
- 呼び出し側: `key={item.queueItemId}` のまま。初回表示ではアニメーションしない条件 (`changedSinceOpen`) もそのまま。
- コメントを新しい仕組みに書き換える (「実テキストだけを描くので、折り返しや字詰めは最初から最後まで同じ」)。

**完了条件**: `Motion Picture Soundtrack` と 2 行になる長いタイトルで、アニメーション中と後で単語の位置が 1px も変わらない (e2e で 0/150/800ms 時点の各単語の `getClientRects` を比較)。DOM にタイトルのテキストが 1 回だけ出る (unit)。

## Step 3 — レイアウト (P4, D4, D5)

`now-playing-content.tsx`

- グリッド: `md:grid-cols-[var(--np-sleeve)_minmax(0,1fr)]`、`gap-12`、外周 `p-8`。キュー列があるときは `md:grid-cols-[var(--np-sleeve)_minmax(0,1fr)_20rem]`。キュー列の有無はクラスの切替ではなく、コンテナクエリ `@min-[90rem]/np:` で決める (JS で幅を測らない)。
- 左列: `Identity` だけ。`UpNext` と `justify-between` は削除する。
- 右列 (歌詞): ラッパーに `[container-type:inline-size] [container-name:npmain]` を付ける。
  - 歌詞の文字: `text-[clamp(1.5rem,5.5cqi,3rem)] leading-snug text-pretty`。`cqi` は右列の幅を基準にする。`max-w-[44ch]` は削除する。
  - 狙いは 1 行 30〜35 文字。5.5cqi は目安。1360×900 で「This is lyric line number 12 of the song」が 1〜2 行に収まり、1 語だけ次の行に落ちないことを確認して調整する。
- 右列 (キュー): Step 5 の `QueueColumn` をそのまま入れる。
- キュー列 (歌詞あり、幅 ≥ 90rem のときだけ): `QueueColumn variant="rail"` (Step 5)。90rem 未満では `hidden`。
- `< md` (1 カラム): 今の積み方のまま。キュー列は出さない。

**完了条件**: 1360×900 で歌詞の右に 1/4 以上の空白がない。1920×1080 (歌詞あり) でキュー列が出る。1100×680 では出ない。

## Step 4 — 歌詞のスクロールと挙動 (P8–P12)

`model/use-lyrics-scroll.ts`、`ui/lyrics-panel.tsx`

### 4-1 上下余白 (P6, P8)

- `useLyricsScroll` で `ResizeObserver` を使ってスクロール容器の `clientHeight` を測り、CSS 変数 `--anchor-top: 0.4 * h px`、`--anchor-bottom: 0.6 * h px` を容器に設定する。
- 行リストの前後にスペーサー (`height: var(--anchor-top)` / `var(--anchor-bottom)`) を置く。これで 1 行目も最終行も 40% の位置に来る。目標位置の計算 (`line.offsetTop + line.offsetHeight / 2 - h * 0.4`) はそのまま使える。
- キュー列 (`QueueColumn`) の `TrackList` も同じ仕組みにする。共通フックを `shared` に置かず、`widgets/now-playing/model/use-anchor-padding.ts` として 2 か所から使う。

### 4-2 イントロの間奏バー (P8)

- `model/use-lyrics-sync.ts` に純関数 `withIntro(lines)` を追加する。`lines[0].startMs >= 3000` のとき、先頭に `{ startMs: 0, text: "" }` を足した配列を返す。そうでなければ元の配列を返す。
- `LyricsPanel` は `timedLines` にこれを通してから、`useLyricsSync`、描画、波形連携のすべてに使う。空行は既存の `IntervalLine` になるので、描画側の変更は不要。
- テスト: `use-lyrics-sync.test.ts` に `withIntro` の境界 (2999 / 3000ms) を追加する。

### 4-3 スクロールの動き (P9, P12)

`useLyricsScroll(currentIndex)` の追従処理を次の規則にする。

| 状況                                                  | 動作                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| マウント時 (開いたとき、曲が変わったとき)             | 即座に `scrollTop` を設定する (アニメーションしない)                                                                                   |
| `currentIndex` が前回 +1 (普通に進んだ)               | 今どおり `mediumMove` でアニメーション                                                                                                 |
| それ以外の変化 (シーク。波形、キー、ガターのどれでも) | `mode` を `follow` に戻す。移動が 3 行以内ならアニメーション、それより大きければ即座に設定し、リストを `fast` のトークンで opacity 0→1 |
| Reduced motion                                        | 常に即座に設定                                                                                                                         |

- 前回の index は `useRef` で持つ。`-1 → 0` は「+1」として扱う。
- ガターの `onSeeked={scroll.resetToFollow}` は上の規則で不要になるので削除する。

### 4-4 手動スクロールと追従への復帰 (P10)

- `free` になるきっかけは今のまま (wheel / touch / ガター以外での pointerdown / スクロールキー)。
- 復帰条件を「`currentIndex` が +1 進んだ時点で、最後の操作から 3 秒以上経っている」に変える。`setInterval`、`RETURN_TO_FOLLOW_MS`、`pointerOver` は削除する。行が変わる瞬間に戻るので、スクロールの動きが事実 (行の変化) と一致する。
- `free` の間はガターの時刻を全行に表示する (既存の `group-data-[mode=free]`)。

### 4-5 Jump to current line (P11)

- 表示条件: `mode === "free"` かつ現在行がスクロール容器の表示範囲に**完全には入っていない**。`IntersectionObserver` (root = 容器、対象 = 現在行、threshold 1) で判定し、方向は現在行の `boundingClientRect.top` と root の上端を比べて決める。
- 位置: 現在行がある側の端。上なら `top-2`、下なら `bottom-2`。水平位置は歌詞テキストの左端 (ガター幅分右) にそろえる。
- 見た目: 既存の `Button variant="secondary" size="sm"` に、`ArrowUp` または `ArrowDown` のアイコンを先頭に付ける。文言は `Jump to current line` のまま。
- Esc: 容器にフォーカスがあり、`mode === "free"` のときだけ `jumpToCurrent` を呼び、`stopPropagation` する。それ以外では Esc を処理しない。

### 4-6 マスク

- 歌詞の容器: `mask-[linear-gradient(to_bottom,transparent,black_15%,black_80%,transparent)]` (40% を中心にほぼ対称)。
- キューの容器: 同じ値に統一する。

### 4-7 非同期歌詞 (plain)

- 追従しない (今のまま)。文字サイズは 4-1 と Step 3 の規則に合わせる。
- `PanelHeader` の `Unsynced` と notice は Facts 行 (Step 6) に移し、`PanelHeader` を削除する。

## Step 5 — 右列のキュー (P7, P13, P14, D1, D3)

`ui/album-tracks-column.tsx` を `ui/queue-column.tsx` に置き換える。`useAlbumTracks` と `startPlayback` の使用はやめる。

- データ: `usePlaybackQueue()` の `history` / `current` / `upcoming` / `upcomingCount`。
- 行の並び: `history` (古い順) → `current` → `upcoming`。
- ガター (`w-8`、右寄せ、tabular):
  - 過去: 空
  - 現在: アートワーク色の `Play` アイコン (今と同じ)
  - 未来: 1, 2, 3 … (あと何曲目か)
- 行の中身: 1 行目に曲名、2 行目に `text-sm` でアーティストと長さ (長さは右寄せ)。行全体に 3 つの明るさを付ける (過去 `faint`、現在 `foreground`、未来 `muted`)。距離による減光は Step 7 と同じ表を使う。
- 文字サイズ (`variant="full"`): `text-[clamp(1.125rem,3.2cqi,1.75rem)]`。
- クリック: 未来の行のガターボタンと行全体で `playQueueItem(id)` (キュー内の移動なので置き換えにならない)。過去と現在の行は操作なし (`disabled`)。
- `upcomingCount > upcoming.length` のとき、末尾に `text-sm muted` で「`N more in the queue`」のボタンを置き、クリックでキューパネルを開く (ドックのキューボタンと同じ開く操作を `widgets/queue-panel` から探して再利用する)。
- 上下余白と 40% 追従は Step 4-1 と同じ。追従するのは曲が変わったときだけ。
- `variant="rail"` (歌詞あり、幅広のキュー列):
  - `upcoming` だけを出す (過去と現在は出さない)。
  - 見出しとして `text-sm muted` で「Up next」を 1 行出す。
  - 行: `size-10 rounded-sm` のアートワーク + 曲名 `text-base` + アーティスト `text-sm`。
  - 40% 追従はせず、上から並べる。高さを超えた分はスクロール。
- キューが空 (`current` だけ) の場合: 現在の行だけを出し、その下に `text-sm muted` で「Nothing else in the queue」を出す。
- テスト: 既存の `now-playing-columns.test.tsx` の `TrackList` のテストを `QueueColumn` の行の仕様 (現在の行が 1 つだけ `aria-current`、未来の行のクリックで `playQueueItem`、過去の行は disabled) に書き換える。

## Step 6 — 波形帯の Up next と Facts 行 (D2, D3, D11)

### 6-1 Up next

- `PlaybackWaveformBand` に `trailing?: React.ReactNode` を追加し、`timeLayout="inline"` の残り時間の右に置く。
- `UpNext` (`now-playing-content.tsx`):
  - 固定幅 `w-64` のスロット。中身は `size-8 rounded-sm` のアートワーク + 2 行 (曲名 `text-sm foreground`、アーティスト `text-sm muted`)。どちらも `truncate`。
  - 全体をボタンにし、クリックでキューパネルを開く (Step 5 と同じ操作)。
  - 次の曲がないとき: スロットの幅は保ったまま「`End of queue`」(`text-sm muted`) を出す。repeat が `all` のときは先頭の曲が `upcoming[0]` に入るので、特別な扱いはしない。
- 出す条件 (D3): 歌詞あり、かつキュー列が出ていない (`@min-[90rem]/np:hidden`)。歌詞なしのときは出さない。
  - スロットの有無で波形の幅が変わるのは、「歌詞あり/なし」と「幅」が変わったときだけ。曲の途中では変わらない。
- 高さや `md` による非表示 (P13) はやめる。レイヤー幅が 40rem 未満のときだけ、アーティストの 2 行目を隠す。

### 6-2 Facts 行

`LyricsHint` を削除し、`Facts` の末尾に歌詞の状態を足す。

| 状態                                | 表示                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `notFound`                          | `No lyrics`                                                                                         |
| `sourceFailed`                      | `Lyrics file unreadable` (ボタン。`title` に `.lrc` のパス、クリックでパスをコピー。今の挙動と同じ) |
| resolved かつ plain                 | `Unsynced lyrics`                                                                                   |
| notice `sidecarFailedUsingEmbedded` | `Embedded lyrics` (`title` に「The .lrc file couldn't be read.」)                                   |
| resolved かつ timed                 | 何も出さない                                                                                        |

- `FactLine` が文字列しか受け取らない場合は、ボタンを `FactLine` の後ろに同じ行として並べる (`FactLine` を拡張しない)。
- `lyrics-panel.tsx` の `LyricsMessage` (notFound / sourceFailed) は、Now Playing が resolved のときしか `LyricsPanel` を出さなくなっているので削除する。

## Step 7 — 歌詞のハイライト (P5, D6)

`ui/lyrics-panel.tsx`

- **H1 明るさ**: 色は今のまま (過去 `--faint-foreground`、現在 `--artwork-accent`、未来 `--muted-foreground`)。opacity を距離で決める式 `1 - distance * 0.08` を、次の表に置き換える。
  ```ts
  /** Opacity by lines away from the current one (capped at 4). */
  const DISTANCE_OPACITY = [1, 0.9, 0.7, 0.5, 0.35] as const;
  ```
- **H2 読み取り帯**: スクロール容器の親 (`relative`) に、`pointer-events-none absolute inset-x-0 top-[40%] h-28 -translate-y-1/2` の div を置く。背景は `linear-gradient(to bottom, transparent, color-mix(in oklab, var(--artwork-accent) 8%, transparent), transparent)`、`forced-colors:hidden`。帯は動かさない。歌詞が帯の中を通過する。キューの右列 (`variant="full"`) にも同じ帯を置く。コンポーネントは `ui/reading-band.tsx`。
- **H3 ガターの ▶**: 現在行のガターに、アートワーク色の `Play` アイコン (`size-3.5`) を常に出す。ホバー、フォーカス、`free` モードのときは時刻に切り替える (2 つの span を `group-hover` などで出し分ける。幅は `w-16` のまま)。

**完了条件**: アートワークなし (アクセントが白) でも、現在行と隣の行の区別がひと目で分かる。スクリーンショットで確認する。

## Step 8 — ドキュメント

- `docs/requirements.md` の Lyrics の該当行を次に置き換える。
  > Now Playing keeps one layout with or without lyrics: the Sleeve and track info on the left; on the right the lyrics, or the queue (click to play an upcoming track) when there are none. The current line or track sits at the same height in both.
- DESIGN.md は変更しない (原則の範囲内)。
- 各コンポーネントの先頭コメントを新しい挙動に合わせる (`NowPlayingContent`、`LyricsPanel`、`useLyricsScroll`、`KineticText`、`QueueColumn`)。

## Step 9 — テスト

| 種類                                          | 内容                                                                                                                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit `use-lyrics-sync.test`                   | `withIntro` の境界                                                                                                                                                                                                                |
| unit 新 `use-lyrics-scroll.test` (renderHook) | +1 ではアニメーション / +5 では即座 / シークで `follow` に戻る / `free` 中に +1 進み、3 秒経過していれば `follow`、していなければ `free` のまま                                                                                   |
| unit `now-playing-columns.test`               | `QueueColumn` の行の仕様 (Step 5)、`KineticText` がテキストを 1 回だけ描く                                                                                                                                                        |
| e2e `dock.e2e.ts` 既存                        | 「shows the no-lyrics and unreadable-lyrics states」の期待文言を `No lyrics` に更新                                                                                                                                               |
| e2e 追加                                      | 1100×680 / 1360×900 / 1920×1080 で情報ブロックが波形帯に重ならない。1920 (歌詞あり) でキュー列が出て、波形帯に Up next が無い。1360 (歌詞あり) で波形帯に Up next がある。歌詞なしで右列の現在の行の中心がリストの上から 40% ±8px |
| e2e 追加                                      | タイトルの折り返し (Step 2 の完了条件)                                                                                                                                                                                            |

- 目視: 上の 3 サイズ × (歌詞あり / なし / plain / sourceFailed) のスクリーンショットを撮る。一時的な Playwright の spec を `tests/` に置いて撮影し、**コミットしない**。Reduced motion と Calm motion の両方で確認する。

## 実装順

1. Step 1 (修正のみ) と Step 2 (タイトル)。独立しているので最初に入れて、1 回コミットする。
2. Step 4 (歌詞の挙動) と Step 7 (ハイライト)。
3. Step 5 (キュー) → Step 3 (レイアウト) → Step 6 (Up next / Facts)。Step 3 のキュー列は Step 5 の `QueueColumn` が必要。
4. Step 8、Step 9 の残り。`pnpm check` と `pnpm test:renderer` と `pnpm test:renderer:e2e` を通す。

## やらないこと (別件)

- 再生元 (アルバム / プレイリスト / シャッフル) の表示。`PlaybackQueueSnapshot` に再生元の情報が無く、バックエンドの変更が必要なため別件にする。
- 行を左から塗るハイライト (H4)、曲末に次の曲名を出す案。
- 歌詞の行テキストのクリックによるシーク。
- タイトルバーに残って見えるサイドバー境界線 (x=256)。Now Playing の外の問題なので別件で調べる。
- Light と波形そのもののデザイン変更。
