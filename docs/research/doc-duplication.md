# 調査: ドキュメント間の記述重複と所有権の乖離

調査日: 2026-10-05。対象は `AGENTS.md`、`README.md`、`DESIGN.md`、`CONTRIBUTING.md`、`CONTEXT.md`、`docs/requirements.md`、`docs/agents/*.md`、`docs/adr/0001-0014`、`docs/research/*.md`、`static/fonts/fontshare/README.md`、および `.agents/skills/**`（`.claude/skills/` はそれらへのシンボリックリンクのため実体は同じ）。`node_modules` と `target` は除外。

本ノートの置き場所: このリポジトリは調査ノートを `docs/research/` に置く慣例（`CONTRIBUTING.md:36` と既存6ファイル）なので、そこに置いた。

根拠の種類: **[確認]** は文書とコード/設定を直接読んで確認した事実、**[推定]** は読んだ内容からの推論。引用は短縮している。行番号は 2026-10-05 時点の `main`（a115474）。

## 要約

1. 最大の重複源は `CONTEXT.md` である。用語集のはずが、`requirements.md` の挙動（Gapless、Meter の数値、Missing、スクロール索引）と ADR の実装説明（Pipeline、Waveform の push、Playback clock）を言い換えて持っている。`domain-modeling` スキルは「CONTEXT.md は実装の詳細を一切持たない」と定めているので（`.agents/skills/domain-modeling/SKILL.md` の "Update CONTEXT.md inline" 節）、スキルの規則とも食い違う。
2. 「どの文書に何を書くか」の一覧が3か所（`AGENTS.md:3-6`、`CONTRIBUTING.md:30-38`、`README.md:5-12`）にあり、内容が互いに違う。`README.md:12` は存在しない `docs/cpu-measurement.md` を指している（リンク切れ）。
3. 実在する矛盾が複数ある。代表例は「位置イベントの頻度」（ADR 0012 は 20 Hz、ADR 0014 とコードは 1 秒）、「Docs only なら何も実行しない」（`oxfmt` は Markdown も検査する）、「pre-commit check」（フックが存在しない）、`requirements.md` の「Planned」にある Meters（実装済み）。
4. `DESIGN.md` は「実装を持たない」と宣言するが、フォント名、14px、ファイルパスを持つ。`CONTEXT.md` の UI 節と DESIGN の動き/面の記述も二重になっている。
5. 提案: 所有者を一つに決め、他は「1文 + リンク」にする。優先度順の計画は末尾にある。

---

## 1. 所有権の分割（AGENTS.md の宣言）と実態

`AGENTS.md:3-6` の宣言: requirements=挙動、DESIGN=UI原則（実装なし）、CONTRIBUTING=エンジニアリング規則・ワークフロー・チェック。`CONTRIBUTING.md:30-38` はこれに `README`、`CONTEXT`、`adr/`、`research/`、`.scratch/` を加えた完全版を持つ。

| 文書              | 宣言された役割                                         | 役割の外にあるもの                                                 |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| `DESIGN.md`       | UI原則。「実装を持たない」(`:3`, `CONTRIBUTING.md:33`) | フォント名と最小 14px (`:46`)、`src/app.css` などのパス (`:52-55`) |
| `CONTEXT.md`      | 用語 (`CONTRIBUTING.md:34`)                            | 数値付きの挙動、スレッド/キューの実装、イベント頻度（第3節）       |
| `requirements.md` | 挙動                                                   | 実装詳細は少ない。「Planned」の Meters 節は実装済みの内容          |
| `CONTRIBUTING.md` | エンジニアリング規則                                   | `.scratch/` と各スキルの手順 (`:64-68`)。他文書とほぼ同内容        |
| ADR               | 戻しにくい決定と理由                                   | `requirements.md` と同じ挙動の再説明 (0010, 0012, 0014)            |

---

## 2. 重複の指摘（優先度順）

各項目は「出現箇所」「所有者」「アクション」の順。アクションは **delete**（削除）、**link**（リンクに置換）、**merge**（統合）。

### D1. 「どの文書に何があるか」の一覧が3重 [確認]（優先度 高）

出現箇所:

- `AGENTS.md:3-6`: "`docs/requirements.md` - how the product behaves" / "`CONTRIBUTING.md` - engineering rules, workflow, and checks"
- `CONTRIBUTING.md:30-38`: "Where things go:" 以下に8項目。`:37` "`CONTRIBUTING.md`: engineering rules, workflow and checks."
- `README.md:5-12`: "Requirements — accepted product behavior" / "Contributing — principles and engineering rules"
- `DESIGN.md:3`: "[requirements.md] decides what the app does. This document decides how it looks, moves, and feels."
- `docs/agents/domain.md:5-8`: 「CONTEXT.md を読め、`docs/adr/` を読め」

