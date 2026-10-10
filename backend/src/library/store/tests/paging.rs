use super::*;

#[test]
fn album_pages_cover_every_album_once_and_refuse_a_foreign_cursor() {
    let fixture = fixture();
    let mut seeds: Vec<Seed> = Vec::new();
    let names: Vec<String> = (1..=105).map(|id| format!("Album {id:03}")).collect();
    for (index, name) in names.iter().enumerate() {
        seeds.push(Seed::new(index as i64 + 1, "Track", "Artist", name));
    }
    seeds.push(Seed::new(106, "Other track", "Other artist", "Other album"));
    fixture.add_all(&seeds);
    let store = &fixture.store;

    let first = store.catalog_albums(None, None, TITLE, ASC).unwrap();
    assert_eq!(
        (first.items.len(), first.total_count.unwrap_or(0)),
        (PAGE_SIZE, 106)
    );
    let cursor = first.next_cursor.clone().expect("next cursor");
    let second = store
        .catalog_albums(Some(&cursor), None, TITLE, ASC)
        .unwrap();
    assert_eq!(
        (second.items.len(), second.total_count),
        (6, None),
        "only the first page counts the list"
    );
    assert!(second.next_cursor.is_none());
    assert!(second.items[0].key.title > first.items[PAGE_SIZE - 1].key.title);
    let keys: HashSet<_> = first
        .items
        .iter()
        .chain(&second.items)
        .map(|album| album.key.clone())
        .collect();
    assert_eq!(keys.len(), 106, "every album exactly once");

    assert_eq!(
        store
            .catalog_albums(Some(&cursor), Some("different"), TITLE, ASC)
            .err(),
        Some(StoreError::InvalidCursor),
        "another search"
    );
    assert_eq!(
        store
            .catalog_albums(Some(&cursor), None, LibraryAlbumSortKey::Artist, ASC)
            .err(),
        Some(StoreError::InvalidCursor),
        "another sort"
    );
    assert_eq!(
        store.catalog_albums(Some(&cursor), None, TITLE, DESC).err(),
        Some(StoreError::InvalidCursor),
        "another direction"
    );
    let artist = |name: &str| LibraryAlbumArtistKey { name: name.into() };
    let artist_page = store
        .catalog_artist_albums(
            artist("Artist"),
            None,
            LibraryArtistAlbumSortKey::Title,
            ASC,
        )
        .unwrap();
    let artist_cursor = artist_page.next_cursor.expect("artist continuation");
    assert_eq!(
        store
            .catalog_artist_albums(
                artist("Other artist"),
                Some(&artist_cursor),
                LibraryArtistAlbumSortKey::Title,
                ASC
            )
            .err(),
        Some(StoreError::InvalidCursor),
        "another Album Artist"
    );
    let detail = store.catalog_artist(artist("Artist")).unwrap();
    assert_eq!((detail.album_count, detail.track_count), (105, 105));
}

#[test]
fn tracks_page_through_every_sort_and_direction_with_unknown_values_last() {
    let fixture = fixture();
    varied_library(&fixture);
    let store = &fixture.store;
    for key in [
        LibraryTrackSortKey::Title,
        LibraryTrackSortKey::Artist,
        LibraryTrackSortKey::Album,
        LibraryTrackSortKey::Duration,
    ] {
        for direction in [ASC, DESC] {
            let tracks = walk(|cursor| {
                let page = store.catalog_tracks(cursor, None, key, direction).unwrap();
                assert_eq!(
                    page.total_count,
                    cursor.is_none().then_some(330),
                    "only the first page counts the list"
                );
                (page.items, page.next_cursor)
            });
            let ids: HashSet<_> = tracks.iter().map(|track| track.id.clone()).collect();
            assert_eq!(
                (tracks.len(), ids.len()),
                (330, 330),
                "{key:?} {direction:?}: every track once"
            );
            let unknown = |track: &LibraryTrackSummary| match key {
                LibraryTrackSortKey::Title => false,
                LibraryTrackSortKey::Artist => track.artist.is_none(),
                LibraryTrackSortKey::Album => track.album.is_none(),
                LibraryTrackSortKey::Duration => track.duration_ms.is_none(),
            };
            let first_unknown = tracks.iter().position(unknown).unwrap_or(tracks.len());
            assert!(
                tracks[first_unknown..].iter().all(unknown),
                "{key:?} {direction:?}: unknown last"
            );
            let names: Vec<String> = tracks[..first_unknown]
                .iter()
                .map(|track| match key {
                    LibraryTrackSortKey::Title => track.title.to_lowercase(),
                    LibraryTrackSortKey::Artist => track.artist.clone().unwrap().to_lowercase(),
                    LibraryTrackSortKey::Album => track.album.clone().unwrap().to_lowercase(),
                    LibraryTrackSortKey::Duration => format!("{:08}", track.duration_ms.unwrap()),
                })
                .collect();
            let mut sorted = names.clone();
            sorted.sort();
            if direction == DESC {
                sorted.reverse();
            }
            assert_eq!(names, sorted, "{key:?} {direction:?}: in order");
        }
    }
}

