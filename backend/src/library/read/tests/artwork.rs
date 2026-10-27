use super::*;

#[test]
fn artwork_collection_deletes_what_no_track_uses_and_keeps_the_rest() {
    use crate::library::read::artwork::{ArtworkMimeType, original_path};
    use crate::library::sync::artwork;
    let fixture = fixture();
    let data = fixture.database.data_dir().to_path_buf();
    let used = artwork::store_artwork(&data, b"used image", ArtworkMimeType::Png).unwrap();
    let unused = artwork::store_artwork(&data, b"unused image", ArtworkMimeType::Png).unwrap();
    fixture.add(Seed::new(1, "A", "Apple", "x"));
    fixture
        .database
        .write()
        .unwrap()
        .execute(
            "INSERT INTO artwork(hash, mime, has_thumbnail, byte_length)
         VALUES(?1, 'image/png', 0, 10), (?2, 'image/png', 0, 12)",
            params![used.hash.as_str(), unused.hash.as_str()],
        )
        .unwrap();
    fixture
        .database
        .write()
        .unwrap()
        .execute(
            "UPDATE track_source_metadata SET artwork_hash = ?1 WHERE track_id = 1",
            params![used.hash.as_str()],
        )
        .unwrap();
    let used_path = data.join(original_path(&used.hash, used.mime_type));
    let unused_path = data.join(original_path(&unused.hash, unused.mime_type));

    artwork::delete_unreferenced_artwork(&fixture.database).unwrap();

    assert!(used_path.exists(), "a track still uses it");
    assert!(!unused_path.exists(), "no track uses it");
    assert_eq!(count_rows(&fixture, "artwork"), 1);
    assert_eq!(
        count_rows(
            &fixture,
            "track_source_metadata WHERE artwork_hash IS NOT NULL"
        ),
        1
    );
}
