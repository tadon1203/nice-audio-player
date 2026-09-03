use std::fs::{create_dir_all, remove_dir_all, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_TEST_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

pub(crate) struct TestDirectory(PathBuf);

impl TestDirectory {
    pub(crate) fn new() -> Self {
        let id = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time must be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nice-audio-player-audio-{timestamp}-{id}"));
        create_dir_all(&path).expect("test directory must be created");
        Self(path)
    }

    pub(crate) fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = remove_dir_all(&self.0);
    }
}

pub(crate) fn write_pcm_i16_wav(
    path: &Path,
    sample_rate: u32,
    channels: u16,
    interleaved_samples: &[i16],
) {
    assert!(channels > 0, "WAV channel count must be positive");
    assert_eq!(
        interleaved_samples.len() % usize::from(channels),
        0,
        "WAV samples must be interleaved by channel count"
    );

    let bits_per_sample = 16u16;
    let block_align = channels
        .checked_mul(bits_per_sample / 8)
        .expect("WAV block alignment must fit");
    let data_size = interleaved_samples
        .len()
        .checked_mul(usize::from(bits_per_sample / 8))
        .and_then(|size| u32::try_from(size).ok())
        .expect("WAV data size must fit");
    let riff_size = 36u32.checked_add(data_size).expect("WAV size must fit");
    let byte_rate = sample_rate
        .checked_mul(u32::from(block_align))
        .expect("WAV byte rate must fit");

    let mut file = File::create(path).expect("WAV must be created");
    file.write_all(b"RIFF").unwrap();
    file.write_all(&riff_size.to_le_bytes()).unwrap();
    file.write_all(b"WAVEfmt ").unwrap();
    file.write_all(&16u32.to_le_bytes()).unwrap();
    file.write_all(&1u16.to_le_bytes()).unwrap();
    file.write_all(&channels.to_le_bytes()).unwrap();
    file.write_all(&sample_rate.to_le_bytes()).unwrap();
    file.write_all(&byte_rate.to_le_bytes()).unwrap();
    file.write_all(&block_align.to_le_bytes()).unwrap();
    file.write_all(&bits_per_sample.to_le_bytes()).unwrap();
    file.write_all(b"data").unwrap();
    file.write_all(&data_size.to_le_bytes()).unwrap();
    for sample in interleaved_samples {
        file.write_all(&sample.to_le_bytes()).unwrap();
    }
}
