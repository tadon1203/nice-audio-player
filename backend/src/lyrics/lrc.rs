use super::model::{LyricsContent, LyricsTimedLine};

pub enum LrcParse {
    Parsed(Option<String>, LyricsContent),
    Empty,
    Malformed,
}

pub fn parse(input: &str) -> LrcParse {
    if input.lines().any(line_has_malformed_timestamp) {
        return LrcParse::Malformed;
    }
    let normalized = normalize_offset_tag(input);
    let lyrics = match lrc_rs::SyncedLyrics::parse(&normalized) {
        Ok(lyrics) => lyrics,
        Err(_) => return LrcParse::Malformed,
    };
    if lyrics.lines.is_empty() {
        return LrcParse::Empty;
    }
    let lines = lyrics
        .lines
        .into_iter()
        .map(|line| LyricsTimedLine {
            start_ms: line.timestamp.as_millis().try_into().unwrap_or(u64::MAX),
            text: line
                .segments
                .into_iter()
                .map(|segment| segment.content)
                .collect::<String>(),
        })
        .collect();
    LrcParse::Parsed(None, LyricsContent::Timed { lines })
}

fn line_has_malformed_timestamp(line: &str) -> bool {
    let mut rest = line.trim_start();
    while let Some(stripped) = rest.strip_prefix('[') {
        let Some(end) = stripped.find(']') else {
            return looks_like_timestamp(stripped);
        };
        let token = &stripped[..end];
        if looks_like_timestamp(token) && parse_timestamp(token).is_none() {
            return true;
        }
        rest = &stripped[end + 1..];
    }
    false
}

fn looks_like_timestamp(value: &str) -> bool {
    value.as_bytes().first().is_some_and(u8::is_ascii_digit) && value.contains(':')
}

fn parse_timestamp(value: &str) -> Option<i64> {
    let (minutes, seconds) = value.split_once(':')?;
    let (whole, fraction) = seconds.split_once('.').unwrap_or((seconds, ""));
    if fraction.len() > 3 {
        return None;
    }
    let fractional = match fraction.len() {
        0 => 0,
        1 => fraction.parse::<i64>().ok()? * 100,
        2 => fraction.parse::<i64>().ok()? * 10,
        _ => fraction.parse::<i64>().ok()?,
    };
    let seconds = whole.parse::<i64>().ok()?;
    if !(0..60).contains(&seconds) {
        return None;
    }
    Some(minutes.parse::<i64>().ok()? * 60_000 + seconds * 1_000 + fractional)
}

fn normalize_offset_tag(input: &str) -> String {
    input
        .lines()
        .map(|line| {
            let Some(value) = line
                .strip_prefix("[offset:")
                .and_then(|value| value.strip_suffix(']'))
            else {
                return line.to_owned();
            };
            if value.starts_with(['+', '-']) {
                line.to_owned()
            } else {
                format!("[offset:+{value}]")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn parse_plain(input: &str) -> Option<(Option<String>, LyricsContent)> {
    let lines: Vec<String> = input
        .lines()
        .map(|line| line.trim_end_matches('\r').to_string())
        .collect();
    if lines.iter().any(|line| !line.trim().is_empty()) {
        Some((None, LyricsContent::Plain { lines }))
    } else {
        None
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_timed_and_plain_lyrics() {
        let LrcParse::Parsed(_, LyricsContent::Timed { lines }) =
            parse("[offset:100]\n[00:01.20]Hello")
        else {
            panic!("expected timed lyrics")
        };
        assert_eq!(lines[0].start_ms, 1_300);
        let (_, LyricsContent::Plain { lines }) =
            parse_plain("First\nSecond").expect("plain lyrics")
        else {
            panic!("expected plain lyrics")
        };
        assert_eq!(lines, ["First", "Second"]);
    }

    #[test]
    fn rejects_invalid_second_fields() {
        assert!(matches!(parse("[00:60.00]invalid"), LrcParse::Malformed));
        assert!(parse_plain(" \n\t").is_none());
    }

    #[test]
    fn rejects_invalid_timestamp_or_offset_without_reclassifying_it_as_plain_text() {
        assert!(matches!(
            parse("[02:01.1234]too precise"),
            LrcParse::Malformed
        ));
        assert!(matches!(
            parse("[offset:later]\n[00:01]Hello"),
            LrcParse::Malformed
        ));
    }

    #[test]
    fn joins_a2_segments_into_their_line_text() {
        let LrcParse::Parsed(_, LyricsContent::Timed { lines }) =
            parse("[00:01.00] <00:01.10>A <00:01.20>B")
        else {
            panic!("expected timed lyrics")
        };
        assert_eq!(lines[0].start_ms, 1_000);
        assert_eq!(lines[0].text, "A B");
    }
}
