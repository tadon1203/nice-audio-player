//! What a file is, apart from where it is: its size and a hash of its head and tail. Whole files
//! are never hashed, so identifying a library costs two small reads per file.

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::Path;

/// How much of each end of a file is hashed.
const SAMPLE_BYTES: u64 = 64 * 1024;

/// The hash of a file's first and last `SAMPLE_BYTES` (all of it when it is shorter than two
/// samples), together with its length. A file moved or renamed keeps it; any rewrite that
/// changes either end, a retag included, does not.
pub(crate) fn content_hash(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let length = file.metadata()?.len();
    let mut hasher = blake3::Hasher::new();
    hasher.update(&length.to_le_bytes());
    let mut buffer = Vec::new();
    if length <= SAMPLE_BYTES * 2 {
        file.read_to_end(&mut buffer)?;
    } else {
        buffer.resize(SAMPLE_BYTES as usize, 0);
        file.read_exact(&mut buffer)?;
        hasher.update(&buffer);
        file.seek(SeekFrom::End(-(SAMPLE_BYTES as i64)))?;
        file.read_exact(&mut buffer)?;
    }
    hasher.update(&buffer);
    Ok(hasher.finalize().to_hex().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestDirectory;

    #[test]
    fn the_hash_follows_the_content_not_the_name_and_ignores_the_middle() {
        let directory = TestDirectory::new();
        let mut bytes = vec![7u8; 300_000];
        let a = directory.file("a.bin");
        std::fs::write(&a, &bytes).unwrap();
        let renamed = directory.file("b.bin");
        std::fs::copy(&a, &renamed).unwrap();
        bytes[150_000] = 9;
        let middle = directory.file("c.bin");
        std::fs::write(&middle, &bytes).unwrap();
        bytes[10] = 9;
        let head = directory.file("d.bin");
        std::fs::write(&head, &bytes).unwrap();

        assert_eq!(content_hash(&a).unwrap(), content_hash(&renamed).unwrap());
        assert_eq!(content_hash(&a).unwrap(), content_hash(&middle).unwrap());
        assert_ne!(content_hash(&a).unwrap(), content_hash(&head).unwrap());
    }

    #[test]
    fn short_files_are_hashed_whole_and_the_length_counts() {
        let directory = TestDirectory::new();
        let (one, two) = (directory.file("1"), directory.file("2"));
        std::fs::write(&one, [1u8, 2, 3]).unwrap();
        std::fs::write(&two, [1u8, 2, 3, 4]).unwrap();
        assert_ne!(content_hash(&one).unwrap(), content_hash(&two).unwrap());
    }
}
