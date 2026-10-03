//! How the Library compares and orders names, so the sort order, the filter and the scroll index
//! of a list agree with each other for Japanese as well as Latin titles.
//!
//! Every name is *folded*: NFKC (full-width and half-width forms become one), katakana become
//! hiragana, letters lowercase, Latin accents drop. A name is sorted by its folded form (or the
//! tag's SortOrder, folded), searched by it, and filed in the scroll index by its first character.
//! Kanji have no reading to sort by, so they sort by code point and share one index bucket.

use unicode_normalization::UnicodeNormalization;

/// Put in front of a sort key that starts with something other than a letter or a digit, so
/// symbols come first as one block instead of being scattered between the scripts.
const SYMBOL_PREFIX: char = '\u{1}';

/// Separates the names in a search key; no search text can contain it.
pub(crate) const SEARCH_SEPARATOR: char = '\u{1f}';

/// The label of names that have no value to be filed by.
pub(crate) const UNKNOWN_LABEL: &str = "?";

/// The one bucket of every kanji.
pub(crate) const KANJI_LABEL: &str = "漢";

/// The folded form of `text`: what two names are compared by when they are searched.
pub(crate) fn fold(text: &str) -> String {
    let mut folded = String::with_capacity(text.len());
    for c in text.trim().nfkc() {
        // A Latin letter with its accent loses the accent; kana keep their dakuten.
        let plain = if c.is_ascii() {
            c
        } else {
            let mut parts = c.nfd();
            match (parts.next(), parts.next()) {
                (Some(base), Some(mark)) if base.is_ascii_alphabetic() && is_mark(mark) => base,
                _ => c,
            }
        };
        folded.extend(hiragana(plain).to_lowercase());
    }
    folded
}

fn is_mark(c: char) -> bool {
    ('\u{300}'..='\u{36f}').contains(&c)
}

/// Katakana as the hiragana they are read as; anything else as it is.
fn hiragana(c: char) -> char {
    match c {
        '\u{30a1}'..='\u{30f6}' | '\u{30fd}' | '\u{30fe}' => {
            char::from_u32(c as u32 - 0x60).unwrap_or(c)
        }
        _ => c,
    }
}

/// What a name sorts by: its SortOrder tag when it has one, else the name, folded. An unknown
/// name (`""`) has no sort key, whatever the tag says, and sorts last.
pub(crate) fn sort_key(name: &str, sort_tag: Option<&str>) -> String {
    if name.trim().is_empty() {
        return String::new();
    }
    let source = sort_tag
        .filter(|tag| !tag.trim().is_empty())
        .unwrap_or(name);
    let mut key = fold(source);
    if !key.chars().next().is_some_and(char::is_alphanumeric) {
        key.insert(0, SYMBOL_PREFIX);
    }
    key
}

/// The search key of several names: their folded forms in a row.
pub(crate) fn search_key(names: &[&str]) -> String {
    names
        .iter()
        .map(|name| fold(name))
        .collect::<Vec<_>>()
        .join(&SEARCH_SEPARATOR.to_string())
}

/// What a search text is matched against a search key as: folded.
pub(crate) fn search_text(search: &str) -> String {
    fold(search)
}

