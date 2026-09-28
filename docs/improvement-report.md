# コードベース改善レポート

調査日: 2026-09-27 / 対象: `main` @ `499ed42`

このレポートは一時的な調査結果であり、正式なドキュメント(requirements / architecture / DESIGN)ではない。採用した項目は各ドキュメントとコードに反映し、このファイルは役目を終えたら削除する想定。

将来機能(ビジュアライザー、スマートプレイリスト、外部歌詞プロバイダー、履歴、ReplayGain、ギャップレス)を前提に、**今のうちに直さないと後で高くつくもの**を優先している。

---

## 実装状況(2026-09-29)

**実装済み(Phase 0 と Phase 1 のほぼ全部)**

| ID  | 状況                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | 本物のランダムシャッフル。現在の曲を先頭に固定し、リピート All では一周ごとに再シャッフル(`queue.rs`、単体テストと不変条件テスト付き)                                                      |
| B2  | 再生系コマンドをすべて `async` + `spawn_blocking` に。置き換えられた開始要求は `Superseded` を返す(renderer は黙って無視)                                                                  |
| B3  | `usePlaybackSession` を廃止し、更新頻度ごとのフック(`usePlaybackItem` / `Transport` / `Output` / `Queue` / `Position`)に分割。ショートカットは購読せず `getState()` を読む                 |
| B4  | `PlaybackContext`(album / tracks)+ `start_playback(context, startTrackId)` に統一。`start_library_track` / `start_library_album` と `StartLibrary*Error` は廃止                            |
| B5  | 失敗を `Item`(ファイル単位: 通知して次の曲へ、一周で打ち切り)と `Output`(デバイス単位: 停止してキューは残す)に分離                                                                         |
| B6  | MoveQueueItem の境界、`edit_queue`、Previous の 3 秒ルール、Shift_JIS 等の歌詞デコード、歌詞タグの二重走査、歌詞クエリの再取得(スキャン完了時)                                             |
| A1  | `PlaybackItem`(`track_id` / album / album_artist / artwork 付き)。`get_library_track_for_path` を廃止し、`get_library_track(id)` に                                                        |
| A3  | `playback.rs` を `queue` / `item` / `snapshot` / `service` / `worker` / `session` / `preferences` に分割。キューは純粋なデータ構造                                                         |
| A4  | 開始系エラーを `StartPlaybackError` に統合。歌詞の「トラックが見つからない」を `RootNotFound` の読み替えでなく専用コードに                                                                 |
| A5  | `EventSink` / `BackendEvent`(状態を持たないイベント。発火側は Tauri を知らない)。`app/` にユースケース層(`playback_context`)                                                               |
| A6  | 読み取り接続のプール、スキャンをバッチ単位のトランザクション + 並列検査に、スキャナーを `discover` / `inspect` / `persist` に分割、検索条件と並び順の SQL を一元化、artwork 保存の重複解消 |
| A7  | スキャナーを `library/scanner/` に(統合テスト 9 件を追加)                                                                                                                                  |
| A8  | 設定サービス(`settings.json`)。音量・ミュート・出力デバイス・リピート・シャッフル・artwork backdrop を永続化                                                                               |
| A9  | 一部: イベント名の検証(生成型で網羅性を確認)、`shadcn` を devDependencies へ                                                                                                               |
| A10 | 未使用依存(`tokio-util` / `notify-debouncer-full` / `rusqlite_migration` / `tempfile`)と孤立ファイルを削除                                                                                 |
| A11 | CI(`.github/workflows/ci.yml`、未検証)、architecture / requirements / CONTRIBUTING を更新                                                                                                  |

**未実装(意図的に見送り)**

- Phase 2 / 3 の機能: 再生履歴、手動プレイリスト、Play Next / Add to Queue、SMTC・メディアキー、A2(安定 ID・トラック照合・正規化テーブル)、キーセットページング、FTS5、スマートプレイリスト、外部プロバイダー、ビジュアライザー、DSP チェーン / ReplayGain / ギャップレス / 排他モード
- B6 のうち: SQL に埋め込まれた `'Unknown album'` / `'Unknown artist'`(アルバムの識別キーと URL に使われているため A2 と一緒に直す)、5.1ch のダウンミックス(DSP チェーンと一緒に)、波形キャッシュのキー
- A6 のうち: 状態文字列の enum 化、`ON DELETE CASCADE`
- A9 のうち: `features/playback-control` の FSD 分割、`playback-dock.tsx` の分割、e2e モックのファクトリー化
- A11 のうち: `_prompts.md` / `create-project-snapshot.py` の整理(作者の運用ファイルなので触っていない)

---

## 0. 要約

| 優先度 | ID                 | 内容                                                                                               | 種別                           |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------ |
| 🔴     | B1                 | シャッフルがランダムでなく「残りキューの逆順」になっている                                         | バグ                           |
| 🔴     | B2                 | 同期 Tauri コマンドがメインスレッドで再生ワーカーの応答を待つ(曲送りでウィンドウが固まりうる)      | バグ / 性能                    |
| 🔴     | B3                 | `AppShell` が 250ms ごとに再レンダーされる                                                         | 性能                           |
| 🔴     | B4                 | アルバム画面・Tracks 画面で曲をクリックすると 1 曲だけのキューになる                               | UX バグ                        |
| 🔴     | A1                 | 再生中の曲がライブラリの `trackId` を持たず、パスから逆引きしている                                | 構造                           |
| 🟠     | B5                 | どのトラックでもデコード/出力に失敗するとキュー全体が消える                                        | 挙動                           |
| 🟠     | A2                 | アルバム/アーティストに安定 ID がなく、トラック ID はパスに依存                                    | 構造(プレイリスト・履歴の前提) |
| 🟠     | A3                 | `playback.rs` 2,675 行。キューのロジックがワーカーに埋め込まれている                               | 構造                           |
| 🟠     | A6                 | DB 層: 呼び出しごとに接続を開く、スキャンにトランザクションなし、ページングが実質 OFFSET           | 性能 / 構造                    |
| 🟠     | A8                 | 設定の永続化がない(音量・出力デバイス・リピート・シャッフル)                                       | 機能 / 構造                    |
| 🟡     | A4, A5, A7, A9–A11 | エラー型の増殖、ユースケース層がない、スキャナーの配置、FSD の揺れ、未使用依存、ドキュメントの乖離 | 一貫性                         |

