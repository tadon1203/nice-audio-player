use super::*;

#[test]
fn a_track_summary_carries_the_album_and_album_artist_ids() {
    let fixture = fixture();
    let mut filed = Seed::new(1, "Song", "Singer", " Record ");
    filed.album_artist = Some(" Band ");
    fixture.add_all(&[filed, Seed::new(2, "Single", "Singer", "")]);

    let summary = |id: &str| {
        fixture
            .store
            .catalog_tracks(
                None,
                None,
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .unwrap()
            .items
            .into_iter()
            .find(|track| track.core.id.rowid().to_string() == id)
            .unwrap()
    };

    let first = summary("1");
    let album_id = first.album.as_ref().unwrap().id;
    assert_eq!(
        fixture.store.catalog_album(album_id).unwrap().track_count,
        1,
        "the ID opens the album the catalog lists"
    );
    let album = first.album.as_ref().unwrap();
    assert_eq!(album.title, "Record");
    assert_eq!(album.artist.id, ArtistId::of("Band"));
    assert_eq!(album.artist.name, "Band");
    assert_eq!(summary("2").album, None, "no album tag, no album");
}

#[test]
fn a_track_summary_serializes_its_core_fields_flat_and_no_path() {
    let fixture = fixture();
    fixture.add(Seed::new(1, "Song", "Singer", "Record"));

    let summary = fixture
        .store
        .catalog_tracks(
            None,
            None,
            LibraryTrackSortKey::Title,
            LibrarySortDirection::Ascending,
        )
        .unwrap()
        .items
        .into_iter()
        .next()
        .unwrap();
    let json = serde_json::to_value(summary).unwrap();

    assert_eq!(json["title"], "Song");
    assert_eq!(json["state"], "playable");
    assert!(json.get("core").is_none(), "the core is flattened: {json}");
    assert!(
        json.as_object()
            .unwrap()
            .keys()
            .all(|key| !key.contains("path") && key != "file"),
        "a summary never carries a path: {json}"
    );
}

#[test]
fn a_track_location_is_found_by_id_and_stays_inside_its_root() {
    let fixture = fixture();
    fixture.touch_audio([1]);
    fixture.add(Seed::new(1, "Song", "Artist", "Album"));
    fixture.add(Seed::new(2, "Gone", "Artist", "Album"));
    fixture.add(Seed::new(3, "Escaping", "Artist", "Album"));
    fixture.sql("UPDATE library_files SET relative_path='../outside.wav' WHERE id=3");
    std::fs::write(fixture.music.parent().unwrap().join("outside.wav"), []).unwrap();
    let store = &fixture.store;

    let file = store
        .track_location(track_id_of(1))
        .unwrap()
        .existing()
        .unwrap();
    assert!(file.path.ends_with("1.wav") && file.path.starts_with(&file.root));
    assert_eq!(
        store.track_location(track_id_of(2)).unwrap().existing(),
        Err(Unavailable),
        "its file is gone"
    );
    assert_eq!(
        store.track_location(track_id_of(3)).unwrap().existing(),
        Err(Unavailable),
        "it leaves the root"
    );
    assert_eq!(
        store.track_location(track_id_of(99)).err(),
        Some(StoreError::TrackNotFound)
    );
}

#[test]
fn a_track_is_playable_missing_or_unsupported_by_its_file_alone() {
    let fixture = fixture();
    fixture.touch_audio([1, 3]);
    fixture.add_all(&[
        Seed::new(1, "Playable", "Artist", "Album"),
        Seed::new(2, "Missing", "Artist", "Album"),
        Seed::new(3, "Unsupported", "Artist", "Album"),
    ]);
    fixture.sql("UPDATE library_files SET availability='missing' WHERE id=2");
    fixture.sql("UPDATE library_files SET inspection_status='unsupported' WHERE id=3");
    let store = &fixture.store;

    let state_of = |id: i64| {
        store
            .catalog_tracks(
                None,
                None,
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .unwrap()
            .items
            .into_iter()
            .find(|track| track.core.id == track_id_of(id))
            .unwrap()
            .state
    };
    assert_eq!(state_of(1), TrackState::Playable);
    assert_eq!(state_of(2), TrackState::Missing);
    assert_eq!(state_of(3), TrackState::Unsupported);

    assert_eq!(
        store
            .track_properties(track_id_of(2))
            .unwrap()
            .unwrap()
            .state,
        TrackState::Missing,
        "the Properties view says the same"
    );
    assert!(
        store.playback_for_track(track_id_of(1)).is_ok(),
        "playback accepts the playable track"
    );
}

#[test]
fn track_properties_list_the_tags_and_the_files_path() {
    let fixture = fixture();
    let mut seed = Seed::new(1, "Song", "Singer", "Record");
    seed.date = Some("2001-02-03");
    fixture.add(seed);

    let properties = fixture
        .store
        .track_properties(track_id_of(1))
        .unwrap()
        .expect("properties");

    assert_eq!(properties.title.as_deref(), Some("Song"));
    assert_eq!(properties.date.as_deref(), Some("2001-02-03"));
    assert!(properties.path.ends_with("1.wav") && properties.path.contains("music"));
    assert!(
        fixture
            .store
            .track_properties(track_id_of(99))
            .unwrap()
            .is_none()
    );
}
