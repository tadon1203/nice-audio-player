use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::Arc;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, StreamConfig, StreamInstant, SupportedStreamConfig};
use tauri_plugin_log::log::{error, info};

use super::decoding::DecodedAudioSpec;
use super::pcm_queue::PcmConsumer;

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
    DecodeFailed {
        stream_id: OutputStreamId,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u8)]
pub(crate) enum ProducerState {
    Running = 0,
    EndOfStream = 1,
    Failed = 2,
    Cancelled = 3,
}

pub(crate) struct AtomicProducerState {
    state: AtomicU8,
}

impl AtomicProducerState {
    pub(crate) fn new(state: ProducerState) -> Self {
        Self {
            state: AtomicU8::new(state as u8),
        }
    }

    pub(crate) fn store(&self, state: ProducerState) {
        self.state.store(state as u8, Ordering::Release);
    }

    pub(crate) fn load(&self) -> ProducerState {
        match self.state.load(Ordering::Acquire) {
            0 => ProducerState::Running,
            1 => ProducerState::EndOfStream,
            2 => ProducerState::Failed,
            3 => ProducerState::Cancelled,
            _ => ProducerState::Failed,
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub(crate) struct PositionUpdate {
    pub(crate) start_frame: u64,
    pub(crate) end_frame: u64,
    pub(crate) playback_time: StreamInstant,
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
    position_receiver: Receiver<PositionUpdate>,
    latest_position_update: Option<PositionUpdate>,
    last_played_frame_position: u64,
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

    pub(crate) fn played_frame_position(
        &mut self,
        sample_rate: u32,
        max_frame_count: Option<u64>,
    ) -> u64 {
        while let Ok(update) = self.position_receiver.try_recv() {
            self.latest_position_update = Some(update);
        }

        let position =
            self.latest_position_update
                .map_or(self.last_played_frame_position, |update| {
                    played_frame_position(
                        update,
                        self.stream.now(),
                        sample_rate,
                        max_frame_count,
                        self.last_played_frame_position,
                    )
                });
        self.last_played_frame_position = self.last_played_frame_position.max(position);
        self.last_played_frame_position
    }

    pub(crate) fn clear_timing_anchor(&mut self) {
        while self.position_receiver.try_recv().is_ok() {}
        self.latest_position_update = None;
    }
}

pub(crate) fn build_output_stream(
    stream_id: OutputStreamId,
    spec: DecodedAudioSpec,
    consumer: PcmConsumer,
    producer_state: Arc<AtomicProducerState>,
    capacity_sender: SyncSender<()>,
    signal_sender: SyncSender<OutputSignal>,
) -> Result<PreparedOutputStream, AudioOutputError> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or(AudioOutputError::NoDefaultOutputDevice)?;
    let device_name = device
        .description()
        .map(|description| description.name().to_owned())
        .unwrap_or_else(|error| format!("<unavailable: {error}>"));
    let sample_rate = spec.sample_rate.get();
    let channel_count = spec.channel_count.get();
    let ranges = device
        .supported_output_configs()
        .map_err(|_| AudioOutputError::ConfigurationQueryFailed)?
        .collect::<Vec<_>>();
    info!(
        "audio output configs: device={device_name:?}, pcm_sample_rate={sample_rate}, \
         pcm_channels={channel_count}, ranges={}",
        format_supported_output_configs(&ranges)
    );
    let supported_config =
        select_output_config(ranges.iter().cloned(), sample_rate, channel_count)?;
    let sample_format = supported_config.sample_format();
    let config = supported_config.config();
    info!(
        "audio output config selected: device={device_name:?}, \
         pcm_sample_rate={sample_rate}, pcm_channels={channel_count}, \
         sample_format={sample_format:?}, output_sample_rate={}, \
         output_channels={}, buffer_size={:?}",
        config.sample_rate, config.channels, config.buffer_size,
    );
    let (position_sender, position_receiver) = mpsc::sync_channel(1);
    let stream = match sample_format {
        SampleFormat::F32 => build_stream::<f32>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::F64 => build_stream::<f64>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::I8 => build_stream::<i8>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::I16 => build_stream::<i16>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::I24 => build_stream::<cpal::I24>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::I32 => build_stream::<i32>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::I64 => build_stream::<i64>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::U8 => build_stream::<u8>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::U16 => build_stream::<u16>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::U24 => build_stream::<cpal::U24>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::U32 => build_stream::<u32>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        SampleFormat::U64 => build_stream::<u64>(
            &device,
            &device_name,
            config,
            sample_format,
            stream_id,
            consumer,
            producer_state,
            capacity_sender,
            signal_sender.clone(),
            position_sender.clone(),
        )?,
        _ => return Err(AudioOutputError::UnsupportedConfiguration),
    };

    Ok(PreparedOutputStream {
        stream,
        position_receiver,
        latest_position_update: None,
        last_played_frame_position: 0,
    })
}

fn format_supported_output_configs(ranges: &[cpal::SupportedStreamConfigRange]) -> String {
    ranges
        .iter()
        .map(|range| {
            format!(
                "channels={}, sample_rate={}..={}, sample_format={:?}, buffer_size={:?}",
                range.channels(),
                range.min_sample_rate(),
                range.max_sample_rate(),
                range.sample_format(),
                range.buffer_size(),
            )
        })
        .collect::<Vec<_>>()
        .join("; ")
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

fn write_queue_samples<T>(output: &mut [T], consumer: &mut PcmConsumer) -> usize
where
    T: Sample + FromSample<f32>,
{
    let mut consumed = 0;
    for destination in output.iter_mut() {
        let Some(sample) = consumer.pop_sample() else {
            *destination = T::EQUILIBRIUM;
            continue;
        };
        *destination = T::from_sample(sample);
        consumed += 1;
    }
    consumed
}

#[cfg(test)]
fn write_output_samples<T>(output: &mut [T], source: &[f32], position: &mut usize) -> usize
where
    T: Sample + FromSample<f32>,
{
    let copied = source.len().saturating_sub(*position).min(output.len());
    for (destination, sample) in output[..copied]
        .iter_mut()
        .zip(&source[*position..*position + copied])
    {
        *destination = T::from_sample(*sample);
    }
    output[copied..].fill(T::EQUILIBRIUM);
    *position += copied;
    copied
}

#[allow(clippy::too_many_arguments)]
fn build_stream<T>(
    device: &cpal::Device,
    device_name: &str,
    config: StreamConfig,
    sample_format: SampleFormat,
    stream_id: OutputStreamId,
    mut consumer: PcmConsumer,
    producer_state: Arc<AtomicProducerState>,
    capacity_sender: SyncSender<()>,
    signal_sender: SyncSender<OutputSignal>,
    position_sender: SyncSender<PositionUpdate>,
) -> Result<cpal::Stream, AudioOutputError>
where
    T: cpal::SizedSample + FromSample<f32>,
{
    let config_sample_rate = config.sample_rate;
    let config_channels = config.channels;
    let config_buffer_size = config.buffer_size;
    let sample_rate = config.sample_rate;
    let channel_count = usize::from(config.channels);
    let error_sender = signal_sender.clone();
    let mut position_frame = 0u64;
    let mut last_end_time = None;
    let mut completion_sent = false;
    let mut completion_timing_failed = false;

    let stream = device
        .build_output_stream(
            config,
            move |output: &mut [T], info| {
                let start_frame = position_frame;
                let consumed_sample_count = write_queue_samples(output, &mut consumer);
                let consumed_frames = consumed_sample_count / channel_count;
                position_frame = position_frame.saturating_add(consumed_frames as u64);
                let end_frame = position_frame;
                if consumed_frames > 0 {
                    let _ = capacity_sender.try_send(());
                    last_end_time = calculate_end_time(
                        info.timestamp().playback,
                        consumed_sample_count,
                        channel_count,
                        sample_rate,
                    );
                }
                let _ = position_sender.try_send(PositionUpdate {
                    start_frame,
                    end_frame,
                    playback_time: info.timestamp().playback,
                });

                if producer_state.load() != ProducerState::EndOfStream
                    || !consumer.is_empty()
                    || completion_sent
                {
                    return;
                }
                let Some(end_time) = last_end_time else {
                    if !completion_timing_failed {
                        completion_timing_failed = true;
                        let _ = signal_sender
                            .try_send(OutputSignal::CompletionTimingFailed { stream_id });
                    }
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
        .map_err(|error| {
            error!(
                "audio output stream build failed: device={device_name:?}, \
                 sample_format={sample_format:?}, sample_rate={}, channels={}, \
                 buffer_size={:?}, error={error:?}",
                config_sample_rate, config_channels, config_buffer_size,
            );
            AudioOutputError::StreamBuildFailed
        })?;

    Ok(stream)
}

fn elapsed_frames(elapsed: Duration, sample_rate: u32) -> u64 {
    ((elapsed.as_nanos() * u128::from(sample_rate)) / 1_000_000_000).min(u128::from(u64::MAX))
        as u64
}

fn played_frame_position(
    update: PositionUpdate,
    now: StreamInstant,
    sample_rate: u32,
    max_frame_count: Option<u64>,
    last_position: u64,
) -> u64 {
    let elapsed = now
        .checked_duration_since(update.playback_time)
        .map_or(0, |duration| elapsed_frames(duration, sample_rate));
    let position = update
        .start_frame
        .saturating_add(elapsed)
        .min(update.end_frame);
    let position = max_frame_count.map_or(position, |max| position.min(max));
    last_position.max(position)
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
        calculate_end_time, format_supported_output_configs, played_frame_position,
        sample_format_rank, select_output_config, write_output_samples, PositionUpdate,
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
    fn formats_supported_output_configs_for_diagnostics() {
        let ranges = vec![SupportedStreamConfigRange::new(
            2,
            44_100,
            96_000,
            SupportedBufferSize::Unknown,
            SampleFormat::F32,
        )];

        let formatted = format_supported_output_configs(&ranges);

        assert!(formatted.contains("channels=2"));
        assert!(formatted.contains("sample_rate=44100..=96000"));
        assert!(formatted.contains("sample_format=F32"));
        assert!(formatted.contains("buffer_size=Unknown"));
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

    #[test]
    fn calculates_played_frames_from_stream_clock_elapsed_time() {
        let position = played_frame_position(
            PositionUpdate {
                start_frame: 100,
                end_frame: 300,
                playback_time: StreamInstant::new(10, 0),
            },
            StreamInstant::new(11, 500_000_000),
            100,
            Some(1_000),
            0,
        );

        assert_eq!(position, 250);
    }

    #[test]
    fn clamps_and_keeps_played_position_monotonic() {
        let update = PositionUpdate {
            start_frame: 900,
            end_frame: 1_000,
            playback_time: StreamInstant::new(10, 0),
        };

        assert_eq!(
            played_frame_position(update, StreamInstant::new(12, 0), 100, Some(1_000), 0),
            1_000
        );
        assert_eq!(
            played_frame_position(update, StreamInstant::new(10, 0), 100, Some(1_000), 950),
            950
        );
    }

    #[test]
    fn stops_at_callback_end_when_stream_clock_runs_past_callback_length() {
        let position = played_frame_position(
            PositionUpdate {
                start_frame: 100,
                end_frame: 150,
                playback_time: StreamInstant::new(10, 0),
            },
            StreamInstant::new(20, 0),
            100,
            Some(1_000),
            0,
        );

        assert_eq!(position, 150);
    }

    #[test]
    fn stops_at_track_end_even_when_callback_end_is_later() {
        let position = played_frame_position(
            PositionUpdate {
                start_frame: 900,
                end_frame: 1_100,
                playback_time: StreamInstant::new(10, 0),
            },
            StreamInstant::new(20, 0),
            100,
            Some(1_000),
            0,
        );

        assert_eq!(position, 1_000);
    }

    #[test]
    fn does_not_move_backwards_when_stream_clock_is_before_playback_timestamp() {
        let position = played_frame_position(
            PositionUpdate {
                start_frame: 100,
                end_frame: 300,
                playback_time: StreamInstant::new(20, 0),
            },
            StreamInstant::new(10, 0),
            100,
            Some(1_000),
            0,
        );
        let position_after_progress = played_frame_position(
            PositionUpdate {
                start_frame: 100,
                end_frame: 300,
                playback_time: StreamInstant::new(20, 0),
            },
            StreamInstant::new(10, 0),
            100,
            Some(1_000),
            250,
        );

        assert_eq!(position, 100);
        assert_eq!(position_after_progress, 250);
    }

    #[test]
    fn builds_callback_frame_ranges_from_stereo_sample_positions() {
        let source = [1.0; 6];
        let mut position = 2;
        let mut normal_output = [0.0; 4];
        let start_frame = position / 2;
        write_output_samples(&mut normal_output, &source, &mut position);
        let end_frame = position / 2;
        assert_eq!((start_frame, end_frame), (1, 3));

        let mut partial_output = [0.0; 4];
        let mut partial_position = 4;
        let start_frame = partial_position / 2;
        write_output_samples(&mut partial_output, &source, &mut partial_position);
        let end_frame = partial_position / 2;
        assert_eq!((start_frame, end_frame), (2, 3));
        assert_eq!(partial_output, [1.0, 1.0, 0.0, 0.0]);
    }
}