#[test]
fn albums_and_album_artists_page_through_every_sort_and_direction() {
    let fixture = fixture();
    varied_library(&fixture);
    let store = &fixture.store;
    let total_albums = all_albums(store, None).total_count.unwrap_or(0);
    for key in [
        LibraryAlbumSortKey::Title,
        LibraryAlbumSortKey::Artist,
        LibraryAlbumSortKey::Year,
    ] {
        for direction in [ASC, DESC] {
            let albums = walk(|cursor| {
                let page = store.catalog_albums(cursor, None, key, direction).unwrap();
                (page.items, page.next_cursor)
            });
            let keys: HashSet<_> = albums.iter().map(|album| album.key.clone()).collect();
            assert_eq!(albums.len() as u64, total_albums, "{key:?} {direction:?}");
            assert_eq!(
                keys.len(),
                albums.len(),
                "{key:?} {direction:?}: every album once"
            );
            if key == LibraryAlbumSortKey::Year {
                let first_without = albums
                    .iter()
                    .position(|album| album.year.is_none())
                    .unwrap_or(albums.len());
                assert!(
                    albums[first_without..]
                        .iter()
                        .all(|album| album.year.is_none()),
                    "{direction:?}: no year last"
                );
                let years: Vec<_> = albums[..first_without]
                    .iter()
                    .map(|album| album.year.unwrap())
                    .collect();
                assert!(years.windows(2).all(|pair| if direction == ASC {
                    pair[0] <= pair[1]
                } else {
                    pair[0] >= pair[1]
                }));
            }
        }
    }
    let total_artists = store
        .catalog_album_artists(None, None, LibraryAlbumArtistSortKey::Artist, ASC)
        .unwrap()
        .total_count
        .unwrap_or(0);
    for key in [
        LibraryAlbumArtistSortKey::Artist,
        LibraryAlbumArtistSortKey::AlbumCount,
        LibraryAlbumArtistSortKey::TrackCount,
    ] {
        for direction in [ASC, DESC] {
            let artists = walk(|cursor| {
                let page = store
                    .catalog_album_artists(cursor, None, key, direction)
                    .unwrap();
                (page.items, page.next_cursor)
            });
            let names: HashSet<_> = artists
                .iter()
                .map(|artist| artist.key.name.clone())
                .collect();
            assert_eq!(
                (artists.len() as u64, names.len()),
                (total_artists, artists.len()),
                "{key:?} {direction:?}"
            );
            assert_eq!(
                artists.iter().map(|artist| artist.track_count).sum::<u64>(),
                330
            );
        }
    }
    for artist in ["beta", "Gamma", ""] {
        for key in [
            LibraryArtistAlbumSortKey::Title,
            LibraryArtistAlbumSortKey::Year,
        ] {
            for direction in [ASC, DESC] {
                let name = LibraryAlbumArtistKey {
                    name: artist.into(),
                };
                let first = store
                    .catalog_artist_albums(name.clone(), None, key, direction)
                    .unwrap();
                let albums = walk(|cursor| {
                    let page = store
                        .catalog_artist_albums(name.clone(), cursor, key, direction)
                        .unwrap();
                    (page.items, page.next_cursor)
                });
                assert_eq!(
                    albums.len() as u64,
                    first.total_count.unwrap_or(0),
                    "{artist:?} {key:?} {direction:?}"
                );
            }
        }
    }
}

