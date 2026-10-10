use super::*;

#[test]
fn albums_keep_their_identity_and_take_the_cover_of_their_first_track_with_artwork() {
    let fixture = fixture();
    fixture.add_artwork(1, "image/jpeg", 'a');
    let second = fixture.add_artwork(2, "image/png", 'b');
    let mut one = Seed::new(1, "First", "Artist", "Shared");
    (one.album_artist, one.disc, one.track, one.artwork) =
        (Some("Album Artist"), Some(2), Some(1), Some(1));
    let mut two = Seed::new(2, "Needle", "Artist", "Shared");
    (two.album_artist, two.disc, two.track, two.artwork) =
        (Some("Album Artist"), Some(1), Some(2), Some(2));
    let mut other = Seed::new(3, "Percent %", "Other", "Other %_\\ album");
    (other.album_artist, other.disc, other.track) = (Some("Other artist"), None, None);
    fixture.add_all(&[one, two, other]);
    let store = &fixture.store;

    let all = all_albums(store, None);
    assert_eq!((all.items.len(), all.total_count.unwrap_or(0)), (2, 2));
    let shared = all
        .items
        .iter()
        .find(|album| album.key.title == "Shared")
        .unwrap();
    assert_eq!(shared.key.album_artist, "Album Artist");
    let cover = shared.artwork.as_ref().expect("a cover");
    assert_eq!(
        (cover.content_hash.as_str(), cover.mime_type),
        (
            second.as_str(),
            crate::library::artwork::ArtworkMimeType::Png
        ),
        "disc 1 comes before disc 2"
    );

    assert!(
        all_albums(store, Some("Needle")).items.is_empty(),
        "albums are not found by a track title"
    );
    let by_title = all_albums(store, Some("Shared"));
    assert_eq!(
        (by_title.items.len(), by_title.total_count.unwrap_or(0)),
        (1, 1)
    );
    for literal in ["%", "_", "\\"] {
        let found = all_albums(store, Some(literal));
        assert_eq!(
            found.items.len(),
            1,
            "{literal:?} is searched for literally"
        );
        assert_eq!(found.items[0].key.title, "Other %_\\ album");
    }
    let by_artist = all_albums(store, Some("Album Artist"));
    assert_eq!(by_artist.items[0].key.album_artist, "Album Artist");

    let artists = store
        .catalog_album_artists(None, None, LibraryAlbumArtistSortKey::Artist, ASC)
        .unwrap();
    assert_eq!(
        (artists.items.len(), artists.total_count.unwrap_or(0)),
        (2, 2)
    );
    assert_eq!(
        (artists.items[0].album_count, artists.items[0].track_count),
        (1, 2)
    );
    let artist_albums = store
        .catalog_artist_albums(
            LibraryAlbumArtistKey {
                name: "Album Artist".into(),
            },
            None,
            LibraryArtistAlbumSortKey::Year,
            ASC,
        )
        .unwrap();
    assert_eq!(
        (
            artist_albums.items.len(),
            artist_albums.total_count.unwrap_or(0)
        ),
        (1, 1)
    );
    assert_eq!(artist_albums.items[0].key.title, "Shared");

    let shared_key = LibraryAlbumKey {
        title: "Shared".into(),
        album_artist: "Album Artist".into(),
        album_edition: "1/".into(),
    };
    let details = store.catalog_album_details(shared_key.clone()).unwrap();
    assert_eq!(details.track_count, 2);
    let tracks = store.catalog_album_tracks(shared_key, None).unwrap();
    assert_eq!(
        (tracks.items.len(), tracks.total_count.unwrap_or(0)),
        (2, 2)
    );
    assert_eq!(
        tracks
            .items
            .iter()
            .map(|track| track.id.as_str())
            .collect::<Vec<_>>(),
        ["2", "1"],
        "disc 1 first"
    );
    assert_eq!(
        store
            .catalog_albums(Some("not-json"), None, TITLE, ASC)
            .err(),
        Some(StoreError::InvalidCursor)
    );
}