推奨する順序: **Phase 0(バグ修正)→ Phase 1(基盤: A1/A3/A8/A6)→ Phase 2(履歴・プレイリスト・OS 連携)→ Phase 3(スマートプレイリスト・外部プロバイダー・ビジュアライザー・DSP)**。詳細は §6。

---

## 1. バグ・正確性の問題

### B1. シャッフルが逆順になっている 🔴

`backend/src/audio/playback.rs:2266` の `set_shuffle_order(true)` は `sequence.entries[start..].reverse()` を実行しているだけで、ランダムにしていない。`rand` は `backend/Cargo.toml` に入っているが、どこからも使われていない。

- 修正: `rand::seq::SliceRandom::shuffle` を使う。現在の曲は先頭に固定し、残りをシャッフルする。
- 併せて: リピート All + シャッフルで末尾まで行くと index 0 に戻るが、そこは `current_index` より前の「シャッフルされていない」曲になる。一般的な挙動は「一周したら再シャッフル」か「全体をシャッフルし直して current を先頭にする」。キューをモジュールとして切り出す A3 と一緒に直すのが自然。
- テスト: 「シャッフル後、要素の集合は同じで順序は変わる」「解除で元の順序に戻る」を queue モジュールの単体テストにする。

### B2. 同期コマンドがメインスレッドをブロックする 🔴

`src-tauri/src/commands/playback.rs` のコマンドはすべて `async` のない `pub fn`。Tauri 2 では同期コマンドは**メインスレッド**で実行される。一方で `PlaybackServiceHandle::request`(`playback.rs:832`)は、ワーカーの返信を `recv()` で待ち続ける。

`next` / `previous` / 開始系は、返信を `PendingSourceLoad` → `PendingPlayback` の間ずっと保持する。そのため、ファイルの読み込み(小さいファイルは丸ごとメモリに載せる)、デコーダーを開く処理、プリバッファ、ストリーム開始まで、メインスレッドが待たされる。HDD や NAS 上のファイル、大きな FLAC では、ウィンドウのドラッグや再描画が止まる可能性がある。

- 修正(最小): 全 playback コマンドを `async fn` にして、中身を `spawn_blocking` する。library コマンドはすでにそうなっているので、書き方もそろう。
- 修正(将来): コマンドはすぐに「受理」を返し、結果は `playbackStateChanged` イベントだけで届ける。renderer 側はもともと revision 付きのイベント駆動になっているので、相性がよい。
- 関連: 開始要求が後続の要求に置き換えられたとき(`CompressedSourceError::Cancelled => return`、`playback.rs:1291`)、`reply` がそのまま drop される。すると、先に呼んだ側には `WorkerUnavailable` エラーが返る。本来は「superseded」として扱うべきケース。

### B3. `AppShell` が 250ms ごとに再レンダーされる 🔴

`src/app/renderer/ui/use-playback-shortcuts.ts` は `usePlaybackSession()` を購読している。これは `snapshot` を丸ごと購読するので、位置が更新されるたび(`POSITION_UPDATE_INTERVAL = 250ms`)に `AppShell` が再レンダーされる。その結果、`TitleBar` / `Navigation` / `NowPlayingLayer` / `PlaybackRegion` / `QueuePanel` も巻き込まれる。さらに、effect の依存に毎回新しいオブジェクトになる `playback` が入っているので、`keydown` リスナーも 250ms ごとに付け直されている。

- 修正: ショートカットのハンドラ内では `usePlaybackStore.getState()` と `playbackActions` を直接参照し、hook では購読しない。
- 構造的な修正: `usePlaybackSession()` は巨大な「全部入り」hook になっている。`usePlaybackPosition()`(高頻度)、`usePlaybackTransport()`(状態とアクション)、`usePlaybackQueue()`、`usePlaybackOutput()` のように、**更新頻度ごとに**分ける。ビジュアライザーを載せる前に必ずやっておくべき。

### B4. 曲をクリックしても、その文脈から続けて再生されない 🔴

- アルバム詳細(`album-details-page.tsx:60,95`)と Tracks 一覧(`tracks-page.tsx:42`)は `startLibraryTrack` を呼ぶ。これは `PlaybackCommand::Start` を通るので、**1 曲だけのキュー**になる。アルバムの 3 曲目をクリックすると、その曲だけ再生して止まる。
- backend には `catalog_playback(album_key, Option<track>)` と `StartLibraryAlbumTrackError::TrackNotMember` があり、「アルバムを指定トラックから再生する」ための下準備はある。しかし `start_library_album` は `None` しか渡していない。
- 修正: 「再生コンテキスト」を IPC の第一級の概念にする。

  ```rust
  enum PlaybackContext {
      Album { key: LibraryAlbumKey },
      AlbumArtist { key: LibraryAlbumArtistKey },
      Tracks { filter: String, sort: LibraryTrackSortKey, direction: LibrarySortDirection },
      Playlist { id: PlaylistId },          // 将来
      SmartPlaylist { id: SmartPlaylistId }, // 将来
  }
  fn start_playback(context: PlaybackContext, start_track_id: Option<TrackId>)
  ```

  将来追加するプレイリスト / スマートプレイリスト / アーティストの一括再生も、同じ入口の variant を増やすだけで済む。`start_library_track` / `start_library_album` と、未使用の `StartLibraryAlbumError`(`service.rs:491`)はここに統合する。

### B5. 1 曲の失敗でキュー全体が消える 🟠

`fail_start`、`fail_active_stream`、`handle_signal` 内の 3 分岐(`playback.rs:1473, 2317, 2384, 2398, 2412`)がすべて `self.sequence = None` にしている。アルバム再生の途中で 1 曲だけ壊れていると、キューごと失われる。