食い違い:

- `AGENTS.md` は `CONTEXT.md`、`docs/adr/`、`docs/research/`、`README.md` を挙げない。
- `README.md` は `docs/agents/` と `docs/research/` を挙げない。
- `README.md:12` は `docs/cpu-measurement.md` を挙げるが、そのファイルは存在しない（`git ls-files` と Glob で確認）。リンク切れ。
- `README.md:11` は Contributing を「principles and engineering rules」と呼ぶが、`AGENTS.md:5` と `CONTRIBUTING.md:37` は「engineering rules, workflow and checks」と呼ぶ。

所有者: `CONTRIBUTING.md` の「Documentation」節（`:26-44`）が完全版なので、これを唯一の所有者にする。
アクション:

- `AGENTS.md:3-6` は「文書の配置は `CONTRIBUTING.md#documentation` を見る」の1行 + リンクにする（**link**）。AGENTS に残すのはエージェント固有のもの（Tool usage、`docs/agents/*`）だけにする。
- `README.md:5-12` は人間向けの入口として残してよいが、`docs/cpu-measurement.md` の行は **delete**（またはファイルを作る）。`docs/research/` と `docs/agents/` は載せるか、載せないなら理由を決める。
- `DESIGN.md:3` の2文目は **delete** し、「挙動は requirements」とだけ残す。
- `docs/agents/domain.md:5-8` は「読む順序」のスキル用の記述として必要。ただし `CONTRIBUTING.md:34-35` と重なる部分は **link**。

### D2. Issue tracker と triage label [確認]（優先度 中）

出現箇所:

- `CONTRIBUTING.md:38`: ".scratch/: gitignored working notes. Move anything worth keeping to a file above."
- `CONTRIBUTING.md:67`: "`/to-spec` and `/to-tickets` write to `.scratch/<feature>/`."
- `docs/agents/issue-tracker.md:3-12`: `.scratch/<feature-slug>/`、`spec.md`、`issues/<NN>-<slug>.md`、`Status:` 行
- `docs/agents/triage-labels.md:3-10`: 「ラベルは `Status:` 行の値」。表に2ラベル
- `.agents/skills/to-tickets/SKILL.md:62` と `:84-90`: 同じパス規則とテンプレート（`Status: ready-for-agent`）
- `.gitignore`: `/.scratch/`（"Skill working notes (specs and tickets)"）
- `scripts/tickets.mjs:1,15`: `.scratch/*/issues` を読み、`Status` が `done` かを数える

食い違い（弱い）: `CONTRIBUTING.md:38` は `.scratch/` を「価値があるものは他へ移す作業メモ」とするが、`issue-tracker.md:9` は「完了したチケットは `issues/` に残す」とする。`.gitignore` されているので、残した完了チケットは履歴にならない。
また `symphonia-gapless-trim.md:3` と `wasapi-shared-mode-path-truthfulness.md:3` は `.scratch/codebase-review/issues/...` を出典に挙げるが、これは gitignore 対象で、クローンしても存在しない（リンク切れ）。

所有者: `docs/agents/issue-tracker.md`。
アクション:

- `triage-labels.md`（12行）を `issue-tracker.md` に **merge**。`Status:` の値は `ready-for-agent` と `done` の2つだけで、同じ場所で説明するほうが読みやすい。ただし `docs/agents/triage-labels.md` を名指しするスキル群があるため、移す前に `.agents/skills` で参照を確認する（`to-spec`/`to-tickets` は "If not, read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`" と書いている）。参照を残す場合は現状維持でもよい。
- `CONTRIBUTING.md:67` は **link**（`.scratch/` のパスは `issue-tracker.md` が持つ）。
- 2つの research ノートの `.scratch/...` への言及は、チケットの要旨を1文で書くか **delete**。

### D3. ワークフロー（スキルの連鎖）[確認]（優先度 低）

出現箇所: `CONTRIBUTING.md:64-68` の `/grill-with-docs → /to-spec → /to-tickets → /implement`、`/clear` の指示。
重なるもの: 各スキルの `SKILL.md` がそれぞれの手順を持つ。`grill-with-docs` は `grilling` と `domain-modeling` を呼ぶだけ（`.agents/skills/grill-with-docs/SKILL.md`）。`implement` は「`/tdd` を使い、終わったら `/code-review`、現在のブランチにコミット」(`implement/SKILL.md:8-14`)。
食い違い（弱い）: `implement` は「Commit your work to the current branch」、`CONTRIBUTING.md:57` は「Commit directly to `main`」。矛盾はしないが、ブランチ方針が2か所にある。
所有者: スキルの中身は各 `SKILL.md`。「いつどのスキルを使うか」は `CONTRIBUTING.md`。
アクション: 現状でほぼ妥当。`CONTRIBUTING.md:66` の説明文（"settles the design…"）だけ、スキルの description と重なるので **delete** を検討。

