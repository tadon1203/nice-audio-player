use super::*;

#[test]
fn track_playback_follows_the_list_order_and_skips_tracks_that_cannot_play() {
    let fixture = fixture();
    fixture.touch_audio(1..=4);
    for (id, title) in [(1, "Bravo"), (2, "Alpha"), (3, "Charlie"), (4, "Delta")] {
        fixture.add(Seed::new(id, title, "Artist", "Album"));
    }
    fixture.sql("UPDATE library_files SET availability='missing' WHERE id=4");
    let library = &fixture.library;

    let selection = library
        .playback_for_tracks(None, TrackSortKey::Title, DESC, Some(track_id_of(2)))
        .unwrap();
    assert_eq!(
        selection.track_ids,
        [track_id_of(3), track_id_of(1), track_id_of(2)],
        "sorted as listed, missing skipped"
    );
    assert_eq!(selection.track_ids[selection.start_index], track_id_of(2));

    let filtered = library
        .playback_for_tracks(Some("alp"), TrackSortKey::Title, ASC, None)
        .unwrap();
    assert_eq!(filtered.track_ids, [track_id_of(2)]);
    assert_eq!(
        library
            .playable_tracks(&[track_id_of(2)])
            .unwrap()
            .remove(0)
            .unwrap()
            .track
            .album
            .unwrap()
            .track_count,
        4,
        "an album is counted whole, whatever the filter shows of it"
    );
    assert_eq!(
        library
            .playback_for_tracks(Some("alp"), TrackSortKey::Title, ASC, Some(track_id_of(1)))
            .code_of(),
        Some(CommandError::NotFound)
    );
    assert_eq!(
        library
            .playback_for_tracks(None, TrackSortKey::Title, ASC, Some(track_id_of(4)))
            .code_of(),
        Some(CommandError::TrackUnavailable)
    );
}

#[test]
fn playing_what_the_list_shows_holds_for_every_sort_and_direction() {
    let fixture = fixture();
    let seeds: Vec<Seed<'_>> = (1..=40)
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
    for sort in [
        TrackSortKey::Title,
        TrackSortKey::Artist,
        TrackSortKey::Album,
        TrackSortKey::Duration,
    ] {
        for direction in [ASC, DESC] {
            let listed = track_rowids(&fixture.tracks(None, sort, direction));
            let played: Vec<i64> = fixture
                .library
                .playback_for_tracks(None, sort, direction, None)
                .unwrap()
                .track_ids
                .iter()
                .map(|id| id.rowid())
                .collect();
            assert_eq!(played, listed, "{sort:?} {direction:?}");
        }
    }
}

#[test]
fn an_album_playback_sequence_is_complete_beyond_one_page() {
    let fixture = fixture();
    fixture.touch_audio(1..=101);
    let seeds: Vec<Seed<'_>> = (1..=101)
        .map(|id| Seed::new(id, "Track", "Artist", "Long Album"))
        .collect();
    fixture.add_all(&seeds);

    let album_id: AlbumId = fixture.albums(None, AlbumSortKey::Title).items[0].id;

    let selection = fixture
        .library
        .playback_for_album(album_id, Some(track_id_of(101)))
        .unwrap();

    assert_eq!(
        (selection.track_ids.len(), selection.start_index),
        (101, 100)
    );
    assert_eq!(
        fixture.library.list_album_tracks(album_id).unwrap().len(),
        101,
        "an album's tracks are listed whole"
    );
}
