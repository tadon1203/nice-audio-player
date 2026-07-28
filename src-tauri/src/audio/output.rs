use std::sync::mpsc::SyncSender;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, StreamConfig, StreamInstant, SupportedStreamConfig};

use super::pcm::PcmBuffer;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct OutputStreamId(pub(crate) u64);

pub(crate) enum OutputSignal {
    FinalFramesSubmitted {
        stream_id: OutputStreamId,
        end_time: StreamInstant,
    },
    StreamFailed {
        stream_id: OutputStreamId,
    },
    CompletionTimingFailed {
        stream_id: OutputStreamId,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AudioOutputError {
    NoDefaultOutputDevice,
    ConfigurationQueryFailed,
    UnsupportedConfiguration,
    StreamBuildFailed,
    StreamStartFailed,
    StreamPauseFailed,
    StreamResumeFailed,
}

pub(crate) struct PreparedOutputStream {
    stream: cpal::Stream,
}

impl PreparedOutputStream {
    pub(crate) fn start(&self) -> Result<(), AudioOutputError> {
        self.stream
            .play()
            .map_err(|_| AudioOutputError::StreamStartFailed)
    }

    pub(crate) fn resume(&self) -> Result<(), AudioOutputError> {
        self.stream
            .play()
            .map_err(|_| AudioOutputError::StreamResumeFailed)
    }

    pub(crate) fn pause(&self) -> Result<(), AudioOutputError> {
        self.stream
            .pause()
            .map_err(|_| AudioOutputError::StreamPauseFailed)
    }

    pub(crate) fn now(&self) -> StreamInstant {
        self.stream.now()
    }
}

pub(crate) fn build_output_stream(
    stream_id: OutputStreamId,
    pcm: PcmBuffer,
    signal_sender: SyncSender<OutputSignal>,
) -> Result<PreparedOutputStream, AudioOutputError> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or(AudioOutputError::NoDefaultOutputDevice)?;
    let sample_rate = pcm.sample_rate().get();
    let channel_count = pcm.channel_count().get();
    let ranges = device
        .supported_output_configs()
        .map_err(|_| AudioOutputError::ConfigurationQueryFailed)?;
    let supported_config = select_output_config(ranges, sample_rate, channel_count)?;
    let sample_format = supported_config.sample_format();
    let config = supported_config.config();
    let stream = match sample_format {
        SampleFormat::F32 => build_stream::<f32>(&device, config, stream_id, pcm, signal_sender)?,
        SampleFormat::F64 => build_stream::<f64>(&device, config, stream_id, pcm, signal_sender)?,
        SampleFormat::I8 => build_stream::<i8>(&device, config, stream_id, pcm, signal_sender)?,
        SampleFormat::I16 => build_stream::<i16>(&device, config, stream_id, pcm, signal_sender)?,
        SampleFormat::I24 => {
            build_stream::<cpal::I24>(&device, config, stream_id, pcm, signal_sender)?
        }
        SampleFormat::I32 => build_stream::<i32>(&device, config, stream_id, pcm, signal_sender)?,
        SampleFormat::I64 => build_stream::<i64>(&device, config, stream_id, pcm, signal_sender)?,
        SampleFormat::U8 => build_stream::<u8>(&device, config, stream_id, pcm, signal_sender)?,
        SampleFormat::U16 => build_stream::<u16>(&device, config, stream_id, pcm, signal_sender)?,
        SampleFormat::U24 => {
            build_stream::<cpal::U24>(&device, config, stream_id, pcm, signal_sender)?
        }
        SampleFormat::U32 => build_stream::<u32>(&device, config, stream_id, pcm, signal_sender)?,
        SampleFormat::U64 => build_stream::<u64>(&device, config, stream_id, pcm, signal_sender)?,
        _ => return Err(AudioOutputError::UnsupportedConfiguration),
    };

    Ok(PreparedOutputStream { stream })
}

fn select_output_config(
    ranges: impl IntoIterator<Item = cpal::SupportedStreamConfigRange>,
    sample_rate: u32,
    channel_count: u16,
) -> Result<SupportedStreamConfig, AudioOutputError> {
    ranges
        .into_iter()
        .filter(|range| range.channels() == channel_count)
        .filter_map(|range| {
            let sample_format = range.sample_format();
            if sample_format.is_dsd() || sample_format_rank(sample_format).is_none() {
                return None;
            }

            range
                .try_with_sample_rate(sample_rate)
                .map(|config| (sample_format_rank(sample_format).unwrap(), config))
        })
        .min_by_key(|(rank, _)| *rank)
        .map(|(_, config)| config)
        .ok_or(AudioOutputError::UnsupportedConfiguration)
}

fn sample_format_rank(sample_format: SampleFormat) -> Option<u8> {
    match sample_format {
        SampleFormat::F32 => Some(0),
        SampleFormat::F64 => Some(1),
        SampleFormat::I32 => Some(2),
        SampleFormat::I24 => Some(3),
        SampleFormat::I16 => Some(4),
        SampleFormat::I8 => Some(5),
        SampleFormat::U32 => Some(6),
        SampleFormat::U24 => Some(7),
        SampleFormat::U16 => Some(8),
        SampleFormat::U8 => Some(9),
        SampleFormat::I64 => Some(10),
        SampleFormat::U64 => Some(11),
        _ => None,
    }
}

fn write_output_samples<T>(output: &mut [T], source: &[f32], position: &mut usize) -> usize
where
    T: Sample + FromSample<f32>,
{
    let remaining = source.len().saturating_sub(*position);
    let copied = remaining.min(output.len());
    let source_end = *position + copied;

    for (destination, sample) in output[..copied]
        .iter_mut()
        .zip(&source[*position..source_end])
    {
        *destination = T::from_sample(*sample);
    }
    output[copied..].fill(T::EQUILIBRIUM);
    *position = source_end;
    copied
}

fn build_stream<T>(
    device: &cpal::Device,
    config: StreamConfig,
    stream_id: OutputStreamId,
    pcm: PcmBuffer,
    signal_sender: SyncSender<OutputSignal>,
) -> Result<cpal::Stream, AudioOutputError>
where
    T: cpal::SizedSample + FromSample<f32>,
{
    let sample_rate = pcm.sample_rate().get();
    let channel_count = usize::from(pcm.channel_count().get());
    let source_sample_count = pcm.samples().len();
    let source_frame_count = pcm.frame_count();
    debug_assert_eq!(source_sample_count, source_frame_count * channel_count);
    let samples = pcm.into_samples();
    let error_sender = signal_sender.clone();
    let mut position = 0usize;
    let mut completion_sent = false;

    let stream = device
        .build_output_stream(
            config,
            move |output: &mut [T], info| {
                let written_sample_count = write_output_samples(output, &samples, &mut position);

                if position < source_sample_count || completion_sent {
                    return;
                }
                let Some(end_time) = calculate_end_time(
                    info.timestamp().playback,
                    written_sample_count,
                    channel_count,
                    sample_rate,
                ) else {
                    let _ =
                        signal_sender.try_send(OutputSignal::CompletionTimingFailed { stream_id });
                    return;
                };
                completion_sent = signal_sender
                    .try_send(OutputSignal::FinalFramesSubmitted {
                        stream_id,
                        end_time,
                    })
                    .is_ok();
            },
            move |_error| {
                let _ = error_sender.try_send(OutputSignal::StreamFailed { stream_id });
            },
            None,
        )
        .map_err(|_| AudioOutputError::StreamBuildFailed)?;

    Ok(stream)
}

#[allow(clippy::manual_is_multiple_of)]
fn calculate_end_time(
    playback_start: StreamInstant,
    written_sample_count: usize,
    channel_count: usize,
    sample_rate: u32,
) -> Option<StreamInstant> {
    if channel_count == 0 || sample_rate == 0 || written_sample_count % channel_count != 0 {
        return None;
    }

    let written_frame_count = written_sample_count / channel_count;
    let seconds = written_frame_count as f64 / f64::from(sample_rate);
    if !seconds.is_finite() || seconds >= u64::MAX as f64 {
        return None;
    }

    playback_start.checked_add(Duration::from_secs_f64(seconds))
}

#[cfg(test)]
mod tests {
    use super::{
        calculate_end_time, sample_format_rank, select_output_config, write_output_samples,
    };
    use cpal::{SampleFormat, StreamInstant, SupportedBufferSize, SupportedStreamConfigRange};
    use std::time::Duration;

