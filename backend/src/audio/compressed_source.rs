use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::sync::Arc;

use symphonia::core::io::MediaSource;

use super::cancellation::Cancellation;
use super::decoding::{PcmDecodeError, StreamingDecoder};
use crate::media::validation::ValidatedAudioFile;

/// An open file that decoders read through positioned reads, so a track costs no memory beyond
/// what the decoder buffers, and the next track can be opened while this one plays.
#[derive(Clone)]
pub(crate) struct CompressedAudioSource {
    file: Arc<File>,
    byte_len: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CompressedSourceError {
    Cancelled,
    OpenFailed,
    MetadataFailed,
}

pub(crate) fn prepare_compressed_source(
    file: &ValidatedAudioFile,
    cancellation: &Cancellation,
) -> Result<CompressedAudioSource, CompressedSourceError> {
    if cancellation.is_cancelled() {
        return Err(CompressedSourceError::Cancelled);
    }
    let source = File::open(&file.path).map_err(|_| CompressedSourceError::OpenFailed)?;
    let byte_len = source
        .metadata()
        .map_err(|_| CompressedSourceError::MetadataFailed)?
        .len();
    Ok(CompressedAudioSource {
        file: Arc::new(source),
        byte_len,
    })
}

impl CompressedAudioSource {
    pub(crate) fn open_decoder(&self, extension: &str) -> Result<StreamingDecoder, PcmDecodeError> {
        let reader = PositionedFileReader {
            file: Arc::clone(&self.file),
            position: 0,
            byte_len: self.byte_len,
        };
        super::decoding::open_decoder_from_source(Box::new(reader), extension)
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
