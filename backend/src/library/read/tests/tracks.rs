use super::*;

#[test]
fn a_track_with_an_album_tag_carries_the_album_and_album_artist_ids() {
    let fixture = fixture();
    fixture.touch_audio([1, 2]);
    let mut filed = Seed::new(1, "Song", "Singer", "Record");
    filed.album_artist = Some("Band");
    fixture.add_all(&[filed, Seed::new(2, "Single", "Singer", "")]);
    let library = &fixture.library;

    let filed = library.playback_for_track(track_id_of(1)).unwrap();
    let album_id = filed.track.album.as_ref().unwrap().album.id;
    assert_eq!(
        library.album(album_id).unwrap().track_count,
        1,
        "the ID opens the album the playback names"
    );
    assert_eq!(
        filed.track.album.as_ref().unwrap().album.artist,
        AlbumArtistReference {
            id: ArtistId::of("Band"),
            name: "Band".to_owned()
        }
    );
    let single = library.playback_for_track(track_id_of(2)).unwrap();
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
    // A Library scan derives the title from the file name; do the same for this renamed file.
    fixture.sql(
        "UPDATE track_source_metadata SET title='multi.part', title_sort='multi.part', search_text='multi.part'||char(31)||'artist'||char(31)||'album'||char(31)||'artist' WHERE track_id=1",
    );
    let library = &fixture.library;

    let selection = library
        .playback_for_tracks(None, TrackSortKey::Title, ASC, Some(track_id_of(1)))
        .unwrap();
    let tracks = library.playable_tracks(&selection.track_ids).unwrap();
    let track = tracks[selection.start_index].as_ref().unwrap();
    assert_eq!(track.track.core.title, "multi.part");
    let album = track
        .track
        .album
        .as_ref()
        .expect("a track with an album tag has an album");
    assert_eq!(album.album.artist.id, ArtistId::of("Artist"));
    assert_eq!(album.track_count, 1);
    let restored = library
        .playable_tracks(&[track_id_of(1), track_id_of(999)])
        .unwrap();
    assert_eq!(
        restored.iter().map(Option::is_some).collect::<Vec<_>>(),
        [true, false],
        "unknown ids come back as holes, in the order asked"
    );

    let by_stem = fixture.tracks(Some("multi.part"), TrackSortKey::Title, ASC);
    assert_eq!((by_stem.items.len(), by_stem.total), (1, 1));
    assert_eq!(by_stem.items[0].core.title, "multi.part");
    let by_extension = fixture.tracks(Some("flac"), TrackSortKey::Title, ASC);
    assert_eq!((by_extension.items.len(), by_extension.total), (0, 0));
}
