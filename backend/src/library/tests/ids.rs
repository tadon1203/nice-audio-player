//! The IDs of tracks, albums and Album Artists across scans (see `ids.rs`): a rescan keeps them,
//! a removed directory that comes back gets its album IDs again, and a changed album tag makes a
//! new album.

use super::scan::{Fixture, fixture, run_scan, tagged_tone, track_ids_by_path, write_tone};
use crate::library::roots;
use lofty::tag::ItemKey::{AlbumTitle, TrackArtist, TrackTitle};

fn album_ids(fixture: &Fixture) -> Vec<String> {
    let connection = fixture.database.read().unwrap();
    connection
        .prepare("SELECT id FROM albums ORDER BY id")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

/// Two files of one album, by one artist.
fn write_album(fixture: &Fixture, album: &str) {
    std::fs::create_dir_all(fixture.music.join("Solo")).unwrap();
    for number in ["1", "2"] {
        tagged_tone(
            &fixture.music.join("Solo").join(format!("{number}.wav")),
            800,
            &[
                (TrackTitle, &format!("Song {number}")),
                (TrackArtist, "X"),
                (AlbumTitle, album),
            ],
        );
    }
}

#[test]
fn a_rescan_keeps_the_track_and_album_ids() {
    let fixture = fixture();
    write_album(&fixture, "Record");
    run_scan(&fixture, false);
    let tracks = track_ids_by_path(&fixture);
    let albums = album_ids(&fixture);

    run_scan(&fixture, false);

    assert_eq!(track_ids_by_path(&fixture), tracks);
    assert_eq!(album_ids(&fixture), albums);
}

#[test]
fn a_removed_directory_that_comes_back_gets_the_same_album_ids() {
    let fixture = fixture();
    write_album(&fixture, "Record");
    run_scan(&fixture, false);
    let albums = album_ids(&fixture);

    std::fs::remove_dir_all(fixture.music.join("Solo")).unwrap();
    run_scan(&fixture, false);
    roots::delete_missing(&fixture.database).unwrap();
    assert_eq!(album_ids(&fixture).len(), 0);
    write_album(&fixture, "Record");
    run_scan(&fixture, false);

    assert_eq!(album_ids(&fixture), albums);
}

#[test]
fn a_changed_album_tag_makes_a_new_album() {
    let fixture = fixture();
    write_album(&fixture, "Record");
    run_scan(&fixture, false);
    let before = album_ids(&fixture);

    write_album(&fixture, "Records");
    run_scan(&fixture, false);

    let after = album_ids(&fixture);
    assert_eq!(after.len(), 1);
    assert_ne!(after, before);
}

#[test]
fn a_deleted_track_id_is_not_used_again() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 8_000);
    write_tone(&fixture.music.join("b.wav"), 16_000);
    run_scan(&fixture, false);
    let deleted = track_ids_by_path(&fixture)
        .into_iter()
        .find(|(path, _)| path == "b.wav")
        .map(|(_, id)| id)
        .unwrap();

    std::fs::remove_file(fixture.music.join("b.wav")).unwrap();
    run_scan(&fixture, false);
    roots::delete_missing(&fixture.database).unwrap();
    write_tone(&fixture.music.join("c.wav"), 24_000);
    run_scan(&fixture, false);

    let created = track_ids_by_path(&fixture)
        .into_iter()
        .find(|(path, _)| path == "c.wav")
        .map(|(_, id)| id)
        .unwrap();
    assert!(created > deleted, "{created} is new, {deleted} was used");
}

#[test]
fn a_compilation_stays_one_album_under_various_artists_across_a_rescan() {
    let fixture = fixture();
    std::fs::create_dir_all(fixture.music.join("Hits")).unwrap();
    for (number, artist) in [("1", "A"), ("2", "B"), ("3", "C")] {
        tagged_tone(
            &fixture.music.join("Hits").join(format!("{number}.wav")),
            800,
            &[
                (TrackTitle, &format!("Song {number}")),
                (TrackArtist, artist),
                (AlbumTitle, "Hits"),
            ],
        );
    }
    run_scan(&fixture, false);
    let albums = album_ids(&fixture);

    run_scan(&fixture, false);

    assert_eq!(album_ids(&fixture), albums);
    assert_eq!(albums.len(), 1);
    let connection = fixture.database.read().unwrap();
    let album_artist: String = connection
        .query_row("SELECT album_artist FROM albums", [], |row| row.get(0))
        .unwrap();
    assert_eq!(album_artist, "Various Artists");
}

#[test]
fn a_missing_track_relinks_to_the_same_track_id() {
    let fixture = fixture();
    write_tone(&fixture.music.join("loose.wav"), 24_000);
    run_scan(&fixture, false);
    let before = track_ids_by_path(&fixture);

    std::fs::rename(
        fixture.music.join("loose.wav"),
        fixture.music.join("renamed.wav"),
    )
    .unwrap();
    run_scan(&fixture, false);

    let after = track_ids_by_path(&fixture);
    let id = |tracks: &[(String, i64)], path: &str| {
        tracks.iter().find(|(p, _)| p == path).map(|(_, id)| *id)
    };
    assert_eq!(id(&after, "renamed.wav"), id(&before, "loose.wav"));
}