#[test]
fn an_album_is_found_playable_and_reported_missing_by_its_key() {
    let fixture = fixture();
    fixture.touch_audio([1, 2, 3]);
    let mut one = Seed::new(1, "One", "Artist", "Shared");
    one.album_artist = Some("Album Artist");
    let mut two = Seed::new(2, "Two", "Artist", "Shared");
    two.album_artist = Some("Album Artist");
    fixture.add_all(&[one, two, Seed::new(3, "Three", "Other", "Elsewhere")]);
    let store = &fixture.store;
    let shared = LibraryAlbumKey {
        title: "Shared".into(),
        album_artist: "Album Artist".into(),
        album_edition: "1/".into(),
    };

    let blank = LibraryAlbumKey {
        title: " ".into(),
        album_artist: "Album Artist".into(),
        album_edition: "1/".into(),
    };
    assert_eq!(
        store.playback_for_album(&blank, None).err(),
        Some(PlaybackSourceError::InvalidAlbumKey)
    );
    assert_eq!(
        store.playback_for_album(&shared, Some("3")).err(),
        Some(PlaybackSourceError::TrackNotMember)
    );
    assert_eq!(
        store.playback_for_album(&shared, Some("not-an-id")).err(),
        Some(PlaybackSourceError::InvalidTrackId)
    );
    let missing = LibraryAlbumKey {
        title: "Nope".into(),
        album_artist: "Nobody".into(),
        album_edition: "1/".into(),
    };
    assert_eq!(
        store.playback_for_album(&missing, None).err(),
        Some(PlaybackSourceError::AlbumNotFound)
    );

    fixture.sql("UPDATE library_files SET availability='missing' WHERE id IN (1,2)");
    assert_eq!(
        store.playback_for_album(&shared, Some("1")).err(),
        Some(PlaybackSourceError::TrackUnavailable)
    );
    assert_eq!(
        store.playback_for_album(&shared, None).err(),
        Some(PlaybackSourceError::NoPlayableTracks)
    );
}

#[test]
fn an_album_is_case_sensitive_and_a_missing_album_artist_is_the_artist() {
    let fixture = fixture();
    fixture.add(Seed::new(1, "Upper", "Performer", "Case"));
    fixture.add(Seed::new(2, "Lower", "Performer", "case"));
    let mut fallback = Seed::new(3, "Fallback", "Fallback Artist", "Fallback album");
    fallback.album_artist = None;
    fixture.add(fallback);
    let store = &fixture.store;

    let albums = all_albums(store, None);
    let performer: Vec<_> = albums
        .items
        .iter()
        .filter(|album| album.key.album_artist == "Performer")
        .map(|album| album.key.title.as_str())
        .collect();
    assert_eq!(performer, ["Case", "case"]);
    assert_eq!(albums.items.len(), 3);
    let tracks_of = |title: &str, artist: &str| {
        store
            .catalog_album_details(LibraryAlbumKey {
                title: title.into(),
                album_artist: artist.into(),
                album_edition: "1/".into(),
            })
            .unwrap()
            .track_count
    };
    assert_eq!(tracks_of("Case", "Performer"), 1);
    assert_eq!(tracks_of("case", "Performer"), 1);
    assert_eq!(tracks_of("Fallback album", "Fallback Artist"), 1);
    let artist = store
        .catalog_artist(LibraryAlbumArtistKey {
            name: "Fallback Artist".into(),
        })
        .unwrap();
    assert_eq!((artist.album_count, artist.track_count), (1, 1));
}

#[test]
fn an_album_artist_shows_only_the_cover_of_its_first_album() {
    let fixture = fixture();
    fixture.add_artwork(1, "image/jpeg", 'c');
    fixture.add(Seed::new(1, "First", "Artist", "Album 1"));
    let mut later = Seed::new(2, "Later", "Artist", "Album 2");
    later.artwork = Some(1);
    fixture.add(later);

    let artists = fixture
        .store
        .catalog_album_artists(None, None, LibraryAlbumArtistSortKey::Artist, ASC)
        .unwrap();

    assert_eq!((artists.items.len(), artists.items[0].track_count), (1, 2));
    assert!(artists.items[0].artwork.is_none());
    let artist = fixture
        .store
        .catalog_artist(LibraryAlbumArtistKey {
            name: "Artist".into(),
        })
        .unwrap();
    assert!(artist.artwork.is_none());
}

#[test]
fn a_year_is_the_same_on_the_grid_the_details_header_and_in_playback() {
    let fixture = fixture();
    fixture.touch_audio([1, 2, 3, 4]);
    let dated = |id, date| {
        let mut seed = Seed::new(
            id,
            "Track",
            "Artist",
            ["Dated", "Dated", "Placeholder", "Odd"][id as usize - 1],
        );
        seed.date = Some(date);
        seed
    };
    fixture.add_all(&[
        dated(1, "1999-05-03"),
        dated(2, "0000-01-01"),
        dated(3, "0000"),
        dated(4, "12"),
    ]);
    let store = &fixture.store;
    let key = |title: &str| LibraryAlbumKey {
        title: title.into(),
        album_artist: "Artist".into(),
        album_edition: "1/".into(),
    };

    let grid = all_albums(store, None);
    let year_of = |title: &str| {
        grid.items
            .iter()
            .find(|album| album.key.title == title)
            .unwrap()
            .year
    };
    assert_eq!(year_of("Dated"), Some(1999));
    assert_eq!(year_of("Placeholder"), None, "0000 is no year");
    assert_eq!(year_of("Odd"), None, "two digits are no year");
    assert_eq!(
        store
            .catalog_album_details(key("Dated"))
            .unwrap()
            .summary
            .year,
        Some(1999)
    );
    assert_eq!(
        store
            .catalog_album_details(key("Placeholder"))
            .unwrap()
            .summary
            .year,
        None
    );
    let playback = store.playback_for_album(&key("Dated"), None).unwrap();
    let ids: Vec<&str> = playback.track_ids.iter().map(String::as_str).collect();
    let years: Vec<_> = store
        .playable_tracks(&ids)
        .unwrap()
        .iter()
        .map(|track| track.as_ref().unwrap().year)
        .collect();
    assert_eq!(
        years,
        [Some(1999), None],
        "the track with the placeholder date has no year"
    );
}