- 要件の「No silent fallback that changes a selected playback mode」には抵触しない形で直せる。**デコード失敗**(ファイル単位の問題)はエラーを通知したうえで次の曲へ進む。**出力失敗**(デバイス単位の問題)は停止するが、キューは残す。この 2 つを分ける。
- 同じ「discard → sequence=None → publish_queue → publish(failed)」の塊が 4 か所に複製されているので、`fail_session(code, policy)` に集約する。

### B6. その他の小さな正確性の問題 🟡

| 箇所                                     | 問題                                                                                                                                                                                                                                | 修正案                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `playback.rs:1178-1192` MoveQueueItem    | ターゲットの条件が `*i > 0`。`current_index > 0` のとき、先頭の upcoming を Earlier に動かすと**再生中のエントリーと入れ替わる**。UI 側は `index > 0` で無効化しているので今は起きないが、backend は authority なので自分で守るべき | 条件を `*i > sequence.current_index` にする。queue モジュール化(A3)の際にテストを付ける          |
| `playback.rs:2245` `edit_queue`          | `position` を二重に呼んでいて O(n²)。条件も読みにくい                                                                                                                                                                               | `position` の結果を 1 回で判定する                                                               |
| Previous                                 | 再生位置が数秒進んでいても前の曲へ移る。一般的には「3 秒以上なら曲の頭に戻る」                                                                                                                                                      | 要件と DESIGN を確認したうえで、backend で判定する                                               |
| `lyrics/service.rs:91` `read_text`       | UTF-8/16 しか扱えない。日本語の `.lrc` は Shift_JIS が多く、`SourceFailed` になる                                                                                                                                                   | `encoding_rs` と `chardetng` で推定してデコードする                                              |
| `media/lyrics.rs:21`                     | `tags().iter().chain(primary_tag())` で primary tag を二重に走査している                                                                                                                                                            | `tags()` だけで十分                                                                              |
| `output_processing.rs` ChannelConversion | Mono↔Stereo しかない。5.1ch の FLAC などを 2ch デバイスで再生できない可能性がある                                                                                                                                                   | ダウンミックス行列を追加する(DSP チェーン化 §3.5 と一緒に)                                       |
| `entities/lyrics/api/queries.ts`         | `staleTime/gcTime: Infinity`。`.lrc` を追加・編集しても再起動まで反映されない                                                                                                                                                       | スキャン完了や watcher のイベントで無効化する。外部プロバイダーを入れるときは必須                |
| `playback-waveform.ts`                   | 「パスに対して波形は不変」という前提。同じパスでファイルが差し替わると古い波形が出る(gcTime 60s なので実害は小さい)                                                                                                                 | キーを trackId + source_revision にする(A1 と一緒に)                                             |
| `catalog.rs` / `service.rs`              | `'Unknown album'` `'Unknown artist'` が SQL に埋め込まれている(計 9 か所)。表示用の文字列がデータ層に漏れている                                                                                                                     | NULL のまま返して renderer で表示を決める。ソートは `NULLS LAST` などで扱う。i18n の前提にもなる |

---

## 2. アーキテクチャ・構造的問題

### A1. 再生中の曲の「同一性」がパスしかない 🔴(最重要の基盤)

現状:

- `PlaybackEntrySeed` / `PlaybackQueueEntry` / `PlaybackSnapshot` が持っているのは `ValidatedAudioFile`(パス)と title/artist だけ。
- renderer は `useLibraryTrackForPath(snapshot.file.path)` でトラックを逆引きしている。backend の `track_for_path` は、毎回 canonicalize、全ルートの走査、SQL を実行する。
- キューの項目には artwork も trackId もない。

これが次の機能すべてのボトルネックになる:

- 再生履歴や再生回数(どのトラックが再生されたか)
- スクロブルや SMTC(メタデータとアートワークを確実に取得する)
- 歌詞(今は renderer がパス → trackId → 歌詞 と 2 段で引いている)
- キュー UI でのアートワーク表示、「アルバムへ移動」

提案:

```rust
pub struct PlaybackItem {
    pub queue_item_id: QueueItemId,
    pub track_id: Option<TrackId>,   // ライブラリ外のファイル再生の余地を残す
    pub file: ValidatedAudioFile,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub artwork: Option<ArtworkRef>,
    pub duration_ms: Option<u64>,
}
```

- `PlaybackSnapshot` の `Playing/Paused` には `item: PlaybackItem` を持たせる。
- 同時に `PlaybackSnapshot` の重複も整理する。`Playing` と `Paused` の 15 フィールドは同一なので、`struct ActiveSession { … }` と `status` に分け、`with_volume` / `set_revision` / `set_navigation` の 4 分岐 match を不要にする。specta の `#[serde(flatten)]` か、`{ status, session: Option<ActiveSession>, common… }` の形にする。
- `get_library_track_for_path` は削除できる。

### A2. ライブラリのエンティティ ID が不安定 🟠(プレイリスト・スマートプレイリストの前提)

- アルバムは `LibraryAlbumKey`(album_artist 文字列 + title 文字列)、アーティストは文字列キーで識別されていて、URL もその文字列になっている。毎回 `GROUP BY` で算出している。
- `tracks` は `library_files(root_id, relative_path)` に 1:1 でひも付く。ファイルの**リネームや移動、ルートの付け替えで別トラックになる**。今は困らないが、手動プレイリスト、履歴、統計、ユーザーが確定した歌詞やアートワークの選択が、すべてそこで消える。
- 要件の「a user's confirmed choice is never silently replaced」と「Missing files are shown as missing」を両立させるには、「missing になったトラックと、新しく現れたファイルを照合する」仕組みが必要になる。

提案(段階的に):