/// Where the first character of a sort key is filed in the scroll index. Labels follow the sort
/// order: symbols and digits `#`, Latin letters, the rows of the kana (か for が), other scripts
/// letter by letter, and all kanji as one `漢`. Names without a key are `?`, which sort last.
pub(crate) fn index_label(sort_key: &str) -> String {
    let Some(first) = sort_key.chars().next() else {
        return UNKNOWN_LABEL.into();
    };
    match first {
        SYMBOL_PREFIX | '0'..='9' => "#".into(),
        'a'..='z' => first.to_ascii_uppercase().to_string(),
        '\u{3041}'..='\u{3049}' | '\u{304a}' => "あ".into(),
        '\u{304b}'..='\u{3054}' => "か".into(),
        '\u{3055}'..='\u{305e}' => "さ".into(),
        '\u{305f}'..='\u{3069}' => "た".into(),
        '\u{306a}'..='\u{306e}' => "な".into(),
        '\u{306f}'..='\u{307d}' => "は".into(),
        '\u{307e}'..='\u{3082}' => "ま".into(),
        '\u{3083}'..='\u{3088}' => "や".into(),
        '\u{3089}'..='\u{308e}' => "ら".into(),
        // The rest of the hiragana block and what follows it (ー), still before the kanji.
        '\u{308f}'..='\u{30ff}' => "わ".into(),
        '\u{3400}'..='\u{4dbf}' | '\u{4e00}'..='\u{9fff}' | '\u{f900}'..='\u{faff}' => {
            KANJI_LABEL.into()
        }
        '\u{ac00}'..='\u{d7a3}' => "한".into(),
        other => other.to_uppercase().collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folding_unifies_kana_width_case_and_accents() {
        assert_eq!(fold("ユズ"), "ゆず");
        assert_eq!(fold("ﾕｽﾞ"), "ゆず");
        assert_eq!(fold("ＡＢＣ　１２３"), "abc 123");
        assert_eq!(fold("  Beyoncé "), "beyonce");
        assert_eq!(fold("が"), "が", "dakuten stay");
        assert_eq!(fold("ヴ"), "ゔ");
        assert_eq!(fold("100％"), "100%");
    }

    #[test]
    fn sort_keys_prefer_the_sort_order_tag_and_put_symbols_first() {
        assert_eq!(sort_key("The Band", Some("Band, The")), "band, the");
        assert_eq!(sort_key("The Band", None), "the band");
        assert_eq!(sort_key("The Band", Some("  ")), "the band");
        assert_eq!(sort_key("", Some("Tag")), "", "unknown has no key");
        assert_eq!(sort_key("(Intro)", None), "\u{1}(intro)");
        let mut names = [
            "Zebra",
            "ユズ",
            "あい",
            "漢字",
            "apple",
            "(x)",
            "9 lives",
            "いろは",
            "Éclair",
        ];
        names.sort_by_key(|name| sort_key(name, None));
        assert_eq!(
            names,
            [
                "(x)",
                "9 lives",
                "apple",
                "Éclair",
                "Zebra",
                "あい",
                "いろは",
                "ユズ",
                "漢字"
            ]
        );
    }

    #[test]
    fn index_labels_follow_the_sort_order_and_never_go_backwards() {
        let mut names = vec![
            "Zebra",
            "ゆず",
            "ユズ",
            "あい",
            "漢字",
            "字",
            "apple",
            "(x)",
            "9 lives",
            "いろは",
            "がっこう",
            "ざ",
            "ちゃ",
            "つ",
            "ほ",
            "ぱ",
            "ん",
            "わ",
            "ー",
            "한글",
            "Бабочка",
            "Éclair",
            "",
            "ゃ",
            "ゎ",
            "ぁ",
        ];
        names.sort_by_key(|name| sort_key(name, None));
        let labels: Vec<String> = names
            .iter()
            .map(|name| index_label(&sort_key(name, None)))
            .collect();
        let mut merged: Vec<&str> = Vec::new();
        for label in &labels {
            if merged.last() != Some(&label.as_str()) {
                merged.push(label);
            }
        }
        // Each label is one contiguous run: no label appears twice.
        let mut seen = merged.clone();
        seen.sort_unstable();
        seen.dedup();
        assert_eq!(seen.len(), merged.len(), "{merged:?}");
        assert_eq!(
            merged.first(),
            Some(&"?"),
            "the unnamed sort first by key but is filed apart"
        );
    }

    #[test]
    fn kana_rows_and_kanji_have_fixed_labels() {
        let label = |name: &str| index_label(&sort_key(name, None));
        assert_eq!(label("がっこう"), "か");
        assert_eq!(label("ガッコウ"), "か");
        assert_eq!(label("ぱ"), "は");
        assert_eq!(label("ちゃ"), "た");
        assert_eq!(label("ん"), "わ");
        assert_eq!(label("漢字"), "漢");
        assert_eq!(label("字"), "漢");
        assert_eq!(label("1st"), "#");
        assert_eq!(label("(x)"), "#");
        assert_eq!(label("Zebra"), "Z");
        assert_eq!(label(""), "?");
    }

    #[test]
    fn search_keys_hold_every_name_folded() {
        assert_eq!(
            search_key(&["ユズ", "A", ""]),
            "ゆず\u{1f}a\u{1f}".to_string()
        );
        assert_eq!(search_text(" ﾕｽﾞ "), "ゆず");
    }
}
