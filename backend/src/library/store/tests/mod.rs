//! The read side over a seeded database: what the catalog lists, how it pages, how playback
//! selections are resolved.

use super::{
    catalog::{album_artists_query, albums_query, artist_albums_query, tracks_query},
    paging::PAGE_SIZE,
    LibraryStore, PlaybackSourceError,
};
use crate::library::{
    database::Database,
    error::StoreError,
    keys::{album_edition_of, SortTags, TrackKeys},
    location::Unavailable,
    models::*,
    summary,
};
use crate::test_support::TestDirectory;
use rusqlite::params;
use std::collections::HashSet;
use std::path::PathBuf;

mod catalog;
mod paging;
mod playback;
mod track;

struct Fixture {
    _directory: TestDirectory,
    music: PathBuf,
    database: Database,
    store: LibraryStore,
}

/// One track to put in the database, with the tags the scanner would have read.
#[derive(Clone, Copy)]
struct Seed<'a> {
    id: i64,
    title: &'a str,
    artist: &'a str,
    album: &'a str,
    album_artist: Option<&'a str>,
    disc: Option<i64>,
    track: Option<i64>,
    artwork: Option<i64>,
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
    let database = Database::initialize(&directory.file("data")).expect("database");
    database
        .write()
        .unwrap()
        .execute(
            "INSERT INTO library_roots(id,path,enabled,scan_generation) VALUES(1,?1,1,0)",
            params![music.to_string_lossy()],
        )
        .unwrap();
    Fixture {
        store: LibraryStore::new(database.clone()),
        _directory: directory,
        music,
        database,
    }
}

impl Fixture {
    fn add(&self, seed: Seed<'_>) {
        self.add_all(&[seed]);
    }

    /// Writes tracks the way the scanner does: the tags, and the keys computed from them.
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
                &album_edition_of(1, &file),
            );
            transaction
                .execute(
                    "INSERT INTO library_files(id,root_id,relative_path,file_name,extension,modification_key,source_revision,seen_generation,availability,inspection_status) VALUES(?1,1,?2,?2,'wav','1',1,1,'available','indexed')",
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
                    "INSERT INTO track_source_metadata(track_id,source_revision,title,artist,album,album_artist,track_number,disc_number,date,duration_ms,tag_status,artwork_status,artwork_id,title_key,artist_key,album_key,album_artist_key,year,title_sort,artist_sort,album_sort,album_artist_sort,search_key,album_dir) VALUES(?1,1,?2,?3,?4,?5,?6,?7,?8,?9,'loaded','notPresent',?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",
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
                        keys.album_folder
                    ],
                )
                .unwrap();
        }
        summary::rebuild(&transaction).unwrap();
        transaction.commit().unwrap();
    }

    fn add_artwork(&self, id: i64, mime: &str, fill: char) -> String {
        let hash = fill.to_string().repeat(64);
        let extension = if mime == "image/png" { "png" } else { "jpg" };
        self.database
            .write()
            .unwrap()
            .execute(
                "INSERT INTO artwork_assets(id,content_hash,mime_type,relative_path,byte_length) VALUES(?1,?2,?3,?4,1)",
                params![id, hash, mime, format!("artwork/{0}{0}/{1}.{2}", fill, hash, extension)],
            )
            .unwrap();
        hash
    }

    fn sql(&self, sql: &str) {
        self.database.write().unwrap().execute(sql, []).unwrap();
    }

    /// Creates the audio files of tracks 1..=`count` so playback can find them.
    fn touch_audio(&self, ids: impl IntoIterator<Item = i64>) {
        for id in ids {
            std::fs::write(self.music.join(format!("{id}.wav")), []).unwrap();
        }
    }
}

const TITLE: LibraryAlbumSortKey = LibraryAlbumSortKey::Title;
const ASC: LibrarySortDirection = LibrarySortDirection::Ascending;
const DESC: LibrarySortDirection = LibrarySortDirection::Descending;

fn all_albums(store: &LibraryStore, search: Option<&str>) -> LibraryAlbumPage {
    store.catalog_albums(None, search, TITLE, ASC).unwrap()
}

/// Every page of a list, in order.
fn walk<T>(page: impl FnMut(Option<&str>) -> (Vec<T>, Option<String>)) -> Vec<T> {
    walk_from(None, page)
}

/// Every page of a list after `cursor`, in order.
fn walk_from<T>(
    mut cursor: Option<String>,
    mut page: impl FnMut(Option<&str>) -> (Vec<T>, Option<String>),
) -> Vec<T> {
    let mut items = Vec::new();
    loop {
        let (page_items, next) = page(cursor.as_deref());
        items.extend(page_items);
        match next {
            Some(next) => cursor = Some(next),
            None => return items,
        }
    }
}

fn varied_library(fixture: &Fixture) {
    let artists = ["", "beta", "Gamma", "alpha", "Beta"];
    let albums = ["Lp", "", "ep", "LP", "Zeta"];
    let titles: Vec<String> = (1..=330)
        .map(|id| format!("Title {}", id * 7 % 330))
        .collect();
    let seeds: Vec<Seed> = (1..=330)
        .map(|id| {
            let mut seed = Seed::new(
                id,
                &titles[id as usize - 1],
                artists[id as usize % 5],
                albums[id as usize % 5],
            );
            seed.album_artist = (id % 4 != 0).then_some(artists[id as usize % 5]);
            seed.duration_ms = (id % 3 != 0).then_some(id * 13 % 200);
            seed.date =
                (id % 6 != 0).then_some(["1990", "2004", "0000", "1975-02"][id as usize % 4]);
            seed.disc = (id % 7 != 0).then_some(id % 2 + 1);
            seed.track = (id % 5 != 0).then_some(id);
            seed
        })
        .collect();
    fixture.add_all(&seeds);
}

static STATEMENTS: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

fn record_statement(sql: &str) {
    STATEMENTS.lock().unwrap().push(sql.to_owned());
}

/// The statements `run` executes on the store's read connection.
#[allow(deprecated)] // `trace_v2` takes a closure-less callback too, and this is all a test needs
fn statements_of(fixture: &Fixture, run: impl FnOnce()) -> Vec<String> {
    // The pool hands its idle connection to the next read, which is the store's.
    let mut connection = fixture.database.read().unwrap();
    connection.connection_mut().trace(Some(record_statement));
    drop(connection);
    STATEMENTS.lock().unwrap().clear();
    run();
    let mut connection = fixture.database.read().unwrap();
    connection.connection_mut().trace(None);
    drop(connection);
    std::mem::take(&mut *STATEMENTS.lock().unwrap())
}

fn leak(text: String) -> &'static str {
    Box::leak(text.into_boxed_str())
}

fn many_albums(fixture: &Fixture) {
    let seeds: Vec<Seed> = (1..=250)
        .map(|id| {
            let artist = leak(format!("Artist {id:03}"));
            let mut seed = Seed::new(id, "Song", artist, leak(format!("Album {id:03}")));
            seed.date = Some(["1990", "2004", "1975-02"][id as usize % 3]);
            seed
        })
        .collect();
    fixture.add_all(&seeds);
}