1. **トラック照合**: スキャン時、新規ファイルの (duration, 主要タグ, byte_length) または音声データの content hash が missing トラックと一致したら、`tracks.file_id` を付け替える。blake3 はもう依存に入っている(waveform の `content_hash` で使用)。
2. **正規化テーブル**: `artists`、`albums(album_artist_id, title, …)`、`track_artists`(複数アーティストや feat. の余地)をスキャン時に upsert する。catalog クエリは ID ベースにする。URL も `/albums/$albumId` になり、エンコードの問題もなくなる。
3. **ユーザーデータは分離する**: `playlists` / `playlist_items(track_id)` / `play_events(track_id)` / `lyrics_selection(track_id)` などは `tracks.id` だけを参照する。ソース由来のテーブル(`track_source_metadata`)とは寿命を分ける。今の `ON DELETE RESTRICT` と「自動削除しない」方針に合っている。

### A3. `playback.rs` の肥大化と、キューが純粋なロジックとして分離されていない 🟠

`backend/src/audio/playback.rs` は 2,675 行ある。ワーカーのイベントループ、ストリームのライフサイクル、シーク、デバイス切替、キュー、シャッフル、リピート、スナップショット構築がすべて `PlaybackWorker` に入っている。

提案する分割:

```text
audio/playback/
  mod.rs             PlaybackService / Handle(公開 API とコマンドチャネル)
  command.rs         PlaybackCommand(reply 型をジェネリックにして 20 variant の重複を減らす)
  worker.rs          イベントループと tick
  session.rs         Active/Pending/PendingSeek のライフサイクル(ストリーム関連)
  snapshot.rs        PlaybackSnapshot と構築関数
  queue.rs           ★ 純粋なデータ構造: PlaybackQueue
  decode_worker.rs / source_loader.rs(既存)
```

`queue.rs` は I/O を持たない純粋な型にする:

```rust
impl PlaybackQueue {
    fn replace(items, start_index) -> Self;
    fn current(&self) -> Option<&PlaybackItem>;
    fn advance(&mut self, reason: AdvanceReason /* Natural | UserNext | UserPrevious */) -> Option<&PlaybackItem>;
    fn play_next(&mut self, items);      // 新機能
    fn append(&mut self, items);         // 新機能
    fn remove(&mut self, id);
    fn move_to(&mut self, id, index);    // earlier/later ではなく任意の位置へ(ドラッグ並べ替え)
    fn set_shuffle(&mut self, enabled, rng: &mut impl Rng);
    fn set_repeat(&mut self, mode);
    fn snapshot(&self) -> PlaybackQueueSnapshot;
}
```

- B1、B5、B6 の修正、Play Next / Add to Queue、キューの永続化(再起動後の復元)は、すべてここに閉じ込められる。
- 単体テストで網羅しやすい(proptest で「不変条件: current は常に 1 つ、ID は一意」)。

### A4. エラー型の増殖と重複したマッピング 🟡

- 同じ失敗が `PlaybackFailureCode` → `PlaybackServiceError` → `PlaybackCommandError`(src-tauri)と、3 層でマッピングされている。さらに `StartLibraryTrackError` / `StartLibraryAlbumError`(未使用)/ `StartLibraryAlbumTrackError` / `LyricsCommandError` / `LibraryCommandError` がある。
- `app.rs` の `map_playback_track_error` と `map_playback_album_error` は、中身が完全に同じ。
- `map_lyrics_context_error` は `RootNotFound` を `TrackNotFound` に読み替えている。`LibraryCommandError::RootNotFound` が「トラックが見つからない」の意味でも使われている(`track_for_path`、`lyrics_context`)。

提案:

- ドメインごとのエラーは backend に 1 つずつ置く(`PlaybackError`、`LibraryError`、`LyricsError`)。ユースケースの失敗は `enum StartPlaybackError { Library(LibraryError), Playback(PlaybackError) }` のように**合成**し、IPC では `{ domain, code }` に serialize する。
- renderer の `playback-errors.ts` / `library-errors.ts` のメッセージ表も `domain.code` をキーにした 1 つの表にまとめる。

### A5. アプリケーション層(ユースケース)の置き場所がない 🟡

`BackendApp`(`app.rs`)に、ライブラリと再生をまたぐユースケース(`start_library_track`、`resolve_lyrics`、`playback_waveform`)がその場しのぎで並んでいる。今後「履歴を記録する(再生 × ライブラリ)」「スマートプレイリストを再生する」「外部から歌詞を取得してキャッシュする」のような横断処理が増える。

提案:

```text
backend/src/
  app/
    mod.rs            BackendApp(DI コンテナ + ライフサイクル)
    playback_context.rs  PlaybackContext → Vec<PlaybackItem> の解決(B4)
    history.rs        再生イベントの購読 → play_events の記録(§3.6)
    lyrics.rs         プロバイダーチェーンの実行(§3.3)
  events.rs           ★ BackendEvent enum と EventSink trait
```

**イベント基盤**: 今は各サービスが別々の `SyncSender<()>` と `take_*_receiver()` を持ち、`src-tauri/src/events.rs` で 1 本ずつ `forward` している。waveform だけは `Receiver<String>` という独自形式。

- `trait EventSink: Send + Sync { fn emit(&self, event: BackendEvent); }` を backend に定義し、各サービスに注入する。src-tauri 側はそれを実装して `app:event` に流すだけにする。
- 新しいイベント(履歴更新、プレイリスト変更、歌詞取得完了、設定変更)を足すたびに src-tauri を配線し直さなくて済む。
- `AppEvent::name()` と `#[serde(rename)]` で、イベント名が二重管理になっている点も解消できる。

### A6. データベース層 🟠