### D4. 用語を使えという指示が3重 [確認]（優先度 低）

- `CONTEXT.md:3`: "Use these terms in code, docs, and tickets. Do not invent synonyms."
- `CONTRIBUTING.md:44`: "Use one word for one thing. Use the terms in `CONTEXT.md`."
- `docs/agents/domain.md:12-13`: "Use the `CONTEXT.md` term for a domain concept… Do not use a synonym."

所有者: `CONTEXT.md:3`。アクション: `CONTRIBUTING.md:44` は STE の規則（「1語1義」）の一部なので残してよい。`domain.md:12-13` はスキル向けの指示としての意味があるので残すが、文言は `CONTEXT.md:3` に揃える（**link**）。

### D5. `CONTEXT.md` と `requirements.md` と ADR の三重記述 [確認]（優先度 最高）

用語集にあるべきでない挙動・実装・数値が、他の文書と二重になっている。以下、所有者はすべて「挙動 = `requirements.md`、理由 = ADR、用語集 = 定義1〜2文」。

| テーマ                                                      | CONTEXT.md                                                                                                                                                                      | requirements.md                                                                                                          | ADR                                          | アクション                                                                                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gapless / Output stream                                     | `:25-26` "Gapless: consecutive tracks of the same audio format play with no silence… A format change reopens the output stream and leaves a short gap, so the Path stays true." | `:21-27` 同じ文（"A track of another format reopens the output stream and leaves a short gap, so the Path stays true."） | 0010 `:7` に理由。0008 `:5`                  | CONTEXT は定義1文に縮める。理由 "so the Path stays true" は ADR 0010 にあるので delete                                                                                                |
| Pipeline                                                    | `:27` "A seek builds a new Pipeline and hands its sample queue to the running stream. The app builds the next track's Pipeline before the end and hands it over the same way."  | なし                                                                                                                     | 0008 `:5`、0010 `:5` に同じ説明（三重）      | CONTEXT は「デコードスレッドと、それが満たすサンプルキュー」の1文だけにし、ハンドオフの記述は ADR に置く（**delete**）                                                                |
| Waveform                                                    | `:29-32` push、playback id、「遅い答えは決めない」                                                                                                                              | なし                                                                                                                     | 0009 `:3-7` とほぼ同じ                       | CONTEXT は定義1文（RMS と peak、playback id で識別）にし、push の説明は ADR 0009 に任せる（**delete**）                                                                               |
| Position event                                              | `:28` "The backend sends it on its own while a track plays. It sends the playback snapshot only when state changes. A tick re-renders only the Playback clock."                 | なし                                                                                                                     | 0014 `:14`、0012 `:16`                       | 頻度は矛盾あり（第3節 C1）。CONTEXT は用語だけ（**delete** 後半2文）                                                                                                                  |
| Playback clock                                              | `:39-43` 「2通りだけ: 境界で起きるタイマー、コンポジタが進めるアニメーション」。「メインスレッドでフレームごとに時間を描かない」                                                | なし                                                                                                                     | 0014 `:3-6` が同文の原典                     | CONTEXT は1文（「再生位置の唯一の情報源」）+ ADR 0014 へのリンク（**link**）                                                                                                          |
| Meter（Spectrum、Level meter、Meter frame、Bar、Cap、Hold） | `:33-38`。数値あり（Hold 1.5 s、"Clip" 2 s、「30 band」、「fixed dB-per-second」）                                                                                              | `:129-137` に同じ数値（30 dB/s、8.6 dB/s、1.5 s、10 dB/s、2 s、"Clip"、"after volume"）                                  | 0012 `:3-14`                                 | 数値は `requirements.md`（挙動）だけが持ち、CONTEXT は用語の定義から数値を **delete**。コードの実体は `src/lib/meters/ballistics.ts:12-17`（30、8.6、1.5、10）                        |
| Missing                                                     | `:10` "never deletes it automatically. The user may delete Missing tracks after confirmation. A new file with the same content… is that track again (relinked)"                 | `:70-73` 同内容。`:117-118` にも「確認なしの破壊的操作なし」                                                             | なし                                         | CONTEXT は定義1文。挙動は requirements                                                                                                                                                |
| Scan の「半端なバッチを残さない」                           | `:9`                                                                                                                                                                            | `:68`                                                                                                                    | 0003 `:8`                                    | 3か所で同一文 "A cancelled or failed scan never leaves a half-written batch."。requirements に残し、他は **delete**（0003 は「バッチごとに1トランザクション」という実装の理由に絞る） |
| Compilation / Edition                                       | `:11-12`                                                                                                                                                                        | `:92`（CONTEXT へのリンク付き。これは良い形）                                                                            | 0011 `:8`                                    | requirements `:92` の末尾の文 "A disc folder … belongs to the album folder above it." は CONTEXT `:12` と重複なので **delete**                                                        |
| Scroll index                                                | `:13` "names grouped by first character… Kana are grouped by row. Kanji are one group."                                                                                         | `:88-91` "Kana are filed under the head of their row… All kanji are one"（同じ事実）                                     | 0011 `:9`                                    | 挙動は requirements。CONTEXT は定義1文                                                                                                                                                |
| 検索/並びの折り畳み（NFKC など）                            | なし                                                                                                                                                                            | `:83`, `:85`                                                                                                             | 0011 `:6`、`backend/src/library/text.rs:4-7` | 現状はこの1組だけ。ADR 0011 `:6` は要件の再掲なので「`requirements.md` 参照」にするか削る                                                                                             |
| Queue                                                       | `:20-23` 「arranged order、play order、編集後にシャッフルを切っても何も失わない、置き換えは1回だけ undo」                                                                       | `:17-19`, `:60-61`                                                                                                       | なし                                         | 同一事実が2文書に3回。requirements に集約（`:19` と `:60-61` を残す）、CONTEXT は定義                                                                                                 |
| Playback context                                            | `:17`                                                                                                                                                                           | `:12-14`                                                                                                                 | なし                                         | requirements に集約                                                                                                                                                                   |
| Album Artist と表示                                         | `:8` "Library views are Albums, Album Artists, and Tracks. An Album Artist opens into its Albums."                                                                              | `:75` 同じ文                                                                                                             | なし                                         | CONTEXT から後半を **delete**                                                                                                                                                         |
| Now Playing / Dock                                          | `:45-46`                                                                                                                                                                        | `:98-102`                                                                                                                | 0001 `:6`、DESIGN `:40`                      | DESIGN `:40` が UI 原則として持つ。CONTEXT は1文の定義のみ（現状は `:45` が DESIGN と同文）                                                                                           |

