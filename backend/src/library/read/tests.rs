//! The read side over a seeded database: the lists and their pages, the letter indexes, the
//! Library version, and how playback selections are resolved.

use crate::errors::CommandError;
use crate::ids::{AlbumId, ArtistId, DirectoryId, TrackId};
use crate::library::Library;
use crate::library::read::albums::*;
use crate::library::read::artists::*;
use crate::library::read::lists::*;
use crate::library::read::tracks::*;
use crate::library::storage::Database;
use crate::library::storage::keys::{SortTags, TrackKeys};
use crate::library::sync::scan::album_edition_of;
use crate::test_support::CommandCode;
use crate::test_support::{TestDirectory, null_messages};
use rusqlite::params;
use std::path::PathBuf;

/// The track with this rowid, for tests that name tracks by ID.
mod albums;
mod artwork;
mod lists;
mod playback;
mod tracks;

fn track_id_of(rowid: i64) -> TrackId {
    TrackId::try_from_rowid(rowid).expect("test track IDs are above zero")
}

struct Fixture {
    _directory: TestDirectory,
    music: PathBuf,
    database: Database,
    library: Library,
}

/// One track to put in the database, with the tags a Library scan would have read.
#[derive(Clone, Copy)]
struct Seed<'a> {
    id: i64,
    title: &'a str,
    artist: &'a str,
    album: &'a str,
    album_artist: Option<&'a str>,
    disc: Option<i64>,
    track: Option<i64>,
    artwork: Option<&'static str>,
    date: Option<&'a str>,
    duration_ms: Option<i64>,
}

impl<'a> Seed<'a> {
    fn new(id: i64, title: &'a str, artist: &'a str, album: &'a str) -> Self {
        Self {
            id,
            title,
            artist,
            album,
            album_artist: Some(artist),
            disc: Some(1),
            track: Some(id),
            artwork: None,
            date: None,
            duration_ms: Some(1_000),
        }
    }
}

fn fixture() -> Fixture {
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).unwrap();
    let library = Library::open(&directory.file("data"), null_messages()).expect("library");
    let database = library.database.clone();
    // Disabled: the sync worker would otherwise scan the seeded files that the tests write by hand.
    database
        .write()
        .unwrap()
        .execute(
            "INSERT INTO directories(id,path,enabled,scan_generation) VALUES(1,?1,0,0)",
            params![music.to_string_lossy()],
        )
        .unwrap();
    Fixture {
        _directory: directory,
        music,
        database,
        library,
    }
}

impl Fixture {
    fn add(&self, seed: Seed<'_>) {
        self.add_all(&[seed]);
    }

    /// Writes tracks the way a Library scan does: the tags, and the keys computed from them.
    fn add_all(&self, seeds: &[Seed<'_>]) {
        let mut connection = self.database.write().unwrap();
        let transaction = connection.transaction().unwrap();
        for seed in seeds {
            let file = format!("{}.wav", seed.id);
            let keys = TrackKeys::build(
                [
                    Some(seed.title),
                    Some(seed.artist),
                    Some(seed.album),
                    seed.album_artist,
                ],
                seed.date,
                &file,
                SortTags::default(),
                &album_edition_of(&file),
                &self.music.to_string_lossy(),
            );
            transaction
                .execute(
                    "INSERT INTO library_files(id,directory_id,relative_path,file_name,extension,modification_key,source_revision,seen_generation,availability,inspection_status) VALUES(?1,1,?2,?2,'wav','1',1,1,'available','indexed')",
                    params![seed.id, file],
                )
                .unwrap();
            transaction
                .execute(
                    "INSERT INTO tracks(id,file_id) VALUES(?1,?1)",
                    params![seed.id],
                )
                .unwrap();
            transaction
                .execute(
                    "INSERT INTO track_source_metadata(track_id,source_revision,tag_title,tag_artist,tag_album,tag_album_artist,track_number,disc_number,date,duration_ms,tag_status,artwork_status,artwork_hash,title,artist,album,album_artist,year,title_sort,artist_sort,album_sort,album_artist_sort,search_text,album_id,album_directory_id,album_relative_dir) VALUES(?1,1,?2,?3,?4,?5,?6,?7,?8,?9,'loaded','notPresent',?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)",
                    params![
                        seed.id,
                        seed.title,
                        seed.artist,
                        seed.album,
                        seed.album_artist,
                        seed.track,
                        seed.disc,
                        seed.date,
                        seed.duration_ms,
                        seed.artwork,
                        keys.title,
                        keys.artist,
                        keys.album,
                        keys.album_artist,
                        keys.year,
                        keys.title_sort,
                        keys.artist_sort,
                        keys.album_sort,
                        keys.album_artist_sort,
                        keys.search,
                        keys.album_id,
                        1,
                        keys.album_relative_dir
                    ],
                )
                .unwrap();
        }
        crate::library::sync::rebuild::rebuild_albums_and_artists(&transaction).unwrap();
        transaction.commit().unwrap();
    }

    fn sql(&self, sql: &str) {
        self.database.write().unwrap().execute(sql, []).unwrap();
    }

    /// Creates the audio files of tracks `ids` so playback can find them.
    fn touch_audio(&self, ids: impl IntoIterator<Item = i64>) {
        for id in ids {
            std::fs::write(self.music.join(format!("{id}.wav")), []).unwrap();
        }
    }

    fn tracks(
        &self,
        search: Option<&str>,
        sort: TrackSortKey,
        direction: SortDirection,
    ) -> Page<TrackListItem> {
        self.library
            .list_tracks(&request(search, sort, direction, 0, 1_000))
            .unwrap()
    }

    fn albums(&self, search: Option<&str>, sort: AlbumSortKey) -> Page<AlbumListItem> {
        self.library
            .list_albums(&request(search, sort, SortDirection::Ascending, 0, 1_000))
            .unwrap()
    }
}

const ASC: SortDirection = SortDirection::Ascending;
const DESC: SortDirection = SortDirection::Descending;

fn request<K>(
    search: Option<&str>,
    sort: K,
    direction: SortDirection,
    offset: u32,
    limit: u32,
) -> ListRequest<K> {
    ListRequest {
        search: search.map(str::to_owned),
        sort,
        direction,
        offset,
        limit,
    }
}

/// The rowids of a track page's rows, in order.
fn track_rowids(page: &Page<TrackListItem>) -> Vec<i64> {
    page.items.iter().map(|row| row.core.id.rowid()).collect()
}

fn count_rows(fixture: &Fixture, from: &str) -> i64 {
    fixture
        .database
        .read()
        .unwrap()
        .query_row(&format!("SELECT COUNT(*) FROM {from}"), [], |row| {
            row.get(0)
        })
        .unwrap()
}
