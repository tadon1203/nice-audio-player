//! Identifiers that are validated where they enter the Backend, so no later code checks them again.

use serde::{Deserialize, Serialize};

/// Stored artwork: the 64-character blake3 hex of the image file.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
#[serde(try_from = "String", into = "String")]
#[specta(transparent)]
pub struct ArtworkHash(String);

impl ArtworkHash {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for ArtworkHash {
    type Error = &'static str;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        if is_artwork_hash(&value) {
            Ok(Self(value))
        } else {
            Err("an artwork hash is 64 lowercase hex digits")
        }
    }
}

impl From<ArtworkHash> for String {
    fn from(hash: ArtworkHash) -> Self {
        hash.0
    }
}

/// A content hash is 64 lowercase hex digits. One spelling per file, so one cache entry per file.
pub fn is_artwork_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_artwork_hash_is_accepted_only_as_64_lowercase_hex_digits() {
        let hash = "ab".repeat(32);
        assert_eq!(ArtworkHash::try_from(hash.clone()).unwrap().as_str(), hash);

        for bad in [
            "ab".repeat(31),
            "ab".repeat(33),
            "AB".repeat(32),
            format!("{}g", "a".repeat(63)),
            String::new(),
        ] {
            assert!(ArtworkHash::try_from(bad.clone()).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_command_argument_with_a_bad_hash_is_rejected_at_deserialization() {
        let bad = serde_json::json!("not-a-hash");
        assert!(serde_json::from_value::<ArtworkHash>(bad).is_err());

        let good = "cd".repeat(32);
        let parsed: ArtworkHash = serde_json::from_value(serde_json::json!(good)).unwrap();
        assert_eq!(
            serde_json::to_value(&parsed).unwrap(),
            serde_json::json!(good)
        );
    }
}