#[test]
fn a_write_between_two_pages_neither_repeats_nor_skips_a_track() {
    let fixture = fixture();
    varied_library(&fixture);
    let store = &fixture.store;
    let first = store
        .catalog_tracks(None, None, LibraryTrackSortKey::Title, ASC)
        .unwrap();
    let last_of_first = first.items.last().unwrap().title.clone();

    // A scan lands tracks before and after the page boundary while the listener scrolls.
    fixture.add(Seed::new(1_000, "A before everything", "New", "New"));
    fixture.add(Seed::new(1_001, "zz after everything", "New", "New"));
    let rest = walk_from(first.next_cursor.clone(), |cursor| {
        let page = store
            .catalog_tracks(cursor, None, LibraryTrackSortKey::Title, ASC)
            .unwrap();
        (page.items, page.next_cursor)
    });

    let seen: HashSet<_> = first
        .items
        .iter()
        .chain(&rest)
        .map(|track| track.id.clone())
        .collect();
    assert_eq!(seen.len(), first.items.len() + rest.len(), "no track twice");
    assert!(
        !seen.contains("1000"),
        "inserted before the cursor, so not in the pages after it"
    );
    assert!(
        seen.contains("1001"),
        "inserted after the cursor, so reached"
    );
    assert!(rest
        .iter()
        .all(|track| track.title.to_lowercase() > last_of_first.to_lowercase()));
}

#[test]
fn the_name_sorted_lists_read_an_index_range_not_the_whole_table() {
    let fixture = fixture();
    varied_library(&fixture);
    let connection = fixture.database.read().unwrap();
    let mut plans: Vec<(String, Vec<String>)> = Vec::new();
    for key in [
        LibraryTrackSortKey::Title,
        LibraryTrackSortKey::Artist,
        LibraryTrackSortKey::Album,
        LibraryTrackSortKey::Duration,
    ] {
        for direction in [ASC, DESC] {
            let query = tracks_query(None, key, direction);
            for (phase, _) in query.ordering.phases.iter().enumerate() {
                for after in [false, true] {
                    plans.push((
                        format!("tracks {key:?} {direction:?} phase {phase} after {after}"),
                        query.plan(&connection, phase, after),
                    ));
                }
            }
        }
    }
    // The named half of each list reads an index range. (The few unnamed albums that follow are
    // sorted; there is one per Album Artist at most.)
    for key in [
        LibraryAlbumSortKey::Title,
        LibraryAlbumSortKey::Artist,
        LibraryAlbumSortKey::Year,
    ] {
        for direction in [ASC, DESC] {
            let query = albums_query(None, key, direction);
            let named: &[usize] = if key == LibraryAlbumSortKey::Year {
                &[0, 2]
            } else {
                &[0]
            };
            for &phase in named {
                for after in [false, true] {
                    plans.push((
                        format!("albums {key:?} {direction:?} phase {phase} after {after}"),
                        query.plan(&connection, phase, after),
                    ));
                }
            }
        }
    }
    for key in [
        LibraryAlbumArtistSortKey::Artist,
        LibraryAlbumArtistSortKey::AlbumCount,
        LibraryAlbumArtistSortKey::TrackCount,
    ] {
        for direction in [ASC, DESC] {
            let query = album_artists_query(None, key, direction);
            for after in [false, true] {
                plans.push((
                    format!("artists {key:?} {direction:?} after {after}"),
                    query.plan(&connection, 0, after),
                ));
            }
        }
    }
    let artist = LibraryAlbumArtistKey {
        name: "Artist".into(),
    };
    // An Album Artist's albums are few, so only their title order is held to an index range.
    for key in [LibraryArtistAlbumSortKey::Title] {
        for direction in [ASC, DESC] {
            let query = artist_albums_query(&artist, key, direction);
            for after in [false, true] {
                plans.push((
                    format!("artist albums {key:?} {direction:?} after {after}"),
                    query.plan(&connection, 0, after),
                ));
            }
        }
    }
    for (name, plan) in plans {
        let plan = plan.join(" | ");
        assert!(
            !plan.contains("FOR ORDER BY") && !plan.contains("FOR GROUP BY"),
            "{name} sorts: {plan}"
        );
        assert!(
            plan.contains("USING INDEX") || plan.contains("USING COVERING INDEX"),
            "{name} does not use an index: {plan}"
        );
    }
}

/// Measurement for the lazy queue (run with `--ignored --nocapture`): what starting playback
/// from a library of this size costs before the first track can load.
#[test]
#[ignore = "measurement, not a check"]
fn starting_from_a_huge_tracks_list_costs_one_narrow_query() {
    for count in [5_000i64, 50_000] {
        let fixture = fixture();
        let seeds: Vec<Seed> = (1..=count)
            .map(|id| {
                Seed::new(
                    id,
                    "Track",
                    "Artist",
                    ["Lp", "Ep", "Single"][id as usize % 3],
                )
            })
            .collect();
        fixture.add_all(&seeds);
        fixture.sql("UPDATE library_files SET availability='available'");
        let started = std::time::Instant::now();
        let selection = fixture
            .store
            .playback_for_tracks(None, LibraryTrackSortKey::Title, ASC, None)
            .unwrap();
        let ids_ms = started.elapsed().as_millis();
        let started = std::time::Instant::now();
        let ids: Vec<&str> = selection
            .track_ids
            .iter()
            .take(251)
            .map(String::as_str)
            .collect();
        let _ = fixture.store.playable_tracks(&ids).unwrap();
        let first_ms = started.elapsed().as_millis();
        println!(
            "{count} tracks: {} ids in {ids_ms} ms, first 251 tracks in {first_ms} ms",
            selection.track_ids.len()
        );
    }
}

