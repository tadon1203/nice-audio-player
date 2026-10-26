//! A compressed source: an open file that decoders read through positioned reads.

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::sync::Arc;

use symphonia::core::io::MediaSource;

use super::stream::{DecodeError, StreamingDecoder, open_decoder_from_source};
use crate::library::media::ValidatedAudioFile;
use crate::threads::Cancellation;

/// An open file that decoders read through positioned reads, so a track costs no memory beyond
/// what the decoder buffers, and the next track can be opened while this one plays.
#[derive(Clone)]
pub(crate) struct CompressedAudioSource {
    file: Arc<File>,
    byte_len: u64,
    extension: String,
}

impl CompressedAudioSource {
    pub(crate) fn open(
        file: &ValidatedAudioFile,
        cancellation: &Cancellation,
    ) -> Result<Self, DecodeError> {
        if cancellation.is_cancelled() {
            return Err(DecodeError::Cancelled);
        }
        let source = File::open(&file.path)
            .inspect_err(|cause| log::warn!("audio.source.open_failed cause={cause}"))
            .ok()
            .ok_or(DecodeError::FileOpenFailed)?;
        let byte_len = source
            .metadata()
            .inspect_err(|cause| log::warn!("audio.source.metadata_failed cause={cause}"))
            .ok()
            .ok_or(DecodeError::MetadataFailed)?
            .len();
        Ok(Self {
            file: Arc::new(source),
            byte_len,
            extension: file.extension.clone(),
        })
    }

    pub(crate) fn decoder(&self) -> Result<StreamingDecoder, DecodeError> {
        let reader = PositionedFileReader {
            file: Arc::clone(&self.file),
            position: 0,
            byte_len: self.byte_len,
        };
        open_decoder_from_source(Box::new(reader), &self.extension)
    }
}

struct PositionedFileReader {
    file: Arc<File>,
    position: u64,
    byte_len: u64,
}

impl Read for PositionedFileReader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let read = positioned_read(&self.file, buffer, self.position)?;
        self.position = self.position.saturating_add(read as u64);
        Ok(read)
    }
}

impl Seek for PositionedFileReader {
    fn seek(&mut self, from: SeekFrom) -> io::Result<u64> {
        let target = match from {
            SeekFrom::Start(value) => Some(value),
            SeekFrom::Current(value) => self.position.checked_add_signed(value),
            SeekFrom::End(value) => self.byte_len.checked_add_signed(value),
        };
        let Some(target) = target else {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid seek"));
        };
        self.position = target;
        Ok(target)
    }
}

impl MediaSource for PositionedFileReader {
    fn is_seekable(&self) -> bool {
        true
    }

    fn byte_len(&self) -> Option<u64> {
        Some(self.byte_len)
    }
}

#[cfg(unix)]
fn positioned_read(file: &File, buffer: &mut [u8], position: u64) -> io::Result<usize> {
    use std::os::unix::fs::FileExt;
    file.read_at(buffer, position)
}

#[cfg(windows)]
fn positioned_read(file: &File, buffer: &mut [u8], position: u64) -> io::Result<usize> {
    use std::os::windows::fs::FileExt;
    file.seek_read(buffer, position)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_readers_keep_independent_positions() {
        let directory = crate::test_support::TestDirectory::new();
        let path = directory.file("positioned.bin");
        std::fs::write(&path, [10_u8, 20, 30, 40, 50]).unwrap();
        let file = Arc::new(File::open(path).unwrap());
        let mut first = PositionedFileReader {
            file: Arc::clone(&file),
            position: 0,
            byte_len: 5,
        };
        let mut second = PositionedFileReader {
            file,
            position: 0,
            byte_len: 5,
        };
        let mut buffer = [0_u8; 2];
        first.read_exact(&mut buffer).unwrap();
        assert_eq!(buffer, [10, 20]);
        second.seek(SeekFrom::End(-2)).unwrap();
        second.read_exact(&mut buffer).unwrap();
        assert_eq!(buffer, [40, 50]);
        first.seek(SeekFrom::Current(-1)).unwrap();
        first.read_exact(&mut buffer[..1]).unwrap();
        assert_eq!(buffer[0], 20);
    }
}
