use super::*;

#[test]
fn a_track_without_a_title_is_named_after_its_file_in_playback_and_in_search() {
    let fixture = fixture();
    fixture.touch_audio([1]);
    fixture.add(Seed::new(1, "", "Artist", "Album"));
    fixture.sql(
        "UPDATE library_files SET file_name='multi.part.flac', relative_path='1.wav' WHERE id=1",
    );
    // The scanner derives the title from the file name; do the same for this renamed file.
    fixture.sql(
        "UPDATE track_source_metadata SET title_key='multi.part', title_sort='multi.part', search_key='multi.part'||char(31)||'artist'||char(31)||'album'||char(31)||'artist' WHERE track_id=1",
    );
    let store = &fixture.store;

    let selection = store
        .playback_for_tracks(None, LibraryTrackSortKey::Title, ASC, Some("1"))
        .unwrap();
    let ids: Vec<&str> = selection.track_ids.iter().map(String::as_str).collect();
    let tracks = store.playable_tracks(&ids).unwrap();
    let track = tracks[selection.start_index].as_ref().unwrap();
    assert_eq!(track.title, "multi.part");
    assert_eq!(
        track.album_key,
        Some(LibraryAlbumKey {
            title: "Album".into(),
            album_artist: "Artist".into(),
            album_edition: "1/".into()
        })
    );
    assert_eq!(track.album_track_count, Some(1));
    assert_eq!(
        store.playback_for_track("1").unwrap().album_track_count,
        Some(1)
    );
    let restored = store.playable_tracks(&["1", "999", "x"]).unwrap();
    assert_eq!(
        restored.iter().map(Option::is_some).collect::<Vec<_>>(),
        [true, false, false],
        "unknown ids come back as holes, in the order asked"
    );

    let by_stem = store
        .catalog_tracks(None, Some("multi.part"), LibraryTrackSortKey::Title, ASC)
        .unwrap();
    assert_eq!(
        (by_stem.items.len(), by_stem.total_count.unwrap_or(0)),
        (1, 1)
    );
    assert_eq!(by_stem.items[0].title, "multi.part");
    let by_extension = store
        .catalog_tracks(None, Some("flac"), LibraryTrackSortKey::Title, ASC)
        .unwrap();
    assert_eq!(
        (
            by_extension.items.len(),
            by_extension.total_count.unwrap_or(0)
        ),
        (0, 0)
    );
}

#[test]
fn track_playback_follows_the_list_order_and_skips_tracks_that_cannot_play() {
    let fixture = fixture();
    fixture.touch_audio(1..=4);
    for (id, title) in [(1, "Bravo"), (2, "Alpha"), (3, "Charlie"), (4, "Delta")] {
        fixture.add(Seed::new(id, title, "Artist", "Album"));
    }
    fixture.sql("UPDATE library_files SET availability='missing' WHERE id=4");
    let store = &fixture.store;

    let selection = store
        .playback_for_tracks(None, LibraryTrackSortKey::Title, DESC, Some("2"))
        .unwrap();
    assert_eq!(
        selection.track_ids,
        ["3", "1", "2"],
        "sorted as listed, missing skipped"
    );
    assert_eq!(selection.track_ids[selection.start_index], "2");
    let first = store.playable_tracks(&["3"]).unwrap().remove(0).unwrap();
    assert_eq!(first.album.as_deref(), Some("Album"));

    let filtered = store
        .playback_for_tracks(Some("alp"), LibraryTrackSortKey::Title, ASC, None)
        .unwrap();
    assert_eq!(filtered.track_ids, ["2"]);
    assert_eq!(
        store
            .playable_tracks(&["2"])
            .unwrap()
            .remove(0)
            .unwrap()
            .album_track_count,
        Some(4),
        "an album is counted whole, whatever the filter shows of it"
    );
    assert_eq!(
        store
            .playback_for_tracks(Some("alp"), LibraryTrackSortKey::Title, ASC, Some("1"))
            .err(),
        Some(PlaybackSourceError::TrackNotMember)
    );
    assert_eq!(
        store
            .playback_for_tracks(None, LibraryTrackSortKey::Title, ASC, Some("4"))
            .err(),
        Some(PlaybackSourceError::TrackUnavailable)
    );
}

#[test]
fn playing_what_the_list_shows_holds_for_every_sort_and_direction() {
    let fixture = fixture();
    let seeds: Vec<Seed> = (1..=40)
        .map(|id| {
            let mut seed = Seed::new(
                id,
                ["Zed", "alpha", "Mid"][id as usize % 3],
                ["", "Beta", "gamma"][id as usize % 3],
                ["Lp", "", "ep"][id as usize % 3],
            );
            seed.duration_ms = (id % 4 != 0).then_some(id * 37 % 11);
            seed
        })
        .collect();
    fixture.touch_audio(1..=40);
    fixture.add_all(&seeds);
    for key in [
        LibraryTrackSortKey::Title,
        LibraryTrackSortKey::Artist,
        LibraryTrackSortKey::Album,
        LibraryTrackSortKey::Duration,
    ] {
        for direction in [ASC, DESC] {
            let listed: Vec<String> = fixture
                .store
                .catalog_tracks(None, None, key, direction)
                .unwrap()
                .items
                .into_iter()
                .map(|track| track.id)
                .collect();
            let played: Vec<String> = fixture
                .store
                .playback_for_tracks(None, key, direction, None)
                .unwrap()
                .track_ids;
            assert_eq!(played, listed, "{key:?} {direction:?}");
        }
    }
}

#[test]
fn an_album_playback_sequence_is_complete_beyond_one_page() {
    let fixture = fixture();
    fixture.touch_audio(1..=101);
    let seeds: Vec<Seed> = (1..=101)
        .map(|id| Seed::new(id, "Track", "Artist", "Long Album"))
        .collect();
    fixture.add_all(&seeds);

    let selection = fixture
        .store
        .playback_for_album(
            &LibraryAlbumKey {
                title: "Long Album".into(),
                album_artist: "Artist".into(),
                album_edition: "1/".into(),
            },
            Some("101"),
        )
        .unwrap();

    assert_eq!(
        (selection.track_ids.len(), selection.start_index),
        (101, 100)
    );
}