`CONTRIBUTING.md:34` は「CONTEXT.md: domain terms」と書く。つまり CONTEXT が「用語」だけを持つ設計が宣言されており、実態との差が問題である。

### D6. DESIGN.md と CONTEXT.md（UI 節）の二重 [確認]（優先度 中）

- `DESIGN.md:34`: 「Screens are built from five elements (Sleeve, Light, Strip, Gutter, Path)… Their definitions are in CONTEXT.md.」
- `CONTEXT.md:48-57` の UI 節は上の5つに加えて **Acrylic**、**Calm motion**、**Progress motion** を持つ。DESIGN の「5つの要素」には Acrylic などは含まれないので、UI 節の定義の範囲が DESIGN と揃っていない。

重複する内容:

- Calm motion: `DESIGN.md:24`（「Calm motion (a setting) stops motion that starts on its own. Only the position marker moves.」）と `CONTEXT.md:56`（"a setting. With it, only the position marker moves on its own."）。同じ事実。
- Progress motion: `DESIGN.md:23`（"Progress motion runs at constant speed."）と `CONTEXT.md:57`、`ADR 0007 :5`（"progress motion stays linear"）。
- Acrylic の適用範囲: `DESIGN.md:39`（"Menus, selection popups, tooltips, dialogs, and panels for tasks use Acrylic."）と `CONTEXT.md:52`（"menus, dialogs, panels"）。リストが違う（tooltip と selection popup が DESIGN にしかない）。
- Light の強さの順序（Now Playing > dock > 詳細ヘッダ…）は `CONTEXT.md:51` にのみある。これは「UI の挙動」なので DESIGN の領分。
- "Blur appears only in Light and Acrylic. Blur is never animated."（`CONTEXT.md:52`）も UI 原則。

所有者: UI の原則と挙動は `DESIGN.md`。用語の定義（名前と一文）は `CONTEXT.md`。
アクション: Calm motion と Progress motion は DESIGN に原則があるので CONTEXT の定義は1文にして **link**。Light の強さと Blur の規則は DESIGN に **merge**。Acrylic の範囲は DESIGN `:39` に揃える。

