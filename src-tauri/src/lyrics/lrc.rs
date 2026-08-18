use super::model::{LyricsContent, LyricsTimedLine};

pub enum LrcParse {
    Parsed(Option<String>, LyricsContent),
    Empty,
    Malformed,
}

pub fn parse(input: &str) -> LrcParse {
    let mut offset: i64 = 0;
    let mut language = None;
    let mut malformed = false;
    for raw in input.lines() {
        let line = raw.trim_end_matches('\r').trim();
        if let Some(value) = tag_value(line, "offset") {
            match value.parse::<i64>() {
                Ok(value) => offset = value,
                Err(_) => malformed = true,
            }
        }
        if let Some(value) = tag_value(line, "language").or_else(|| tag_value(line, "lang")) {
            if !value.is_empty() {
                language = Some(value.to_string());
            }
        }
    }
    let mut timed = Vec::new();
    let mut plain = Vec::new();
    for (order, raw) in input.lines().enumerate() {
        let line = raw.trim_end_matches('\r');
        if is_metadata(line) {
            continue;
        }
        let mut rest = line;
        let mut stamps = Vec::new();
        while let Some(stripped) = rest.strip_prefix('[') {
            let Some(end) = stripped.find(']') else { break };
            let token = &stripped[..end];
            match timestamp(token) {
                Some(ms) => {
                    stamps.push(ms);
                    rest = &stripped[end + 1..];
                }
                None => {
                    malformed |= looks_like_timestamp(token);
                    break;
                }
            }
        }
        if stamps.is_empty() {
            if !line.trim().is_empty() {
                plain.push(line.to_string());
            }
        } else {
            for stamp in stamps {
                timed.push((
                    stamp.saturating_add(offset).max(0) as u64,
                    order,
                    LyricsTimedLine {
                        start_ms: 0,
                        text: rest.to_string(),
                    },
                ));
            }
        }
    }
    if malformed {
        return LrcParse::Malformed;
    }
    if !timed.is_empty() {
        timed.sort_by_key(|(ms, order, _)| (*ms, *order));
        let lines = timed
            .into_iter()
            .map(|(ms, _, mut line)| {
                line.start_ms = ms;
                line
            })
            .collect();
        return LrcParse::Parsed(language, LyricsContent::Timed { lines });
    }
    if plain.is_empty() {
        LrcParse::Empty
    } else {
        LrcParse::Parsed(language, LyricsContent::Plain { lines: plain })
    }
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
fn tag_value<'a>(line: &'a str, name: &str) -> Option<&'a str> {
    line.strip_prefix('[')?
        .strip_suffix(']')?
        .strip_prefix(name)?
        .strip_prefix(':')
}
fn is_metadata(line: &str) -> bool {
    ["ti", "ar", "al", "au", "by", "offset", "language", "lang"]
        .iter()
        .any(|name| tag_value(line, name).is_some())
}
fn timestamp(value: &str) -> Option<i64> {
    let (minutes, seconds) = value.split_once(':')?;
    let (whole, fraction) = seconds.split_once('.').map_or((seconds, ""), |pair| pair);
    let fractional = match fraction.len() {
        0 => 0,
        1 => fraction.parse::<i64>().ok()? * 100,
        2 => fraction.parse::<i64>().ok()? * 10,
        3 => fraction.parse::<i64>().ok()?,
        _ => return None,
    };
    let seconds = whole.parse::<i64>().ok()?;
    if !(0..60).contains(&seconds) {
        return None;
    }
    Some(minutes.parse::<i64>().ok()? * 60_000 + seconds * 1_000 + fractional)
}

fn looks_like_timestamp(value: &str) -> bool {
    value.as_bytes().first().is_some_and(u8::is_ascii_digit) && value.contains(':')
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
}
