use super::*;

#[test]
fn a_playable_track_carries_the_album_and_album_artist_ids() {
    let fixture = fixture();
    fixture.touch_audio([1, 2]);
    let mut filed = Seed::new(1, "Song", "Singer", "Record");
    filed.album_artist = Some("Band");
    fixture.add_all(&[filed, Seed::new(2, "Single", "Singer", "")]);
    let store = &fixture.store;

    let filed = store.playback_for_track(track_id_of(1)).unwrap();
    let album_id = filed.track.album.as_ref().unwrap().album.id;
    assert_eq!(
        store.catalog_album(album_id).unwrap().track_count,
        1,
        "the ID opens the album the playback names"
    );
    assert_eq!(
        filed.track.album.as_ref().unwrap().album.artist,
        ArtistRef {
            id: ArtistId::of("Band"),
            name: "Band".to_owned()
        }
    );
    let single = store.playback_for_track(track_id_of(2)).unwrap();
    assert_eq!(single.track.album, None, "no album tag, no album");
}

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
        "UPDATE track_source_metadata SET title='multi.part', title_sort='multi.part', search_text='multi.part'||char(31)||'artist'||char(31)||'album'||char(31)||'artist' WHERE track_id=1",
    );
    let store = &fixture.store;

    let selection = store
        .playback_for_tracks(
            &track_query(None, TrackSortKey::Title, ASC),
            Some(track_id_of(1)),
        )
        .unwrap();
    let tracks = store.playable_tracks(&selection.track_ids).unwrap();
    let track = tracks[selection.start_index].as_ref().unwrap();
    assert_eq!(track.track.core.title, "multi.part");
    let album = track
        .track
        .album
        .as_ref()
        .expect("a track with an album tag has an album");
    assert_eq!(album.album.artist.id, ArtistId::of("Artist"));
    assert_eq!(album.track_count, 1);
    assert_eq!(
        store
            .playback_for_track(track_id_of(1))
            .unwrap()
            .track
            .album
            .unwrap()
            .track_count,
        1
    );
    let restored = store
        .playable_tracks(&[track_id_of(1), track_id_of(999)])
        .unwrap();
    assert_eq!(
        restored.iter().map(Option::is_some).collect::<Vec<_>>(),
        [true, false],
        "unknown ids come back as holes, in the order asked"
    );

    let by_stem = store
        .catalog_tracks(None, Some("multi.part"), TrackSortKey::Title, ASC)
        .unwrap();
    assert_eq!(
        (by_stem.items.len(), by_stem.total_count.unwrap_or(0)),
        (1, 1)
    );
    assert_eq!(by_stem.items[0].core.title, "multi.part");
    let by_extension = store
        .catalog_tracks(None, Some("flac"), TrackSortKey::Title, ASC)
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
        .playback_for_tracks(
            &track_query(None, TrackSortKey::Title, DESC),
            Some(track_id_of(2)),
        )
        .unwrap();
    assert_eq!(
        selection.track_ids,
        [track_id_of(3), track_id_of(1), track_id_of(2)],
        "sorted as listed, missing skipped"
    );
    assert_eq!(selection.track_ids[selection.start_index], track_id_of(2));
    let first = store
        .playable_tracks(&[track_id_of(3)])
        .unwrap()
        .remove(0)
        .unwrap();
    assert_eq!(
        first.track.album.map(|album| album.album.title).as_deref(),
        Some("Album")
    );

    let filtered = store
        .playback_for_tracks(&track_query(Some("alp"), TrackSortKey::Title, ASC), None)
        .unwrap();
    assert_eq!(filtered.track_ids, [track_id_of(2)]);
    assert_eq!(
        store
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
        store
            .playback_for_tracks(
                &track_query(Some("alp"), TrackSortKey::Title, ASC),
                Some(track_id_of(1))
            )
            .err(),
        Some(PlaybackLookupError::Source(
            PlaybackSourceError::TrackNotMember
        ))
    );
    assert_eq!(
        store
            .playback_for_tracks(
                &track_query(None, TrackSortKey::Title, ASC),
                Some(track_id_of(4))
            )
            .err(),
        Some(PlaybackLookupError::Common(CommandError::TrackUnavailable))
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
    for key in [
        TrackSortKey::Title,
        TrackSortKey::Artist,
        TrackSortKey::Album,
        TrackSortKey::Duration,
    ] {
        for direction in [ASC, DESC] {
            let listed: Vec<String> = fixture
                .store
                .catalog_tracks(None, None, key, direction)
                .unwrap()
                .items
                .into_iter()
                .map(|track| track.core.id.rowid().to_string())
                .collect();
            let played: Vec<String> = fixture
                .store
                .playback_for_tracks(&track_query(None, key, direction), None)
                .unwrap()
                .track_ids
                .iter()
                .map(|id| id.rowid().to_string())
                .collect();
            assert_eq!(played, listed, "{key:?} {direction:?}");
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

    let album_id = all_albums(&fixture.store, None).items[0].id;

    let selection = fixture
        .store
        .playback_for_album_id(album_id, Some(track_id_of(101)))
        .unwrap();

    assert_eq!(
        (selection.track_ids.len(), selection.start_index),
        (101, 100)
    );
}