### D7. DESIGN.md の「実装を持たない」宣言との差 [確認]（優先度 中）

- `DESIGN.md:3` と `CONTRIBUTING.md:33` は「実装の詳細は持たない」と述べる。
- しかし `DESIGN.md:46` は "Satoshi for Latin, Noto Sans JP… Nothing smaller than 14px" と書き、`DESIGN.md:52-55` は `src/app.css`、`src/lib/ui/motion/tokens.ts`、`src/lib/ui/artwork-light/light-model.ts` を挙げる。
- `static/fonts/fontshare/README.md:3` は "Satoshi (see `DESIGN.md`)" とフォント選択の根拠を DESIGN に置く。

判断: 書体と最小サイズは「UI 原則」と見なせる。しかしパス一覧（`:48-55` "Where the details live"）は実装の所在であり、宣言と矛盾する。パスはコードの変更で古くなる。
アクション: `:48-55` は削る。「値はコードが持つ」の1文だけ残す。または宣言を「実装の詳細は持たない。ただしコードの所在は示す」に直す。どちらかに揃える。

### D8. DESIGN.md と ADR の動きの記述 [確認]（優先度 中）

- `DESIGN.md:18-24`（原則7）: 「one curve: a spring that never overshoots」「three durations (feedback, move, large)」「keeps its velocity」「Reduced motion replaces every movement with a brief crossfade」
- `ADR 0007 :5`: 同じ事実を実装の言葉で再説明（"Every movement follows one curve: a critically damped spring… three durations (`feedback`, `move`, `large`)… Reduced motion stays a 100ms crossfade"）。
- `ADR 0004 :5`: "principle 1 (motion never delays an action) and principle 7 (motion is interruptible and loses no information under reduced motion)"。原則番号で DESIGN を参照している。DESIGN 原則7に「interruptible」という語はなく（"retargets while moving" と "never jumps" がある）、原則番号が変わると壊れる。
- `ADR 0013 :27` "Verify these through rendered adapters: small text, state changes, nested popups, reduced motion, forced colors, narrow layouts, enlarged text." は `DESIGN.md:30`（原則13）の「reduced motion, forced colors, enlarged text, Windows scaling」と近い列挙。

所有者: 原則は `DESIGN.md`、理由と代替案は ADR。
アクション: ADR 0007 `:5` の冒頭は DESIGN への1文リンクにし、ADR は「なぜ自前の曲線か」に絞る。ADR 0004 `:5` は番号を使わず原則の名前（"Motion explains"）で参照する。ADR 0013 `:27` は DESIGN `:30` へ **link**。

### D9. 「意味トークンを使う」規則 [確認]（優先度 低）

- `CONTRIBUTING.md:22`: "Use semantic tokens for UI surfaces. Do not use raw palette values."
- `DESIGN.md:13`（"Controls and feedback use semantic colors"）と `DESIGN.md:52`（"Color tokens: `src/app.css` (semantic tokens only)."）

所有者: `CONTRIBUTING.md`（エンジニアリング規則）。DESIGN `:52` は D7 で削除予定なので、そのまま解消する。

### D10. 共有 UI の規則 [確認]（優先度 低）

- `CONTRIBUTING.md:23`（共有 `lib/ui` は既定値のみ、ドメインのバリアントは足さない、レビューで確認、ESLint ルールもチェッカーも足さない）
- `ADR 0013 :8-9`, `:17-18`（同じ規則とその強制方法）。`ADR 0013 :17` は「短い規則は CONTRIBUTING にある」と明記しており、意図的な構造。
  アクション: 現状維持でよい（規則=CONTRIBUTING、理由=ADR）。ただし `CONTRIBUTING.md:23` の「Check this in review. Do not add ESLint rules or checker scripts.」は ADR 0013 `:17-18` の再掲なので、短くしてもよい。

### D11. ADR 0002 の依存方向 vs README vs lint 設定 [確認]（優先度 中）

出現箇所:

- `ADR 0002 :5`: 依存方向 `routes → components → shell → {playback, library, lyrics, settings} → {ui, utils, native}`、「Domains never import each other」「`oxlint`'s `no-restricted-imports` enforces this」「`native` is the only place that may import `@tauri-apps/*`, enforced by lint」
- `.oxlintrc.json`: 各ディレクトリの override に同じ規則がメッセージとして重複（"Dependencies point down: routes > components > shell > domains > ui/utils/native."）。
- `README.md:25`: "Code is in `src/routes` and `src/lib`. See ADR 0002 for the folders."（これは良い形のリンク）