#[test]
fn later_pages_count_nothing_and_album_pages_read_summaries_not_tracks() {
    let fixture = fixture();
    many_albums(&fixture);
    let store = &fixture.store;
    let check = |name: &str, tracks: bool, page: &dyn Fn(Option<&str>) -> Option<String>| {
        let mut first_cursor = None;
        let first = statements_of(&fixture, || first_cursor = page(None));
        let cursor = first_cursor.expect("a second page");
        let second = statements_of(&fixture, || drop(page(Some(&cursor))));
        assert_eq!(first.len(), 2, "{name}: a count and a page: {first:?}");
        assert!(first[0].contains("COUNT(*)"), "{name}: {first:?}");
        assert_eq!(second.len(), 1, "{name}: just the page: {second:?}");
        assert!(!second[0].contains("COUNT("), "{name}: {second:?}");
        for statement in first.iter().chain(&second) {
            assert!(
                !statement.contains("GROUP BY"),
                "{name} aggregates: {statement}"
            );
            assert!(
                tracks || !statement.contains("track_source_metadata"),
                "{name} reads tracks: {statement}"
            );
        }
    };
    for key in [LibraryAlbumSortKey::Title, LibraryAlbumSortKey::Year] {
        check(&format!("albums {key:?}"), false, &|cursor| {
            store
                .catalog_albums(cursor, None, key, ASC)
                .unwrap()
                .next_cursor
        });
    }
    for key in [
        LibraryAlbumArtistSortKey::Artist,
        LibraryAlbumArtistSortKey::AlbumCount,
        LibraryAlbumArtistSortKey::TrackCount,
    ] {
        check(&format!("artists {key:?}"), false, &|cursor| {
            store
                .catalog_album_artists(cursor, None, key, DESC)
                .unwrap()
                .next_cursor
        });
    }
    check("tracks", true, &|cursor| {
        store
            .catalog_tracks(cursor, None, LibraryTrackSortKey::Title, ASC)
            .unwrap()
            .next_cursor
    });
}

#[test]
fn the_scroll_index_follows_the_sort_order_for_mixed_scripts_in_both_directions() {
    let fixture = fixture();
    let titles = [
        "Apple",
        "あおい",
        "アイス",
        "いろは",
        "かな",
        "ガ",
        "漢字",
        "字",
        "Zed",
        "123",
        "(x)",
        "ほし",
        "ユズ",
        "Éclair",
        "ん",
        "Banana",
        "ちゃ",
        "한글",
        "Дом",
    ];
    let seeds: Vec<Seed> = titles
        .into_iter()
        .enumerate()
        .map(|(index, title)| Seed::new(index as i64 + 1, title, "Artist", "Album"))
        .collect();
    fixture.add_all(&seeds);
    let store = &fixture.store;
    for direction in [ASC, DESC] {
        let buckets = store
            .catalog_track_index(None, LibraryTrackSortKey::Title, direction)
            .unwrap();
        let tracks = store
            .catalog_tracks(None, None, LibraryTrackSortKey::Title, direction)
            .unwrap()
            .items;
        // Expanding the buckets gives each row's label, in the list's order.
        let expanded: Vec<&str> = buckets
            .iter()
            .flat_map(|bucket| std::iter::repeat_n(bucket.label.as_str(), bucket.count as usize))
            .collect();
        let labels: Vec<String> = tracks
            .iter()
            .map(|track| {
                crate::library::text::index_label(&crate::library::text::sort_key(
                    &track.title,
                    None,
                ))
            })
            .collect();
        assert_eq!(expanded, labels, "{direction:?}");
        let mut seen: Vec<&str> = buckets.iter().map(|bucket| bucket.label.as_str()).collect();
        seen.sort_unstable();
        seen.dedup();
        assert_eq!(
            seen.len(),
            buckets.len(),
            "{direction:?}: one run per label"
        );
    }
    let ascending: Vec<String> = store
        .catalog_track_index(None, LibraryTrackSortKey::Title, ASC)
        .unwrap()
        .into_iter()
        .map(|bucket| bucket.label)
        .collect();
    assert_eq!(
        ascending,
        ["#", "A", "B", "E", "Z", "Д", "あ", "か", "た", "は", "や", "わ", "漢", "한"],
        "symbols and digits, Latin, other scripts, kana rows, kanji as one bucket"
    );
    assert!(
        store
            .catalog_track_index(None, LibraryTrackSortKey::Duration, ASC)
            .unwrap()
            .is_empty(),
        "a list ordered by length has no letters"
    );
}