| 問題                                                                            | 箇所                               | 影響                                                                                        | 提案                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 呼び出しごとに `Connection::open` + PRAGMA + WAL 検証                           | `database.rs:36-44`                | 1 回ごとの IPC にオーバーヘッドがかかり、ページングやスクロールで効いてくる                 | reader の小さなプール(`r2d2_sqlite`、またはスレッドローカル)と、専用の writer 1 本                                                                                         |
| スキャンがトランザクションなしで自動コミット                                    | `service.rs:646-925`               | 1 ファイルあたり UPDATE/INSERT が 3〜5 回走り、毎回 WAL commit になる。数万曲では非常に遅い | N 件(例: 200)ごとに `BEGIN … COMMIT`                                                                                                                                       |
| スキャンが検査(デコードの probe)を直列に実行                                    | 同上                               | CPU もディスクも遊んでいる                                                                  | discover → inspect(並列、rayon または worker N 本)→ persist(単一 writer)のパイプライン                                                                                     |
| "cursor" の実態が `ROW_NUMBER() OVER (ORDER BY …)` の順位、つまり OFFSET        | `catalog.rs:190-201`               | 毎ページ全件をソートするので、全ページ読むと O(N²)。スキャン中は順位がずれる                | effective_title / effective_artist / effective_album を**生成列**または正規化テーブルの列として持ち、インデックスを張ってキーセットページング(`(sort_value, id) > (?, ?)`) |
| `LIKE '%…%'` を 4 式にかけて検索                                                | 同上                               | インデックスが使えない                                                                      | **FTS5** の仮想テーブル(trigram tokenizer で日本語の部分一致にも対応)。スマートプレイリストの「テキスト条件」にもそのまま使える                                            |
| 同じ WHERE 句が COUNT と SELECT に複製                                          | 同上                               | 保守しにくい                                                                                | クエリビルダ関数 1 つにまとめる                                                                                                                                            |
| 状態を文字列で持っている(`'available'` `'indexed'` `'stored'` `'storeFailed'`…) | 全体                               | 綴りを間違えても実行時まで気付かない                                                        | Rust enum に `ToSql/FromSql` を実装する                                                                                                                                    |
| SQL が 1 行の長い文字列で、rustfmt も効かない                                   | `service.rs` の随所                | 読めないし、差分も追いにくい                                                                | `const` か `include_str!("sql/*.sql")` に切り出して整形する                                                                                                                |
| カスケードを手書き                                                              | `remove_root`                      | テーブルを追加するたびに削除漏れが起きうる                                                  | 何を「ユーザーデータ」として残すかを決めたうえで、FK に `ON DELETE CASCADE` を付ける                                                                                       |
| 12 要素のタプルに分解                                                           | `service.rs:808-864`               | 読めない                                                                                    | `SourceMetadata` 構造体をそのまま使う                                                                                                                                      |
| artwork 保存ロジックの重複                                                      | `scan` と `retry_artwork_metadata` | 修正が片方だけに入る                                                                        | `store_artwork(&conn, ArtworkRead) -> (status, id)` に集約する                                                                                                             |
| `rusqlite_migration` が依存にあるのに自前のマイグレーションを使っている         | `migrations.rs`                    | 依存の無駄                                                                                  | どちらかに統一する(自前で十分なら依存を削除)                                                                                                                               |

### A7. スキャナーの配置 🟡

- 実際のスキャン処理は `library/service.rs` にあり、約 280 行の関数 1 つ。一方で `library/scanner.rs` は `#![allow(dead_code)]` の `ScanReport` だけの残骸になっている。
- `service.rs`(1,999 行)には DB クエリ、IPC 用のエラー型、再生エントリの解決、歌詞コンテキスト、アートワーク accent、スキャンが混ざっている。

提案:

```text
library/
  service.rs     LibraryService / Handle(薄い公開 API)
  scanner/       discover.rs, inspect.rs, persist.rs(A6 のパイプライン)
  repo/          tracks.rs, roots.rs, artwork.rs(SQL と行マッピング)
  catalog.rs     読み取りモデル(既存)
  errors.rs
```

### A8. 設定の永続化がない 🟠

- 音量、ミュート、出力デバイスの選択、リピート、シャッフルは起動のたびに初期値に戻る(`PlaybackService::start` が `VolumeState::default()` と `SystemDefault` を使う)。
- 唯一の設定である「Artwork backdrop」は renderer の `localStorage` に保存されている(`shared/lib/artwork-backdrop.ts`)。CONTRIBUTING の「Rust owns domain and persistent state」に反している。
- 今後の ReplayGain のモード、歌詞プロバイダーの有効化と優先順位、ビジュアライザーのプリセット、外部サービスの opt-in は、すべて設定が前提になる。

提案:

- `backend/src/settings/`: `Settings` 構造体(serde + specta、`#[serde(default)]` で前方互換)、SQLite の `settings` テーブル(key と JSON value)または `settings.json`、`get_settings` / `update_settings(patch)` の IPC、`settingsChanged` イベント。
- 各サービスは起動時に設定を受け取り、更新はイベント(A5 の EventSink)経由で購読する。
- renderer は `entities/settings` に TanStack Query で 1 つのキャッシュを持つ。
- 再生セッション(キューと位置)の復元も、同じ仕組みの上に載せられる。

### A9. renderer の構造 🟡

| 項目                                                        | 現状                                                                                                                                                                                                                                                                                     | 提案                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FSD の揺れ                                                  | `features/playback-control` の中身は、store(エンティティ相当)、出力デバイス、エラー文言、音量の刻み、波形クエリが同居していて、ファイルもフラット。`widgets/playback-region`、`track-table`、`media-details-*` もフラットで、`now-playing` と `queue-panel` は `model/ui` に分かれている | `entities/playback`(store、selector、query)と、`features/transport`、`features/queue-edit`、`features/output-device`、`features/volume` に分ける。セグメント(`model/ui/api/lib`)はスライス内のファイルが 3 つを超えたら必ず使う、というルールを CONTRIBUTING に 1 行足す |
| ルートルートがライブラリの search schema を知っている       | `routes/__root.tsx`                                                                                                                                                                                                                                                                      | プレイリストやスマートプレイリストのビューが増えると、ルートが肥大化する。`retainSearchParams` の対象をビューごとに定義するか、ビュー状態を `pages/library/model` に閉じ込める                                                                                           |
| イベントのファンアウトが手書き                              | `native-session.ts` で `acceptEvent` / `applyLibraryEvent` / `applyWaveformEvent` を並べている                                                                                                                                                                                           | `const eventHandlers: Record<AppEvent["event"], Handler[]>` の型付きレジストリにする。backend(A5)と対になる                                                                                                                                                              |
| `isAppEvent` の検証が浅い                                   | `event` が string かどうかしか見ていない                                                                                                                                                                                                                                                 | architecture.md は「validated events」と書いている。zod が入っているので、判別共用体のスキーマで検証するか、記述を実態に合わせる                                                                                                                                         |
| `playback-dock.tsx` 517 行                                  | `PlaybackDock` 本体が約 290 行で、コメントが長い                                                                                                                                                                                                                                         | `DockIdentity`、`DockTransport`、`DockVolume` に分ける。レイアウトの意図は DESIGN.md に寄せる(PHILOSOPHY「詳細を書きすぎない」)                                                                                                                                          |
| e2e のモックが手書き(`tests/fixtures/native-api.ts` 516 行) | コマンドを足すたびに手で更新する                                                                                                                                                                                                                                                         | `TNativeAPI` を満たすファクトリーを、デフォルト実装 + override の形にし、足りないコマンドは型エラーで検出する                                                                                                                                                            |
| `shadcn` が `dependencies` にある                           | CLI なので実行時には不要                                                                                                                                                                                                                                                                 | `devDependencies` に移す                                                                                                                                                                                                                                                 |