食い違い: ADR 0002 `:3` はドメインに `meters` を挙げるが、`.oxlintrc.json` の override は `native, utils, ui, playback, library, lyrics, settings, shell, components, routes` のみで、`src/lib/meters/**` の規則がない（`meters` の出現数は 0）。「Domains never import each other」は meters では lint で強制されていない。ADR 0002 の「enforces this」は meters については事実でない。
アクション: どちらかに揃える。meters の override を足すか、ADR 0002 に「meters は未強制」と書く。コードの変更が要るので、ドキュメントだけでは直せない点を伝えること。

### D12. チェック手順と設定 [確認]（優先度 高）

`CONTRIBUTING.md:70-87` はチェックの表を持つ。`package.json` の scripts と突き合わせた結果:

- 表の全コマンド（`check`, `test:renderer`, `test:shared`, `check:native`, `test:native`, `bindings`, `test:e2e`, `test:e2e:app`, `validate`, `package`, `format`, `dev`）は `package.json` に存在する。
- **矛盾 1**: `CONTRIBUTING.md:79` は "Docs or comments only → Nothing" とするが、`package.json` の `format:check` は `oxfmt --check .` で、`pnpm check` に含まれる。`oxfmt` は Markdown を検査する（`pnpm exec oxfmt --check AGENTS.md CONTRIBUTING.md docs README.md` が 27 ファイルを検査した）。つまり docs の変更は、書式が崩れると `pnpm check` で失敗する。docs だけの変更では「`pnpm format:check` を実行」が正しい。コメントのみの変更でも、コードの書式検査の対象である。
- **矛盾 2**: `CONTRIBUTING.md:72` "There is no CI, so the pre-commit check is the only gate." リポジトリに pre-commit フックは存在しない（`.git/hooks` にサンプルのみ、`core.hooksPath` 未設定、`.husky`/`lefthook` なし、`.github` なし）。実際のゲートはコミット前に人が（またはエージェントが）手で実行するチェックのみ。「pre-commit check」という語は、自動で動くものがあるように読める。
- `CONTRIBUTING.md:81` は "`pnpm check`. If logic changed, add `pnpm test:renderer`…"。`pnpm test`（`vitest run && pnpm test:native`）は表に出てこないが、`validate` に含まれる。矛盾ではない。
- `CONTRIBUTING.md:75` "Run slow checks (`test:e2e*`, `package`, `validate`) in the background." は、リポジトリに `.vscode/tasks.json` があるが、そこは同じ scripts の別名で重複しない。
- `README.md:21` は「チェックは CONTRIBUTING#checks」とリンクしており、良い形。
- `static/fonts/fontshare/README.md:7` "`pnpm fonts:check`… (part of `pnpm check`)": `package.json` の `check` に `fonts:check` が含まれる。正しい。ただしこの README の記述は `package.json` と重複する（`pnpm fonts:download` など）。実害は小さい。

所有者: コマンドの定義は `package.json`。「いつどれを走らせるか」は `CONTRIBUTING.md`。
アクション: `:79` を「Docs only: `pnpm format:check`」に直す。`:72` の "pre-commit" を実態に合わせて直す（フックを足すか、「手で走らせるチェックだけがゲート」と書く）。

### D13. README のスタック節と ADR [確認]（優先度 低）

- `README.md:25-27`（Renderer: SvelteKit…、Host: Tauri 2、Backend: Rust owns playback, library…）は ADR 0001（SvelteKit SPA）と ADR 0003（"Rust owns domain and persistent state"）の1文版。
- `README.md:29` の shadcn-svelte の追加手順は他に出てこない。ここが唯一の所有者。

アクション: 現状の長さなら README の要約として許容。ただし ADR 0003 が変わったら README の「Backend: Rust owns playback, library, persistence, and native work」も変わる点を認識しておく。必要なら「詳細は ADR 0001-0003」と1語で足す。

### D14. `.claude/skills` の説明 [確認]（優先度 低）

- `README.md:31-33`: "`npx skills add` creates machine-specific links in `.claude/skills`. Git ignores them."
- `.gitignore`: コメント "Skill links created by `npx skills add` (machine-specific)" と `.claude/skills/`
- `skills-lock.json` が存在する。

アクション: 重複は小さい。README は人間向けの説明として残し、`.gitignore` のコメントは短くしてよい。実態（11本のシンボリックリンク）と一致している。

### D15. `requirements.md` 内の自己重複 [確認]（優先度 低）