    fn range(sample_format: SampleFormat, channels: u16) -> SupportedStreamConfigRange {
        SupportedStreamConfigRange::new(
            channels,
            44_100,
            48_000,
            SupportedBufferSize::Unknown,
            sample_format,
        )
    }

    #[test]
    fn selects_matching_configuration_and_prefers_f32() {
        let config = select_output_config(
            [
                range(SampleFormat::I16, 2),
                range(SampleFormat::F32, 2),
                range(SampleFormat::F64, 2),
                range(SampleFormat::F32, 1),
            ],
            44_100,
            2,
        )
        .expect("matching format must be selected");

        assert_eq!(config.sample_format(), SampleFormat::F32);
        assert_eq!(config.channels(), 2);
        assert_eq!(config.sample_rate(), 44_100);
    }

    #[test]
    fn rejects_mismatched_or_unsupported_configurations() {
        assert!(select_output_config([range(SampleFormat::F32, 1)], 44_100, 2).is_err());
        assert!(select_output_config([range(SampleFormat::F32, 2)], 96_000, 2).is_err());
        assert!(select_output_config([range(SampleFormat::DsdU8, 2)], 44_100, 2).is_err());
    }

    #[test]
    fn ranks_all_supported_sample_formats_deterministically() {
        let formats = [
            SampleFormat::F32,
            SampleFormat::F64,
            SampleFormat::I32,
            SampleFormat::I24,
            SampleFormat::I16,
            SampleFormat::I8,
            SampleFormat::U32,
            SampleFormat::U24,
            SampleFormat::U16,
            SampleFormat::U8,
            SampleFormat::I64,
            SampleFormat::U64,
        ];
        let mut ranked = formats
            .into_iter()
            .map(|format| (sample_format_rank(format).unwrap(), format))
            .collect::<Vec<_>>();
        ranked.sort_by_key(|(rank, _)| *rank);

        assert_eq!(
            ranked.iter().map(|(_, format)| *format).collect::<Vec<_>>(),
            formats
        );
    }

