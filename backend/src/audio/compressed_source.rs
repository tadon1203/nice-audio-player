use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::sync::Arc;

use log::warn;
use symphonia::core::io::MediaSource;

use super::decoding::{PcmDecodeError, StreamingDecoder};
use crate::media::validation::ValidatedAudioFile;

pub(crate) const MEMORY_SOURCE_LIMIT_BYTES: u64 = 268_435_456;
const READ_CHUNK_BYTES: usize = 1024 * 1024;

fn uses_memory(byte_len: u64) -> bool {
    byte_len <= MEMORY_SOURCE_LIMIT_BYTES
}

#[derive(Clone)]
pub(crate) enum CompressedAudioSource {
    Memory { bytes: Arc<Vec<u8>> },
    File { file: Arc<File>, byte_len: u64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CompressedSourceError {
    Cancelled,
    OpenFailed,
    MetadataFailed,
    ReadFailed,
    SourceChanged,
}

#[derive(Clone, Default)]
pub(crate) struct SourceLoadCancellation {
    cancelled: Arc<std::sync::atomic::AtomicBool>,
}

impl SourceLoadCancellation {
    pub(crate) fn cancel(&self) {
        self.cancelled
            .store(true, std::sync::atomic::Ordering::Relaxed);
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.cancelled.load(std::sync::atomic::Ordering::Relaxed)
    }
}

pub(crate) fn prepare_compressed_source(
    file: &ValidatedAudioFile,
    cancellation: &SourceLoadCancellation,
) -> Result<CompressedAudioSource, CompressedSourceError> {
    if cancellation.is_cancelled() {
        return Err(CompressedSourceError::Cancelled);
    }
    let mut source = File::open(&file.path).map_err(|_| CompressedSourceError::OpenFailed)?;
    let byte_len = source
        .metadata()
        .map_err(|_| CompressedSourceError::MetadataFailed)?
        .len();
    if !uses_memory(byte_len) {
        return Ok(CompressedAudioSource::File {
            file: Arc::new(source),
            byte_len,
        });
    }
    let len = usize::try_from(byte_len).map_err(|_| CompressedSourceError::SourceChanged)?;
    let mut bytes = Vec::new();
    if bytes.try_reserve_exact(len).is_err() {
        warn!("playback.source_memory_reservation_failed size_bytes={byte_len}");
        return Ok(CompressedAudioSource::File {
            file: Arc::new(source),
            byte_len,
        });
    }
    bytes.resize(len, 0);
    let mut offset = 0;
    while offset < len {
        if cancellation.is_cancelled() {
            return Err(CompressedSourceError::Cancelled);
        }
        let end = (offset + READ_CHUNK_BYTES).min(len);
        let read = source
            .read(&mut bytes[offset..end])
            .map_err(|_| CompressedSourceError::ReadFailed)?;
        if read == 0 {
            return Err(CompressedSourceError::SourceChanged);
        }
        offset += read;
    }
    if cancellation.is_cancelled() {
        return Err(CompressedSourceError::Cancelled);
    }
    let mut extra = [0_u8; 1];
    let extra_read = source
        .read(&mut extra)
        .map_err(|_| CompressedSourceError::ReadFailed)?;
    if extra_read != 0 {
        return Err(CompressedSourceError::SourceChanged);
    }
    let final_len = source
        .metadata()
        .map_err(|_| CompressedSourceError::MetadataFailed)?
        .len();
    if final_len != byte_len {
        return Err(CompressedSourceError::SourceChanged);
    }
    Ok(CompressedAudioSource::Memory {
        bytes: Arc::new(bytes),
    })
}

impl CompressedAudioSource {
    pub(crate) fn open_decoder(&self, extension: &str) -> Result<StreamingDecoder, PcmDecodeError> {
        let reader: Box<dyn MediaSource> = match self {
            Self::Memory { bytes } => Box::new(MemoryReader {
                bytes: Arc::clone(bytes),
                position: 0,
            }),
            Self::File { file, byte_len } => Box::new(PositionedFileReader {
                file: Arc::clone(file),
                position: 0,
                byte_len: *byte_len,
            }),
        };
        super::decoding::open_decoder_from_source(reader, extension, false)
    }
}

struct PositionedFileReader {
    file: Arc<File>,
    position: u64,
    byte_len: u64,
}

struct MemoryReader {
    bytes: Arc<Vec<u8>>,
    position: usize,
}

impl Read for MemoryReader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let available = self.bytes.len().saturating_sub(self.position);
        let count = available.min(buffer.len());
        buffer[..count].copy_from_slice(&self.bytes[self.position..self.position + count]);
        self.position += count;
        Ok(count)
    }
}

impl Seek for MemoryReader {
    fn seek(&mut self, from: SeekFrom) -> io::Result<u64> {
        let current = u64::try_from(self.position).unwrap_or(u64::MAX);
        let end = u64::try_from(self.bytes.len()).unwrap_or(u64::MAX);
        let target = match from {
            SeekFrom::Start(value) => Some(value),
            SeekFrom::Current(value) => current.checked_add_signed(value),
            SeekFrom::End(value) => end.checked_add_signed(value),
        };
        let Some(target) = target else {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid seek"));
        };
        self.position = usize::try_from(target)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid seek"))?;
        Ok(target)
    }
}

impl MediaSource for MemoryReader {
    fn is_seekable(&self) -> bool {
        true
    }

    fn byte_len(&self) -> Option<u64> {
        u64::try_from(self.bytes.len()).ok()
    }
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
    fn threshold_is_inclusive() {
        assert!(uses_memory(268_435_456));
        assert!(!uses_memory(268_435_457));
    }

    #[test]
    fn memory_readers_have_independent_positions_and_shared_backing() {
        let bytes = Arc::new(vec![1, 2, 3, 4]);
        let first = MemoryReader {
            bytes: Arc::clone(&bytes),
            position: 0,
        };
        let second = MemoryReader {
            bytes: Arc::clone(&bytes),
            position: 0,
        };
        assert_eq!(Arc::strong_count(&bytes), 3);
        let mut first = first;
        let mut second = second;
        let mut buffer = [0; 2];
        first.read_exact(&mut buffer).unwrap();
        assert_eq!(buffer, [1, 2]);
        second.read_exact(&mut buffer).unwrap();
        assert_eq!(buffer, [1, 2]);
        assert_eq!(first.seek(SeekFrom::Current(-1)).unwrap(), 1);
        assert_eq!(first.seek(SeekFrom::End(-1)).unwrap(), 3);
        assert!(first.seek(SeekFrom::Current(-4)).is_err());
    }

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