### A10. 未使用の依存・残骸 🟡

- Rust(backend): `rand`(B1 を直せば使う)、`rusqlite_migration`、`notify-debouncer-full`、`tokio-util`、`tempfile`。`cargo machete` か `cargo udeps` で確認できる。
- `library/scanner.rs` の `#![allow(dead_code)] ScanReport`、`StartLibraryAlbumError`。
- `#[cfg(test)]` 専用の snapshot コンストラクタが本体に混ざっている(`playback.rs:200-449`)。`tests.rs` か test_support に移す。

### A11. ドキュメントとリポジトリ衛生 🟡

- `docs/redesign-plan.md` のステータスが「Step D in progress」のまま。完了したら DESIGN.md に統合して削除する(PHILOSOPHY: 単一の情報源)。
- `docs/architecture.md` に、lyrics / waveform / activity サービスと、backend 内のモジュール境界が書かれていない。A5 の層構造を入れる際に 5〜10 行ほど追記する。
- `_prompts.md` は「DO NOT REFER」と書いてあるのに git 管理下にある。`create-project-snapshot.py` はルートにあるが、`_prompts.md` は `scripts/create-project-snapshot.py` を参照している。前者は `scripts/` に移す。後者は意図的に共有しているのでなければ `.gitignore` に入れる。
- CI がない(`.github/` がない)。個人プロジェクトでも、`windows-latest` で `pnpm check && pnpm check:native && pnpm test` を回すだけで、bindings の stale や clippy の退行を検出できる。

---

## 3. 将来機能のための拡張基盤

### 3.1 共通: 「プロバイダー」基盤(歌詞・アートワーク・メタデータ・スクロブル)

外部の歌詞、外部のアートワーク、MusicBrainz、Last.fm は、どれも同じ横断要件を持っている。要件の「External services: opt-in only, credentials never exposed to the UI or logs」「external failures never block playback」がそれにあたる。個別に作ると一貫性が崩れるので、最初に `backend/src/external/` を作る。

```text
external/
  client.rs     共有 HTTP クライアント(reqwest + rustls)、タイムアウト、User-Agent、ホストごとのレート制限
  gate.rs       設定による opt-in の判定(無効なら呼ぶ前に Err(Disabled))
  secrets.rs    認証情報は Windows Credential Manager(keyring crate)。IPC にもログにも出さない
  cache.rs      provider_cache(provider, key, fetched_at, status, payload)、ネガティブキャッシュ付き
```

- ログのマスク: `log` の出力に URL やトークンが載らないよう、client 側でパスとクエリを伏せる。
- すべての取得はバックグラウンドで行い、結果はイベントで通知する。再生のコマンド経路には絶対に入れない。

### 3.2 スマートプレイリスト

前提: A2(安定 ID と正規化)、§3.6(再生統計)、A6(生成列と FTS)。

- **フィールドを 1 か所で定義する**: 今はソートキーが `LibraryTrackSortKey` / `LibraryAlbumSortKey` などに分散している。`enum TrackField { Title, Artist, Album, AlbumArtist, Genre, Year, Duration, Format, SampleRate, BitDepth, PlayCount, LastPlayedAt, AddedAt, Rating… }` を 1 つ定義し、ソート、フィルタ、スマートルール、テーブルの列定義(renderer の `track-columns.tsx`)で共有する。specta で TS にも出す。
- **ルール AST**:

  ```rust
  enum Rule {
      All(Vec<Rule>), Any(Vec<Rule>), Not(Box<Rule>),
      Text { field: TrackField, op: TextOp /* Contains|Is|StartsWith */, value: String },
      Number { field: TrackField, op: NumOp, value: f64 },
      Date { field: TrackField, op: DateOp /* InLast{days}|Before|After */ },
      InPlaylist { id: PlaylistId },
  }
  struct SmartPlaylist { rule: Rule, sort: Vec<(TrackField, Direction)>, limit: Option<Limit> }
  ```

- **SQL コンパイラー**: `Rule` をパラメータ化した WHERE 句に変換する。フィールド名はホワイトリストの enum からだけ生成し、値はすべてバインドする(インジェクション対策)。評価は catalog と同じキーセットページングで行う(A6)。
- 保存: `smart_playlists(id, name, definition_json, schema_version)`。`schema_version` を持たせ、ルールを進化させたときにマイグレーションできるようにする。
- 再生は B4 の `PlaybackContext::SmartPlaylist` から入る。キューは開始時点のスナップショット(評価結果を固定する)。

### 3.3 外部歌詞プロバイダー

現状の `LyricsService::resolve` は、sidecar と embedded の 2 つのソースを `match` で固定的に解決している。これをチェーンに置き換える。

