use super::*;

#[test]
fn a_track_summary_carries_the_key_of_the_album_the_catalog_files_it_under() {
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
            .find(|track| track.id == id)
            .unwrap()
    };

    assert_eq!(
        summary("1").album_key,
        Some(LibraryAlbumKey {
            title: "Record".into(),
            album_artist: "Band".into(),
            album_edition: "1/".into()
        })
    );
    assert_eq!(summary("2").album_key, None, "no album tag, no album");
    let key = summary("1").album_key.unwrap();
    assert_eq!(
        fixture
            .store
            .catalog_album_details(key)
            .unwrap()
            .track_count,
        1,
        "the key opens the album the catalog lists"
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

    let file = store.track_location("1").unwrap().existing().unwrap();
    assert!(file.path.ends_with("1.wav") && file.path.starts_with(&file.root));
    assert_eq!(
        store.track_location("2").unwrap().existing(),
        Err(Unavailable),
        "its file is gone"
    );
    assert_eq!(
        store.track_location("3").unwrap().existing(),
        Err(Unavailable),
        "it leaves the root"
    );
    assert_eq!(
        store.track_location("99").err(),
        Some(StoreError::TrackNotFound)
    );
    assert_eq!(store.track_location("x").err(), Some(StoreError::InvalidId));
}

#[test]
fn track_properties_list_the_tags_and_the_files_path() {
    let fixture = fixture();
    let mut seed = Seed::new(1, "Song", "Singer", "Record");
    seed.date = Some("2001-02-03");
    fixture.add(seed);

    let properties = fixture
        .store
        .track_properties("1")
        .unwrap()
        .expect("properties");

    assert_eq!(properties.title.as_deref(), Some("Song"));
    assert_eq!(properties.date.as_deref(), Some("2001-02-03"));
    assert!(properties.path.ends_with("1.wav") && properties.path.contains("music"));
    assert!(fixture.store.track_properties("99").unwrap().is_none());
}