    #[test]
    fn writes_and_pads_output_without_advancing_past_source() {
        let source = [-1.0, 0.0, 1.0];
        let mut position = 0;
        let mut first = [0.0; 2];
        let mut second = [0.0; 3];
        let mut third = [0.0; 2];

        assert_eq!(write_output_samples(&mut first, &source, &mut position), 2);
        assert_eq!(first, [-1.0, 0.0]);
        assert_eq!(position, 2);
        assert_eq!(write_output_samples(&mut second, &source, &mut position), 1);
        assert_eq!(second, [1.0, 0.0, 0.0]);
        assert_eq!(position, 3);
        assert_eq!(write_output_samples(&mut third, &source, &mut position), 0);
        assert_eq!(third, [0.0; 2]);
        assert_eq!(position, 3);
    }

    #[test]
    fn converts_integer_output_samples() {
        let source = [-1.0, 0.0, 1.0];
        let mut output = [0i16; 3];
        let mut position = 0;

        assert_eq!(write_output_samples(&mut output, &source, &mut position), 3);
        assert_eq!(output, [i16::MIN, 0, i16::MAX]);
    }

    #[test]
    fn calculates_completion_time_from_frames() {
        let start = StreamInstant::new(10, 0);
        let end = calculate_end_time(start, 4, 2, 44_100).expect("time must calculate");
        assert_eq!(
            end.checked_duration_since(start),
            Some(Duration::from_secs_f64(2.0 / 44_100.0))
        );
        assert!(calculate_end_time(start, 3, 2, 44_100).is_none());
        assert!(calculate_end_time(start, usize::MAX, 1, 0).is_none());
    }

    #[test]
    fn completion_time_uses_only_samples_submitted_by_final_callback() {
        let source = vec![0.0; 10];
        let mut position = 0;

        let mut first = [0.0; 8];
        assert_eq!(write_output_samples(&mut first, &source, &mut position), 8);

        let mut final_output = [0.0; 8];
        let final_written = write_output_samples(&mut final_output, &source, &mut position);

        assert_eq!(final_written, 2);
        assert_eq!(position, 10);

        let start = StreamInstant::new(10, 0);
        let end = calculate_end_time(start, final_written, 2, 48_000).unwrap();

        assert_eq!(
            end.checked_duration_since(start),
            Some(Duration::from_secs_f64(1.0 / 48_000.0))
        );
    }
}