```rust
trait LyricsProvider: Send + Sync {
    fn id(&self) -> LyricsProviderId;          // "sidecar" | "embedded" | "lrclib" | …
    fn locality(&self) -> Locality;            // Local | External(要 opt-in)
    fn fetch(&self, ctx: &LyricsQuery, cancel: &CancelToken) -> Result<Option<LyricsCandidate>, ProviderError>;
}
struct LyricsQuery { track_id, source_path, title, artist, album, duration_ms }  // 外部検索には duration 照合が重要
```

- **解決の順序**: ① ユーザーが確定した選択(`lyrics_selection` テーブル。要件「confirmed choice is never silently replaced」)→ ② ローカルプロバイダー(sidecar → embedded)→ ③ キャッシュ済みの外部の結果 → ④ 外部の取得(バックグラウンドで行い、完了したら `lyricsResolved` イベント)。
- **IPC モデルの拡張**:
  - `LyricsSourceKind` を `{ kind: "local" | "external", providerId }` にする。
  - `LyricsResolution::Resolved` に `alternatives: Vec<CandidateSummary>` を持たせ、UI で「別の歌詞を選ぶ」を可能にする。
  - `LyricsResolution::Pending` を追加し、外部取得中を表す。
- **コンテンツモデル**: `LyricsTimedLine` に `words: Option<Vec<{start_ms, text}>>` を持たせておく(Enhanced LRC / ワード単位の同期。今から型に入れておけば後方互換で追加できる)。翻訳やふりがなの行も、将来の拡張として `LyricsLine { text, translation?, reading? }` を検討する。
- **renderer**: `entities/lyrics` の `staleTime: Infinity` をやめ、`lyricsResolved` イベントでキャッシュを更新する(B6)。

### 3.4 ビジュアライザー

要件: 「supplementary only, never needed to understand playback state」。

**データ経路(backend)**:

1. **タップ**: decode worker の `OutputPcmProcessor` の出力(出力レートの f32、ゲイン適用前)を SPSC リングバッファにコピーする。`ringbuf` はもう依存に入っている。コールバック内でのロックやアロケーションは禁止。
2. **解析スレッド**: 30〜60Hz で `realfft` による FFT を行い、対数周波数のバンド(例: 64 本)、RMS、ピークを計算する。
3. **同期**: タップするのはキューに**書き込まれた**サンプルで、実際に聴こえるのはそれより後になる。`played_frame_position`(既存)と照合し、再生位置に合うフレームを選ぶ。レイテンシ補償が必要。
4. **転送**: `tauri::ipc::Channel<VisualizerFrame>` でストリームする。購読者がいるときだけ動かす(`subscribe_visualizer(channel)` / `unsubscribe`)。JSON が重ければ `Vec<u8>` に量子化する(waveform の `quantize` と同じ考え方)。
5. 一時停止中、Now Playing を閉じているとき、ウィンドウが最小化されているときは停止する。

**renderer**:

- `widgets/visualizer`: Canvas 2D または WebGL。1 フレームのデータを `useRef` で受け取り、`requestAnimationFrame` で描画する。**React の state には入れない**(B3 の再レンダー問題を繰り返さないため)。
- プリセットのレジストリ: `interface VisualizerPreset { id; label; draw(ctx, frame, theme, dt) }`。artwork の accent 色(既存の `get_artwork_accent`)をパレットの入力にする。
- `prefers-reduced-motion` と設定での無効化に対応する。DESIGN.md の「Light」の語彙のどこに位置づけるかを先に決める(redesign-plan の 5 要素に「Signal」を足すか、Light の一種にするか)。

### 3.5 DSP チェーン / ReplayGain / ギャップレス / 排他モード

- **DSP チェーン**: 今の `OutputPcmProcessor` は「チャネル変換 + リサンプル」に固定されている。これを `trait PcmStage { fn process(&mut self, in, out); fn describe(&self) -> StageInfo; fn latency_frames(&self); }` のリストに一般化する。ReplayGain、プリアンプ、リミッター(要件「no clipping」)、EQ、ダウンミックス(B6)をステージとして差し込む。
  - `StageInfo` の列を `PlaybackSnapshot` に入れれば、renderer の「Path」表記(`playback-technical-status.ts`)がそのまま信号経路を表示できる。要件「explicit and visible to the user」を満たせる。
- **ReplayGain**: スキャン時にタグ(`REPLAYGAIN_TRACK_GAIN` など)を `track_source_metadata` に保存する。タグがない場合の EBU R128 解析(`ebur128` crate)は、waveform と同じくバックグラウンドのサービスにし、解析結果を DB に保存する。
- **ギャップレス**: 今は 1 曲ごとに cpal ストリームを作り直している(`begin_start` → `prepare_output_stream`)ので、原理的にギャップが出る。
  1. 次の曲のデコーダーを終端の N 秒前に先に開く(queue の `peek_next`)。
  2. 出力 spec(レート・チャネル)が一致すれば、**同じストリームの producer に続けて書き込む**。一致しない場合は、リサンプラーで出力 spec に合わせるか、ストリームを作り直す(ギャップは許容)。
  3. トラック境界のフレームを記録し、位置と snapshot の切り替えをそのフレームで行う。
  - この変更はストリームのライフサイクル(A3 の `session.rs`)の再設計を伴うので、A3 の分割を先に済ませる。
- **排他モード / ビットパーフェクト**: cpal の WASAPI は共有モードのみ。排他モードには `wasapi` crate による別の出力バックエンドが必要になる。今のうちに `output.rs` を `trait OutputBackend` の後ろに隠しておくとよい(テストのモック化にも効く)。

### 3.6 再生履歴と統計

要件: 「a brief preview or accidental start must not count as a play」。

- backend の `app/history.rs` が再生イベント(A5 の EventSink)を購読する。
- 判定: 累積の**実再生時間**(シークで飛ばした分は除く)が `min(duration × 50%, 4 分)` 以上になったらカウントする(Last.fm と同じ基準で、スクロブルにも流用できる)。
- テーブル: `play_events(id, track_id, started_at, listened_ms, completed)`。集計テーブルかビューとして `track_stats(track_id, play_count, last_played_at, skip_count)`。スマートプレイリストのフィールドになる。
- A1(`track_id` を持つ再生アイテム)が前提。

