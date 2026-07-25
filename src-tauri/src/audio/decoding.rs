use std::fs::File;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use symphonia::core::audio::Channels;
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::default::{get_codecs, get_probe};

use super::pcm::{ChannelCount, PcmBuffer, PcmBufferBuildError, SampleRate};
use super::validation::ValidatedAudioFile;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PcmDecodeError {
    Cancelled,
    FileOpenFailed,
    UnsupportedFormat,
    MissingAudioTrack,
    MissingCodecParameters,
    UnsupportedCodec,
    InvalidSampleRate,
    InvalidChannelCount,
    ReadFailed,
    CorruptedAudioData,
    StreamChanged,
    BufferAllocationFailed,
    EmptyAudioStream,
    VerificationFailed,
    DecodeFailed,
}

#[derive(Clone, Default)]
pub struct DecodeCancellation {
    cancelled: Arc<AtomicBool>,
}

impl DecodeCancellation {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct OutputSpec {
    sample_rate: SampleRate,
    channel_count: ChannelCount,
    channels: Channels,
}

pub fn decode_audio_file(
    file: &ValidatedAudioFile,
    cancellation: &DecodeCancellation,
) -> Result<PcmBuffer, PcmDecodeError> {
    decode_audio_file_with_cancel_check(file, || cancellation.is_cancelled())
}

fn decode_audio_file_with_cancel_check(
    file: &ValidatedAudioFile,
    mut is_cancelled: impl FnMut() -> bool,
) -> Result<PcmBuffer, PcmDecodeError> {
    check_cancelled(&mut is_cancelled)?;

    let source = File::open(&file.path).map_err(|_| PcmDecodeError::FileOpenFailed)?;
    let media_source =
        MediaSourceStream::new(Box::new(source), MediaSourceStreamOptions::default());

    let mut hint = Hint::new();
    hint.with_extension(&file.extension);

    let probed = get_probe()
        .probe(
            &hint,
            media_source,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(map_probe_error)?;
    let mut format = probed;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or(PcmDecodeError::MissingAudioTrack)?;
    let track_id = track.id;
    let codec_params = track
        .codec_params
        .as_ref()
        .ok_or(PcmDecodeError::MissingCodecParameters)?
        .audio()
        .ok_or(PcmDecodeError::MissingCodecParameters)?;
    let decoder_options = AudioDecoderOptions::default().verify(true);
    let mut decoder = get_codecs()
        .make_audio_decoder(codec_params, &decoder_options)
        .map_err(map_decoder_creation_error)?;

    let mut samples = Vec::<f32>::new();
    let mut output_spec: Option<OutputSpec> = None;

    loop {
        check_cancelled(&mut is_cancelled)?;
        let Some(packet) = format.next_packet().map_err(map_packet_error)? else {
            break;
        };

        if packet.track_id != track_id {
            continue;
        }

        let decoded = decoder.decode(&packet).map_err(map_decode_error)?;
        let packet_sample_count = decoded.samples_interleaved();
        if packet_sample_count == 0 {
            continue;
        }

        let spec = decoded.spec();
        let current_spec = OutputSpec {
            sample_rate: SampleRate::new(spec.rate()).ok_or(PcmDecodeError::InvalidSampleRate)?,
            channel_count: ChannelCount::new(spec.channels().count())
                .ok_or(PcmDecodeError::InvalidChannelCount)?,
            channels: spec.channels().clone(),
        };
        if let Some(expected_spec) = &output_spec {
            if expected_spec != &current_spec {
                return Err(PcmDecodeError::StreamChanged);
            }
        } else {
            output_spec = Some(current_spec.clone());
        }

        let old_len = samples.len();
        let new_len = old_len
            .checked_add(packet_sample_count)
            .ok_or(PcmDecodeError::BufferAllocationFailed)?;
        samples
            .try_reserve(packet_sample_count)
            .map_err(|_| PcmDecodeError::BufferAllocationFailed)?;
        samples.resize(new_len, 0.0);
        decoded.copy_to_slice_interleaved(&mut samples[old_len..new_len]);
        check_cancelled(&mut is_cancelled)?;
    }

    check_cancelled(&mut is_cancelled)?;
    let finalize_result = decoder.finalize();
    if finalize_result.verify_ok == Some(false) {
        return Err(PcmDecodeError::VerificationFailed);
    }

    let output_spec = output_spec.ok_or(PcmDecodeError::EmptyAudioStream)?;
    PcmBuffer::from_interleaved(samples, output_spec.sample_rate, output_spec.channel_count)
        .map_err(map_pcm_build_error)
}

fn check_cancelled(is_cancelled: &mut impl FnMut() -> bool) -> Result<(), PcmDecodeError> {
    if is_cancelled() {
        Err(PcmDecodeError::Cancelled)
    } else {
        Ok(())
    }
}

fn map_probe_error(error: SymphoniaError) -> PcmDecodeError {
    match error {
        SymphoniaError::Unsupported(_) => PcmDecodeError::UnsupportedFormat,
        SymphoniaError::IoError(_) => PcmDecodeError::ReadFailed,
        _ => PcmDecodeError::CorruptedAudioData,
    }
}

fn map_decoder_creation_error(error: SymphoniaError) -> PcmDecodeError {
    match error {
        SymphoniaError::Unsupported(_) => PcmDecodeError::UnsupportedCodec,
        SymphoniaError::IoError(_) => PcmDecodeError::ReadFailed,
        _ => PcmDecodeError::DecodeFailed,
    }
}

fn map_packet_error(error: SymphoniaError) -> PcmDecodeError {
    match error {
        SymphoniaError::ResetRequired => PcmDecodeError::StreamChanged,
        SymphoniaError::IoError(_) => PcmDecodeError::ReadFailed,
        SymphoniaError::DecodeError(_) => PcmDecodeError::CorruptedAudioData,
        _ => PcmDecodeError::DecodeFailed,
    }
}

fn map_decode_error(error: SymphoniaError) -> PcmDecodeError {
    match error {
        SymphoniaError::DecodeError(_) => PcmDecodeError::CorruptedAudioData,
        SymphoniaError::IoError(_) => PcmDecodeError::ReadFailed,
        SymphoniaError::Unsupported(_) => PcmDecodeError::UnsupportedCodec,
        SymphoniaError::ResetRequired => PcmDecodeError::StreamChanged,
        _ => PcmDecodeError::DecodeFailed,
    }
}

fn map_pcm_build_error(error: PcmBufferBuildError) -> PcmDecodeError {
    match error {
        PcmBufferBuildError::EmptySamples => PcmDecodeError::EmptyAudioStream,
        PcmBufferBuildError::MisalignedSamples => PcmDecodeError::DecodeFailed,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        decode_audio_file, decode_audio_file_with_cancel_check, DecodeCancellation, PcmDecodeError,
    };
    use crate::audio::test_support::{write_pcm_i16_wav, TestDirectory};
    use crate::audio::validation::ValidatedAudioFile;
    use std::fs::{File, OpenOptions};
    use std::io::Write;

    fn validated(path: &std::path::Path) -> ValidatedAudioFile {
        ValidatedAudioFile {
            path: path.to_string_lossy().into_owned(),
            file_name: path.file_name().unwrap().to_string_lossy().into_owned(),
            extension: "wav".to_owned(),
        }
    }

    #[test]
    fn decodes_mono_i16_to_f32() {
        let directory = TestDirectory::new();
        let path = directory.file("mono.wav");
        write_pcm_i16_wav(&path, 44_100, 1, &[-32_768, -16_384, 0, 16_384, 32_767]);

        let cancellation = DecodeCancellation::default();
        let buffer = decode_audio_file(&validated(&path), &cancellation).expect("decode succeeds");
        let expected = [-1.0, -0.5, 0.0, 0.5, 32_767.0 / 32_768.0];
        for (actual, expected) in buffer.samples().iter().zip(expected) {
            assert!((actual - expected).abs() < 1.0e-6);
        }
        assert_eq!(buffer.sample_rate().get(), 44_100);
        assert_eq!(buffer.channel_count().get(), 1);
        assert_eq!(buffer.frame_count(), 5);
    }

    #[test]
    fn decodes_stereo_in_interleaved_order() {
        let directory = TestDirectory::new();
        let path = directory.file("stereo.wav");
        write_pcm_i16_wav(&path, 48_000, 2, &[-32_768, 32_767, -16_384, 16_384]);

        let buffer = decode_audio_file(&validated(&path), &DecodeCancellation::default())
            .expect("decode succeeds");
        let expected = [-1.0, 32_767.0 / 32_768.0, -0.5, 0.5];
        for (actual, expected) in buffer.samples().iter().zip(expected) {
            assert!((actual - expected).abs() < 1.0e-6);
        }
        assert_eq!(buffer.sample_rate().get(), 48_000);
        assert_eq!(buffer.channel_count().get(), 2);
        assert_eq!(buffer.frame_count(), 2);
    }

    #[test]
    fn accepts_normal_end_of_stream() {
        let directory = TestDirectory::new();
        let path = directory.file("eos.wav");
        write_pcm_i16_wav(&path, 44_100, 1, &[0, 16_384, 32_767]);

        let buffer = decode_audio_file(&validated(&path), &DecodeCancellation::default())
            .expect("normal EOS must succeed");
        assert_eq!(buffer.samples().len(), 3);
    }

    #[test]
    fn rejects_empty_audio_stream() {
        let directory = TestDirectory::new();
        let path = directory.file("empty.wav");
        write_pcm_i16_wav(&path, 44_100, 1, &[]);

        assert_eq!(
            decode_audio_file(&validated(&path), &DecodeCancellation::default()).err(),
            Some(PcmDecodeError::EmptyAudioStream)
        );
    }

    #[test]
    fn rejects_corrupted_audio_data() {
        let directory = TestDirectory::new();
        let path = directory.file("corrupted.wav");
        write_pcm_i16_wav(&path, 44_100, 1, &[0, 16_384, 32_767]);
        let file = OpenOptions::new().write(true).open(&path).unwrap();
        file.set_len(44).unwrap();

        assert_eq!(
            decode_audio_file(&validated(&path), &DecodeCancellation::default()).err(),
            Some(PcmDecodeError::ReadFailed)
        );
    }

    #[test]
    fn rejects_cancellation_before_opening() {
        let directory = TestDirectory::new();
        let path = directory.file("missing.wav");
        let cancellation = DecodeCancellation::default();
        cancellation.cancel();

        assert_eq!(
            decode_audio_file(&validated(&path), &cancellation).err(),
            Some(PcmDecodeError::Cancelled)
        );
    }

    #[test]
    fn rejects_cancellation_after_first_decoded_packet() {
        let directory = TestDirectory::new();
        let path = directory.file("cancelled.wav");
        write_pcm_i16_wav(&path, 44_100, 1, &[0, 16_384, 32_767]);
        let mut checks = 0;

        assert_eq!(
            decode_audio_file_with_cancel_check(&validated(&path), || {
                checks += 1;
                checks >= 3
            })
            .err(),
            Some(PcmDecodeError::Cancelled)
        );
    }

    #[test]
    fn rejects_invalid_input() {
        let directory = TestDirectory::new();
        let path = directory.file("invalid.wav");
        File::create(&path)
            .unwrap()
            .write_all(b"RIFF\xff\xff\xff\xffWAVE")
            .unwrap();

        assert_eq!(
            decode_audio_file(&validated(&path), &DecodeCancellation::default()).err(),
            Some(PcmDecodeError::ReadFailed)
        );
    }
}