#[test]
fn the_scroll_index_of_albums_and_artists_counts_what_the_list_holds() {
    let fixture = fixture();
    let mut seeds = Vec::new();
    for (index, name) in ["Aa", "Ab", "いろは", "ユズ", "漢"].into_iter().enumerate() {
        let mut seed = Seed::new(index as i64 + 1, "T", name, name);
        seed.date = (index % 2 == 0).then_some("2001");
        seeds.push(seed);
    }
    fixture.add_all(&seeds);
    let store = &fixture.store;
    let pairs = |buckets: Vec<LibraryIndexBucket>| {
        buckets
            .into_iter()
            .map(|bucket| (bucket.label, bucket.count))
            .collect::<Vec<_>>()
    };
    let expected = |labels: &[(&str, u64)]| -> Vec<(String, u64)> {
        labels
            .iter()
            .map(|(label, count)| ((*label).to_owned(), *count))
            .collect()
    };

    let by_name = expected(&[("A", 2), ("あ", 1), ("や", 1), ("漢", 1)]);
    assert_eq!(
        pairs(store.catalog_album_index(None, TITLE, ASC).unwrap()),
        by_name
    );
    assert_eq!(
        pairs(
            store
                .catalog_album_artist_index(None, LibraryAlbumArtistSortKey::Artist, ASC)
                .unwrap()
        ),
        by_name
    );
    assert_eq!(
        pairs(store.catalog_album_index(None, TITLE, DESC).unwrap()),
        expected(&[("漢", 1), ("や", 1), ("あ", 1), ("A", 2)])
    );
    assert_eq!(
        pairs(
            store
                .catalog_album_index(None, LibraryAlbumSortKey::Year, ASC)
                .unwrap()
        ),
        expected(&[("2001", 3), ("?", 2)]),
        "years, then the undated"
    );
    assert!(store
        .catalog_album_artist_index(None, LibraryAlbumArtistSortKey::TrackCount, ASC)
        .unwrap()
        .is_empty());
    let filtered = store.catalog_album_index(Some("ゆず"), TITLE, ASC).unwrap();
    assert_eq!(
        pairs(filtered),
        expected(&[("や", 1)]),
        "the filter narrows it"
    );
}

#[test]
fn jumping_to_a_letter_in_a_huge_list_reads_only_the_target_region() {
    let fixture = fixture();
    let seeds: Vec<Seed> = (1..=50_000i64)
        .map(|id| {
            let letter = (b'A' + ((id - 1) / 2_000) as u8) as char;
            let mut seed = Seed::new(
                id,
                leak(format!("{letter}{id:05}")),
                leak(format!("Artist {}", id / 10)),
                leak(format!("Album {}", id / 10)),
            );
            seed.track = Some(id % 10);
            seed
        })
        .collect();
    fixture.add_all(&seeds);
    let store = &fixture.store;
    let buckets = store
        .catalog_track_index(None, LibraryTrackSortKey::Title, ASC)
        .unwrap();
    assert_eq!(
        buckets.iter().map(|bucket| bucket.count).sum::<u64>(),
        50_000
    );
    let target = buckets
        .iter()
        .position(|bucket| bucket.label == "M")
        .unwrap();
    let skip: u64 = buckets[..target].iter().map(|bucket| bucket.count).sum();

    let mut page = None;
    let statements = statements_of(&fixture, || {
        page = Some(
            store
                .catalog_tracks_from(None, skip, None, LibraryTrackSortKey::Title, ASC)
                .unwrap(),
        );
    });
    let page = page.unwrap();

    assert_eq!(page.items.len(), PAGE_SIZE);
    assert_eq!(page.items[0].title, "M24001", "the first M");
    assert_eq!(page.total_count, Some(50_000));
    assert!(page.next_cursor.is_some());
    assert!(
        statements.len() <= 4,
        "count, the row before, the page: {statements:?}"
    );
    let continued = store
        .catalog_tracks(
            page.next_cursor.as_deref(),
            None,
            LibraryTrackSortKey::Title,
            ASC,
        )
        .unwrap();
    assert_eq!(continued.items[0].title, "M24101");
}
