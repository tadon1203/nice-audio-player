use super::*;

#[test]
fn an_album_list_by_year_is_indexed_by_year_with_the_undated_last() {
    let fixture = fixture();
    let mut dated = Seed::new(1, "A", "Band", "First");
    dated.date = Some("1990");
    let mut later = Seed::new(2, "B", "Band", "Second");
    later.date = Some("2004");
    fixture.add_all(&[dated, later, Seed::new(3, "C", "Band", "Third")]);

    let entries = fixture
        .library
        .album_index(&request(None, AlbumSortKey::Year, DESC, 0, 0))
        .unwrap();

    assert_eq!(
        entries
            .iter()
            .map(|entry| (entry.label.as_str(), entry.kind, entry.start, entry.count))
            .collect::<Vec<_>>(),
        [
            ("2004", LetterIndexEntryKind::Letter, 0, 1),
            ("1990", LetterIndexEntryKind::Letter, 1, 1),
            ("?", LetterIndexEntryKind::Unknown, 2, 1),
        ]
    );
}
