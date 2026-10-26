//! A decoder positioned in a file: probes a source, decodes it to interleaved PCM, and seeks.

use log::warn;
use symphonia::core::codecs::audio::{AudioDecoder, AudioDecoderOptions};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo, TrackType};
use symphonia::core::io::{MediaSource, MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::units::{Time, TimeBase, Timestamp};
use symphonia::default::{get_codecs, get_probe};

use crate::player::pcm::{ChannelCount, PcmSpec, SampleRate};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub(crate) enum DecodeError {
    #[error("decoding was cancelled")]
    Cancelled,
    #[error("the file could not be opened")]
    FileOpenFailed,
    #[error("the file's size could not be read")]
    MetadataFailed,
    #[error("the format is not supported")]
    UnsupportedFormat,
    #[error("the file has no audio track")]
    MissingAudioTrack,
    #[error("the audio track has no codec parameters")]
    MissingCodecParameters,
    #[error("the codec is not supported")]
    UnsupportedCodec,
    #[error("the sample rate is invalid")]
    InvalidSampleRate,
    #[error("the channel count is invalid")]
    InvalidChannelCount,
    #[error("the file could not be read")]
    ReadFailed,
    #[error("the audio data is corrupted")]
    CorruptedAudioData,
    #[error("the stream changed while decoding")]
    StreamChanged,
    #[error("the decode buffer could not be allocated")]
    BufferAllocationFailed,
    #[error("the audio stream is empty")]
    EmptyAudioStream,
    #[error("the audio could not be decoded")]
    DecodeFailed,
    #[error("the seek failed")]
    SeekFailed,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum DecodeStep {
    Samples,
    EndOfStream,
}

pub(crate) struct SeekResult {
    pub(crate) preroll_source_frame: u64,
    pub(crate) confirmed_source_frame: u64,
    pub(crate) first_packet: Vec<f32>,
}

/// Consecutive undecodable packets after which a track is given up on. One damaged frame is
/// common in real files and is skipped; a long run means the rest is unreadable too.
const MAX_CONSECUTIVE_DAMAGED_PACKETS: u32 = 8;

/// Counts the packets a decoder discarded, per Symphonia's contract for `DecodeError`: the packet
/// is undecodable and decoding continues with the next one.
#[derive(Debug, Default)]
struct DamagedPackets {
    consecutive: u32,
    skipped: u64,
}

impl DamagedPackets {
    /// Records a discarded packet. False once too many in a row have been discarded.
    fn skip(&mut self) -> bool {
        self.consecutive += 1;
        self.skipped += 1;
        self.consecutive <= MAX_CONSECUTIVE_DAMAGED_PACKETS
    }

    fn decoded(&mut self) {
        self.consecutive = 0;
    }
}

pub(crate) struct StreamingDecoder {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn AudioDecoder>,
    track_id: u32,
    expected_spec: PcmSpec,
    time_base: TimeBase,
    duration_ms: Option<u64>,
    finished: bool,
    damaged: DamagedPackets,
}

pub(super) fn open_decoder_from_source(
    source: Box<dyn MediaSource>,
    extension: &str,
) -> Result<StreamingDecoder, DecodeError> {
    let media_source = MediaSourceStream::new(source, MediaSourceStreamOptions::default());
    let mut hint = Hint::new();
    hint.with_extension(extension);
    open_decoder_from_media_source(media_source, &hint)
}

fn open_decoder_from_media_source(
    media_source: MediaSourceStream<'static>,
    hint: &Hint,
) -> Result<StreamingDecoder, DecodeError> {
    let format = get_probe()
        .probe(
            hint,
            media_source,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|error| map_probe_error(&error))?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or(DecodeError::MissingAudioTrack)?;
    let track_id = track.id;
    let codec_params = track
        .codec_params
        .as_ref()
        .ok_or(DecodeError::MissingCodecParameters)?
        .audio()
        .ok_or(DecodeError::MissingCodecParameters)?;
    let expected_spec = PcmSpec::new(
        SampleRate::new(
            codec_params
                .sample_rate
                .ok_or(DecodeError::InvalidSampleRate)?,
        )
        .ok_or(DecodeError::InvalidSampleRate)?,
        ChannelCount::new(
            codec_params
                .channels
                .as_ref()
                .ok_or(DecodeError::InvalidChannelCount)?
                .count(),
        )
        .ok_or(DecodeError::InvalidChannelCount)?,
    );
    let duration_ms = track_duration_ms(track);
    let time_base = track.time_base.unwrap_or_else(|| {
        TimeBase::from_recip(
            std::num::NonZeroU32::new(expected_spec.sample_rate().get())
                .expect("SampleRate::new rejects zero, so the rate is never zero"),
        )
    });
    let decoder_options = AudioDecoderOptions::default();
    let decoder = get_codecs()
        .make_audio_decoder(codec_params, &decoder_options)
        .map_err(|error| map_decoder_creation_error(&error))?;
    Ok(StreamingDecoder {
        format,
        decoder,
        track_id,
        expected_spec,
        time_base,
        duration_ms,
        finished: false,
        damaged: DamagedPackets::default(),
    })
}

impl StreamingDecoder {
    pub(crate) fn spec(&self) -> PcmSpec {
        self.expected_spec
    }

    pub(crate) fn duration_ms(&self) -> Option<u64> {
        self.duration_ms
    }

    pub(crate) fn seek_to_frame_with_preroll(
        &mut self,
        target_source_frame: u64,
        preroll_frames: u64,
    ) -> Result<SeekResult, DecodeError> {
        let sample_rate = self.expected_spec.sample_rate().get();
        let preroll_source_frame = target_source_frame.saturating_sub(preroll_frames);
        let target_nanos = u128::from(preroll_source_frame)
            .saturating_mul(1_000_000_000)
            .checked_div(u128::from(sample_rate))
            .ok_or(DecodeError::SeekFailed)?;
        let time = Time::try_from_nanos_u128(target_nanos).ok_or(DecodeError::SeekFailed)?;
        let seeked = self
            .format
            .seek(
                SeekMode::Accurate,
                SeekTo::Time {
                    time,
                    track_id: Some(self.track_id),
                },
            )
            .inspect_err(|cause| log::warn!("audio.decode.seek_failed cause={cause}"))
            .map_err(|_| DecodeError::SeekFailed)?;
        self.decoder.reset();
        self.finished = false;

        let frames_to_discard = timestamp_delta_to_frames(
            seeked.required_ts,
            seeked.actual_ts,
            self.time_base,
            sample_rate,
        )?;
        let mut frames_to_discard = frames_to_discard;
        let mut packet = Vec::new();
        loop {
            match self.decode_next(&mut packet)? {
                DecodeStep::EndOfStream => return Err(DecodeError::EmptyAudioStream),
                DecodeStep::Samples => {
                    let channels = usize::from(self.expected_spec.channel_count().get());
                    let packet_frames = packet.len() / channels;
                    if frames_to_discard >= packet_frames as u64 {
                        frames_to_discard -= packet_frames as u64;
                        continue;
                    }
                    let skip_frames = frames_to_discard as usize;
                    let skip_samples = skip_frames
                        .checked_mul(channels)
                        .ok_or(DecodeError::BufferAllocationFailed)?;
                    return Ok(SeekResult {
                        preroll_source_frame,
                        confirmed_source_frame: target_source_frame,
                        first_packet: packet[skip_samples.min(packet.len())..].to_vec(),
                    });
                }
            }
        }
    }

    pub(crate) fn decode_next(
        &mut self,
        destination: &mut Vec<f32>,
    ) -> Result<DecodeStep, DecodeError> {
        if self.finished {
            return Ok(DecodeStep::EndOfStream);
        }

        loop {
            let Some(packet) = self
                .format
                .next_packet()
                .map_err(|error| map_packet_error(&error))?
            else {
                self.finished = true;
                if self.damaged.skipped > 0 {
                    warn!(
                        "decoding.damaged_packets_skipped count={}",
                        self.damaged.skipped
                    );
                }
                return Ok(DecodeStep::EndOfStream);
            };
            if packet.track_id != self.track_id {
                continue;
            }

            let decoded = match self.decoder.decode(&packet) {
                Ok(decoded) => decoded,
                Err(SymphoniaError::DecodeError(_)) => {
                    if self.damaged.skip() {
                        continue;
                    }
                    warn!(
                        "decoding.damaged_packets_gave_up count={}",
                        self.damaged.skipped
                    );
                    return Err(DecodeError::CorruptedAudioData);
                }
                Err(error) => return Err(map_decode_error(&error)),
            };
            self.damaged.decoded();
            let packet_sample_count = decoded.samples_interleaved();
            if packet_sample_count == 0 {
                continue;
            }

            let spec = decoded.spec();
            let current_spec = PcmSpec::new(
                SampleRate::new(spec.rate()).ok_or(DecodeError::InvalidSampleRate)?,
                ChannelCount::new(spec.channels().count())
                    .ok_or(DecodeError::InvalidChannelCount)?,
            );
            if current_spec != self.expected_spec {
                return Err(DecodeError::StreamChanged);
            }

            destination.clear();
            destination
                .try_reserve(packet_sample_count)
                .inspect_err(|cause| log::warn!("audio.decode.buffer_failed cause={cause}"))
                .map_err(|_| DecodeError::BufferAllocationFailed)?;
            destination.resize(packet_sample_count, 0.0);
            decoded.copy_to_slice_interleaved(destination);
            return Ok(DecodeStep::Samples);
        }
    }
}

fn track_duration_ms(track: &symphonia::core::formats::Track) -> Option<u64> {
    let time_base = track.time_base?;
    let duration = track.duration?;
    let timestamp = Timestamp::try_from(duration.get()).ok()?;
    u64::try_from(time_base.calc_time(timestamp)?.as_millis()).ok()
}

fn timestamp_delta_to_frames(
    required: Timestamp,
    actual: Timestamp,
    time_base: TimeBase,
    sample_rate: u32,
) -> Result<u64, DecodeError> {
    if required < actual {
        return Err(DecodeError::SeekFailed);
    }
    let delta = u128::try_from(required.get() - actual.get())
        .inspect_err(|cause| log::warn!("audio.decode.seek_delta_failed cause={cause}"))
        .map_err(|_| DecodeError::SeekFailed)?;
    let numerator = delta
        .checked_mul(u128::from(time_base.numer.get()))
        .and_then(|value| value.checked_mul(u128::from(sample_rate)))
        .ok_or(DecodeError::SeekFailed)?;
    let denominator = u128::from(time_base.denom.get());
    let frames = numerator
        .checked_add(denominator.saturating_sub(1))
        .and_then(|value| value.checked_div(denominator))
        .ok_or(DecodeError::SeekFailed)?;
    u64::try_from(frames)
        .inspect_err(|cause| log::warn!("audio.decode.seek_frames_failed cause={cause}"))
        .map_err(|_| DecodeError::SeekFailed)
}

fn map_probe_error(error: &SymphoniaError) -> DecodeError {
    match error {
        SymphoniaError::Unsupported(_) => DecodeError::UnsupportedFormat,
        SymphoniaError::IoError(_) => DecodeError::ReadFailed,
        _ => DecodeError::CorruptedAudioData,
    }
}

fn map_decoder_creation_error(error: &SymphoniaError) -> DecodeError {
    match error {
        SymphoniaError::Unsupported(_) => DecodeError::UnsupportedCodec,
        SymphoniaError::IoError(_) => DecodeError::ReadFailed,
        _ => DecodeError::DecodeFailed,
    }
}

fn map_packet_error(error: &SymphoniaError) -> DecodeError {
    match error {
        SymphoniaError::ResetRequired => DecodeError::StreamChanged,
        SymphoniaError::IoError(_) => DecodeError::ReadFailed,
        SymphoniaError::DecodeError(_) => DecodeError::CorruptedAudioData,
        _ => DecodeError::DecodeFailed,
    }
}

fn map_decode_error(error: &SymphoniaError) -> DecodeError {
    match error {
        SymphoniaError::DecodeError(_) => DecodeError::CorruptedAudioData,
        SymphoniaError::IoError(_) => DecodeError::ReadFailed,
        SymphoniaError::Unsupported(_) => DecodeError::UnsupportedCodec,
        SymphoniaError::ResetRequired => DecodeError::StreamChanged,
        _ => DecodeError::DecodeFailed,
    }
}

#[cfg(test)]
mod tests {
    use super::{DamagedPackets, DecodeStep, MAX_CONSECUTIVE_DAMAGED_PACKETS};
    use crate::library::media::ValidatedAudioFile;
    use crate::player::decode::CompressedAudioSource;
    use crate::test_support::{TestDirectory, write_pcm_i16_wav};
    use crate::threads::Cancellation;

    fn validated(path: &std::path::Path) -> ValidatedAudioFile {
        ValidatedAudioFile {
            path: path.to_path_buf(),
            file_name: path.file_name().unwrap().to_string_lossy().into_owned(),
            extension: "wav".to_owned(),
        }
    }

    fn open_source_decoder(file: &ValidatedAudioFile) -> super::StreamingDecoder {
        CompressedAudioSource::open(file, &Cancellation::default())
            .unwrap()
            .decoder()
            .unwrap()
    }

    #[test]
    fn a_damaged_packet_among_good_ones_is_skipped() {
        let mut damaged = DamagedPackets::default();
        for _ in 0..100 {
            assert!(damaged.skip());
            damaged.decoded();
        }
        assert_eq!(damaged.skipped, 100);
    }

    #[test]
    fn a_run_of_damaged_packets_gives_up() {
        let mut damaged = DamagedPackets::default();
        for _ in 0..MAX_CONSECUTIVE_DAMAGED_PACKETS {
            assert!(damaged.skip());
        }
        assert!(!damaged.skip());
    }

    #[test]
    fn seeks_to_a_frame_aligned_position_and_preserves_channels() {
        let directory = TestDirectory::new();
        let path = directory.file("seek.wav");
        let mut samples = Vec::with_capacity(2_000);
        for frame in 0..1_000i16 {
            samples.push(frame);
        }
        write_pcm_i16_wav(&path, 100_000, 1, &samples);
        let mut decoder = open_source_decoder(&validated(&path));
        let result = decoder
            .seek_to_frame_with_preroll(500, 0)
            .expect("seek succeeds");
        assert_eq!(result.confirmed_source_frame, 500);
        assert_eq!(result.first_packet[0], 500.0 / 32_768.0);
        assert!(matches!(
            decoder.decode_next(&mut Vec::new()),
            Ok(DecodeStep::EndOfStream)
        ));
    }

    #[test]
    fn a_truncated_or_garbage_file_ends_decoding_without_a_panic() {
        let directory = TestDirectory::new();
        let whole = directory.file("whole.wav");
        write_pcm_i16_wav(&whole, 8_000, 1, &vec![500i16; 8_000]);
        let bytes = std::fs::read(&whole).unwrap();
        let truncated = directory.file("truncated.wav");
        std::fs::write(&truncated, &bytes[..bytes.len() / 2]).unwrap();
        let garbage = directory.file("garbage.wav");
        std::fs::write(
            &garbage,
            (0..4_096u32)
                .map(|n| (n * 31 % 251) as u8)
                .collect::<Vec<_>>(),
        )
        .unwrap();

        for path in [truncated, garbage] {
            let outcome = crate::errors::contain("test.decode", || {
                let Ok(source) =
                    CompressedAudioSource::open(&validated(&path), &Cancellation::default())
                else {
                    return;
                };
                let Ok(mut decoder) = source.decoder() else {
                    return;
                };
                let mut buffer = Vec::new();
                while let Ok(DecodeStep::Samples) = decoder.decode_next(&mut buffer) {
                    buffer.clear();
                }
            });
            assert!(outcome.is_ok(), "{path:?} panicked the decoder");
        }
    }
}
