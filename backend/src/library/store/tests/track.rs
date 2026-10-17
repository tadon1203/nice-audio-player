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
            .find(|track| track.id.rowid().to_string() == id)
            .unwrap()
    };

    let album = summary("1").album.unwrap();
    assert_eq!(
        fixture.store.catalog_album(album.id).unwrap().track_count,
        1,
        "the ID opens the album the catalog lists"
    );
    assert_eq!(album.title, "Record");
    assert_eq!(album.artist_id, ArtistId::of("Band"));
    assert_eq!(summary("2").album, None, "no album tag, no album");
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