- 「Volume and mute」(`:16`)、「Output device selection」(`:33`)、「Volume, mute, output device, repeat, and shuffle are remembered across restarts」(`:34`)。`:34` は設定の永続化の話で、`:16` と `:33` と観点が違うが、同じ名詞が3回出るので、1つのリストにまとめると読みやすい。
- 「Starting playback from a list replaces the queue」は `:60` にあり、`CONTEXT.md:23` と `:61` の前後にも同じ主題がある。
- `:12-14`（コンテキスト内で再生が続く）と `:57-61`（キュー関連）が離れている。

アクション: 小さなマージ。

---

## 3. 矛盾・ドリフト

### C1. 位置イベントの頻度 [確認]

- `ADR 0012 :16`: "Carrying the levels in `PlaybackPositionChanged`: it runs at 20 Hz, batched with state events, and is too slow to look live."
- `ADR 0014 :14`: "The position event is a 1 Hz correction, not a source of motion."
- コード: `backend/src/audio/playback/session.rs:18` `POSITION_UPDATE_INTERVAL: Duration = Duration::from_secs(1)`。

ADR 0012 の 20 Hz は、ADR 0014 の変更（フレームループの廃止）より前の数字の可能性がある [推定]。ADR は不変の記録だが、数字が現状と違うことは読者を誤らせる。ADR 0012 に「2026-10 以降は 1 Hz（ADR 0014）」と注記するか、数字を直す。

### C2. Meters は実装済みなのに「Planned」にある [確認]

- `docs/requirements.md:122` の見出しは "Planned (not yet implemented)"。`:129-137` に Meters の完全な仕様。
- しかし `src/lib/meters/ballistics.ts:12-17`（30 dB/s、8.6、1.5 s、10 dB/s）、`ADR 0012`（"The app measures the Spectrum…"、実装を過去形で説明）、`tests/meters.e2e.ts` が存在する。
- ADR 0012 と CONTEXT（`:33-38`）は Meters を現在のものとして説明している。

アクション: Meters の節を「Planned」から「Playback/Now Playing」の節へ移す。すべて実装済みかをコードで確認してから移す（ここでは数値の一致のみ確認した）。

### C3. CONTEXT.md の Path と WASAPI 調査の推奨 [確認]

- `CONTEXT.md:55`: "Path… Its length alone shows whether playback is bit-perfect."
- `docs/research/wasapi-shared-mode-path-truthfulness.md` の Answer 2-3: 共有モードでは WASAPI のミキサーが必ず介在するので bit-perfect は保証されない。推奨は「アプリが音を変えなかった」ことだけを主張する文に変えること。
- `requirements.md:25` と `:139`（"Exclusive output, bit-perfect playback" が Planned）、DESIGN `:25`（"it may not look like it measures what it does not"）も同じ関心事。

調査の推奨が CONTEXT に反映されていない。反映するか、決定として ADR に記録するか、却下するかを決める必要がある。DESIGN の原則8（"State is honest" に近い「Decoration is data」）とも関係するため、Path の定義の所有者は CONTEXT、その主張の範囲は ADR にする。

### C4. ADR 0011 と CONTRIBUTING のキー計算の所在 [推定]

- `CONTRIBUTING.md:19`: "Only `library/keys.rs` computes how the catalog files a track (title, artist, album and Album Artist keys, year)."
- `ADR 0011 :6`: 「sort key / search key は `library/text.rs` で畳み込む (folded)」。
- コード: `backend/src/library/keys.rs`（ファイル/アルバム/年のキー）と `backend/src/library/text.rs`（畳み込み。`keys.rs` が `text_key` を持つ）。

`text.rs` は畳み込み関数を提供し、`keys.rs` がそれを呼んで列の値を作ると読める [推定]。矛盾ではないが、「only `keys.rs` computes」と「`text.rs` で折り畳む」が別の言葉で同じ領域を指し、読者が混乱する。CONTRIBUTING に「畳み込み自体は `text.rs`」と1語足すか、ADR に「`keys.rs` が使う」と足す。

### C5. ADR 0001 のルート数 [推定]

- `ADR 0001 :5` "The app has 8 routes, dynamic segments, redirects, and nested layouts."
- 現状 `src/routes` の `+page.svelte` は6つ（`+page.ts` のリダイレクトを含めて数えると変わりうる）。
  ADR は決定時点の記録なので問題にしなくてよいが、数字を含めると古くなる。「数字を入れない」を ADR の書き方の規則にしてもよい。

### C6. research ノートの古さ [確認]