#[test]
fn album_details_count_the_tracks_once_and_name_the_first_playable_one() {
    let fixture = fixture();
    let mut one = Seed::new(1, "One", "Artist", "Album");
    one.duration_ms = Some(1_000);
    let mut two = Seed::new(2, "Two", "Artist", "Album");
    two.duration_ms = Some(2_500);
    let mut three = Seed::new(3, "Three", "Artist", "Album");
    three.duration_ms = Some(500);
    fixture.add_all(&[one, two, three]);
    fixture.sql("UPDATE library_files SET availability='missing' WHERE id=1");
    let key = LibraryAlbumKey {
        title: "Album".into(),
        album_artist: "Artist".into(),
        album_edition: "1/".into(),
    };

    let details = fixture.store.catalog_album_details(key.clone()).unwrap();
    let tracks = fixture.store.catalog_album_tracks(key, None).unwrap();

    assert_eq!(details.track_count, 3);
    assert_eq!(tracks.total_count.unwrap_or(0), 3);
    assert_eq!(details.duration_ms, Some(4_000));
    assert_eq!(
        details.first_playable_track_id.as_deref(),
        Some("2"),
        "track 1 is missing"
    );
}

#[test]
fn a_filter_folds_kana_and_width_and_still_matches_wildcards_literally() {
    let fixture = fixture();
    let mut yuzu = Seed::new(1, "ユズ", "ゆず", "ユズ Best");
    yuzu.album_artist = Some("ゆず");
    let mut wide = Seed::new(2, "ＡＢＣ", "Half Width", "Wide");
    wide.album_artist = Some("Half Width");
    let mut symbols = Seed::new(3, "100% pure", "Under_score", "Back\\slash");
    symbols.album_artist = Some("Under_score");
    fixture.add_all(&[yuzu, wide, symbols, Seed::new(4, "Plain", "Plain", "Plain")]);
    let store = &fixture.store;
    let tracks = |search: &str| {
        store
            .catalog_tracks(None, Some(search), LibraryTrackSortKey::Title, ASC)
            .unwrap()
            .items
            .into_iter()
            .map(|track| track.title)
            .collect::<Vec<_>>()
    };

    assert_eq!(tracks("ゆず"), ["ユズ"], "hiragana finds katakana");
    assert_eq!(tracks("ユズ"), ["ユズ"]);
    assert_eq!(tracks("ﾕｽﾞ"), ["ユズ"], "half-width katakana");
    assert_eq!(tracks("abc"), ["ＡＢＣ"]);
    assert_eq!(tracks("ＡＢＣ"), ["ＡＢＣ"], "full-width finds full-width");
    assert_eq!(tracks("%"), ["100% pure"]);
    assert_eq!(
        tracks("％"),
        ["100% pure"],
        "a full-width percent is a literal one"
    );
    assert_eq!(tracks("_"), ["100% pure"]);
    assert_eq!(tracks("\\"), ["100% pure"]);
    assert_eq!(tracks("p_re"), Vec::<String>::new(), "_ is not a wildcard");

    let albums = store
        .catalog_albums(None, Some("ゆず"), TITLE, ASC)
        .unwrap();
    assert_eq!(albums.items.len(), 1);
    assert_eq!(albums.items[0].key.title, "ユズ Best");
    let artists = store
        .catalog_album_artists(None, Some("ﾕｽﾞ"), LibraryAlbumArtistSortKey::Artist, ASC)
        .unwrap();
    assert_eq!(artists.items.len(), 1);
    assert_eq!(artists.items[0].key.name, "ゆず");
    let none = store
        .catalog_album_artists(None, Some("%"), LibraryAlbumArtistSortKey::Artist, ASC)
        .unwrap();
    assert_eq!(none.items.len(), 0, "% is not a wildcard");
}