### 3.7 手動プレイリスト

- `playlists(id, name, created_at, updated_at)`、`playlist_items(playlist_id, position, track_id, added_at)`。`position` は並べ替えのコストを考えて、疎な整数か fractional index にする。
- missing なトラックは項目として残し、UI では missing と表示する(要件と同じ方針)。
- M3U8 のインポートとエクスポート: パスからトラックへの解決は A2 の照合ロジックを流用する。

### 3.8 Windows 統合(要件外だが、デスクトッププレイヤーとして期待値が高い)

| 機能                                                      | 実装手段                                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| メディアキー / SMTC(音量オーバーレイ、ロック画面への表示) | `souvlaki`、または `windows` crate の `SystemMediaTransportControls`。A1 の `PlaybackItem`(アートワーク付き)がそのまま使える |
| 多重起動の防止                                            | `tauri-plugin-single-instance`                                                                                               |
| ウィンドウ位置とサイズの復元                              | `tauri-plugin-window-state`                                                                                                  |
| タスクバーのサムネイルボタン                              | `windows` crate の ITaskbarList3                                                                                             |
| 自動更新                                                  | `tauri-plugin-updater`(署名鍵の管理が必要)                                                                                   |
| ファイル関連付け / 「このアプリで開く」                   | NSIS の設定 + ライブラリ外ファイルの再生(A1 の `track_id: Option`)                                                           |
| ログ                                                      | `tauri-plugin-log` の出力先(LogDir)とローテーションを明示し、「ログフォルダを開く」を Settings に置く                        |

### 3.9 その他の候補

- キューの UX: Play Next / Add to Queue / ドラッグ並べ替え(`@dnd-kit`)/ コンテキストメニュー(右クリック)。
- グローバル検索(FTS5)とコマンドパレット。
- i18n: UI 文字列の抽出(`Unknown album` を renderer に移すのが第一歩)。ユーザーは日本語話者なので、日本語 UI の需要は大きいはず。
- CUE シート、マルチディスクのグルーピング、コンピレーション(Various Artists)の扱い。
- ライブラリの統計ページ(総再生時間、フォーマット分布など)。§3.6 の副産物。

---

## 4. 一貫性のための規約提案(CONTRIBUTING に足す候補)

最小限に留める(PHILOSOPHY: 書きすぎない)。

1. **ID は newtype で持つ**: `TrackId(i64)` などを定義し、IPC では文字列。`parse_id` は `TryFrom<&str>` にする。
2. **IPC コマンドはすべて `async` で書き、blocking な処理は `spawn_blocking` に入れる**(B2 の再発を防ぐ)。
3. **backend の状態変化は `EventSink` 経由でだけ通知する**(A5)。
4. **renderer の高頻度データは React state に入れない**(位置は専用 selector、ビジュアライザーは ref と rAF)。
5. **表示用の文字列は renderer で決める**(backend は NULL や enum を返す)。
6. **SQL は整形した `const` か `.sql` ファイルに置く。状態を表す列は Rust enum と対応させる。**

---

## 5. テストの補強ポイント

| 対象                  | 現状                                            | 追加提案                                                                                                                      |
| --------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| キュー(A3)            | ワーカーを通した結合テスト(`playback/tests.rs`) | 純粋な `PlaybackQueue` の単体テストと proptest(シャッフル、リピート、移動、削除の不変条件)                                    |
| スキャン              | `service.rs` 内のテストでカタログを検証         | リネームの照合(A2)、トランザクション化(A6)後の中断耐性(キャンセルしても DB が整合していること)                                |
| catalog のページング  | 2,000 件の回帰予算テストあり                    | 5 万件のベンチマーク(`#[ignore]` にして手動で実行)。キーセット化の効果を測る                                                  |
| 歌詞                  | LRC パーサーのテスト                            | Shift_JIS、プロバイダーチェーンの優先順位、確定した選択が保持されること                                                       |
| renderer の再レンダー | なし                                            | `playback-session` の selector 分割後に、「位置の更新で AppShell が再レンダーされない」テスト(React Profiler か render count) |
| CI                    | なし                                            | §A11                                                                                                                          |

---

## 6. 推奨ロードマップ

### Phase 0 — すぐ直すバグ(小さく独立していて、低リスク)

1. B1 シャッフルを本物にする
2. B2 playback コマンドを `async` + `spawn_blocking` にする
3. B3 ショートカット hook の購読を外す
4. B6 のうち、MoveQueueItem の境界、Shift_JIS、`edit_queue`
5. A10 未使用の依存を削除する

### Phase 1 — 基盤(将来機能の前提。順序が重要)

1. **A3** キューを `queue.rs` に抽出し、`playback.rs` を分割する(B5 の失敗ポリシーもここで)
2. **A1** `PlaybackItem { track_id, … }` を導入し、`PlaybackSnapshot` を整理し、`track_for_path` を廃止する
3. **B4** `PlaybackContext` で開始経路を統一する
4. **A8** 設定サービスを作る(音量・デバイス・リピート・シャッフル・backdrop の永続化)
5. **A5** `EventSink` と、`app/` のユースケース層
6. **A6** DB: 接続の再利用、スキャンのトランザクション化、enum 化、SQL の整形
7. **A4** エラー型の統合

### Phase 2 — 利用者に見える機能(基盤の上に素直に載るもの)

1. §3.6 再生履歴と統計
2. §3.7 手動プレイリスト、Play Next / Add to Queue
3. §3.8 SMTC とメディアキー、single-instance、window-state
4. A2 トラックの照合と、正規化したエンティティ ID(プレイリストが実データを持ち始める前に)
5. A6 の後半: 生成列、キーセットページング、FTS5

### Phase 3 — 大きな機能

1. §3.2 スマートプレイリスト(TrackField とルール AST)
2. §3.1 と §3.3 の外部プロバイダー基盤と歌詞プロバイダー
3. §3.4 ビジュアライザー(PCM タップ → FFT → Channel → Canvas)
4. §3.5 DSP チェーン → ReplayGain → ギャップレス → 排他モード