- `spring-motion.md:5` "Today: three durations … plus `settle`, a Svelte `Spring`…" は ADR 0007 で置き換えられた。ADR 0007 `:3` が research をリンクしているが、ノートの冒頭には「結論は ADR 0007 に採用済み」という注記がない。
- `tauri-e2e-testing.md` と `tauri-app-e2e-stability.md` は後者が前者を補う（`stability.md:7` に明記）。第1節の「Tauri が公式に支持する層」が両方に出る。
- `CONTRIBUTING.md:48-53` は `tauri-app-e2e-stability.md` の結論（セレクタ、リポジトリ所有の継ぎ目、Tauri 内部を使わない）の要約で、末尾にリンクがある（良い形）。

アクション: research の冒頭に1行の「状態」（採用済み/参考/古い）を足す。内容は直さない（調査日の記録だから）。

---

## 4. スキル側の記述（`.agents/skills/**` と `.claude/skills/**`）

`.claude/skills/*` はすべて `.agents/skills/*` へのシンボリックリンクで、実体は1つ [確認]。リポジトリの文書を言い換えているのは以下のみ:

- `to-tickets/SKILL.md:62`、`:84-90` と `to-spec/SKILL.md` の末尾: `.scratch/<feature-slug>/issues/<NN>-<slug>.md` の規則。`docs/agents/issue-tracker.md:7-9` と同じ。ただしスキルは外部（mattpocock/skills）由来で `skills-lock.json` に固定されているので、直接編集せず、リポジトリ側が正とするのが妥当。
- `domain-modeling/SKILL.md`: 「CONTEXT.md is a glossary and nothing else」。**`CONTEXT.md` の現状と矛盾**（D5）。ADR を出す3条件（戻しにくい、背景なしでは意外、本物のトレードオフ）は `CONTRIBUTING.md:35`（"hard-to-reverse decisions, with the reason"）の簡略版。
- `research/SKILL.md`: 「リポジトリが既にノートを置く場所に合わせる」。`CONTRIBUTING.md:36`（"docs/research/: sourced findings (/research)"）と整合。

アクション: スキルのファイルは変更しない。リポジトリ側を、スキルの前提（CONTEXT は用語のみ）に合わせる。

---

## 5. 優先度付きリファクタ提案

1. **P1: CONTEXT.md を用語集に戻す**（D5, D6）。各用語を定義1〜2文にし、挙動は `requirements.md`、実装と理由は ADR へ **link**。数値（Hold、dB/s、"Clip" の秒数）は CONTEXT から削除し、`requirements.md` だけに置く。効果が最も大きく、ドリフトの源も最大。
2. **P1: 事実の誤りを直す**（C1, C2, D12）。
   - `README.md:12` のリンク切れを削除。
   - `CONTRIBUTING.md:79`「Docs only: Nothing」を `pnpm format:check` に。
   - `CONTRIBUTING.md:72` の「pre-commit」を実態に合わせる。
   - ADR 0012 `:16` の 20 Hz を直すか注記。
   - `requirements.md` の Meters を「Planned」から出す（コードで実装範囲を確認した後）。
3. **P2: 文書の配置一覧を CONTRIBUTING に一本化**（D1）。`AGENTS.md:3-6` と `README.md:5-12` は短い入口 + リンクにする。`DESIGN.md:3` の2文目を削除。
4. **P2: DESIGN.md の範囲を揃える**（D6, D7, D8）。`:48-55` のパス一覧を削除（または宣言の方を直す）。Light の強さと Blur の規則を CONTEXT から DESIGN へ移す。ADR 0004 の原則番号参照を名前に置き換える。
5. **P3: tracker 文書の統合**（D2）。`triage-labels.md` を `issue-tracker.md` に統合（スキルが名指しするパスの参照を確認してから）。research の `.scratch/...` 参照を削除。
6. **P3: 小さな整理**（D3, D4, D10, D15, C3-C6）。`requirements.md` の「Volume/mute/device」の整理、research の状態行、ADR 0011 と CONTRIBUTING のキー計算の所在の一文、Path の定義の決定（C3）、meters の lint override（D11、コード変更が要る）。

### 実施のときの注意

- 文書を変更したら `pnpm format:check` を走らせる（`oxfmt` が Markdown を検査するため）。
- 用語集から数値を外すと、`DESIGN.md` や ADR が CONTEXT の数値を引いていないかを検索で確認する（今回の調査では、他文書が CONTEXT の数値に依存している箇所は見つからなかった）。
- ADR は決定時点の記録なので、本文の書き換えは最小にする（注記の追加か、番号の参照の修正に留める）。
- `.agents/skills/**` は外部由来で `skills-lock.json` が固定している。直接は編集しない。
