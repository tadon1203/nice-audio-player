use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Indexing, Resampler};

use super::pcm::PcmSpec;
use crate::diagnostics::logged;
use crate::slices::head;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub(crate) enum OutputProcessingError {
    #[error("the samples do not divide into whole frames")]
    MisalignedSamples,
    #[error("the channel conversion is not supported")]
    UnsupportedChannelConversion,
    #[error("the input samples are invalid")]
    InvalidInputSamples,
    #[error("the resampler could not be built")]
    ResamplerConstructionFailed,
    #[error("the resampler failed to process samples")]
    ResamplerProcessingFailed,
    #[error("the resampler produced an invalid output")]
    InvalidResamplerOutput,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ChannelConversion {
    None,
    MonoToStereo,
    StereoToMono,
    /// Surround (3, 4, 5, 6 or 8 channels) folded to stereo, or to mono when `to_mono` is set.
    Downmix {
        left: &'static [f32],
        right: &'static [f32],
        to_mono: bool,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SampleRateConversion {
    None,
    HighQuality,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct OutputProcessingPlan {
    source: PcmSpec,
    output: PcmSpec,
    channel_conversion: ChannelConversion,
    sample_rate_conversion: SampleRateConversion,
}

impl OutputProcessingPlan {
    pub(crate) fn new(source: PcmSpec, output: PcmSpec) -> Result<Self, OutputProcessingError> {
        let source_channels = source.channel_count().get();
        let output_channels = output.channel_count().get();
        let channel_conversion = match (source_channels, output_channels) {
            (source, output) if source == output => ChannelConversion::None,
            (1, 2) => ChannelConversion::MonoToStereo,
            (2, 1) => ChannelConversion::StereoToMono,
            (source, output @ (1 | 2)) => {
                let (left, right) = surround_weights(usize::from(source))
                    .ok_or(OutputProcessingError::UnsupportedChannelConversion)?;
                ChannelConversion::Downmix {
                    left,
                    right,
                    to_mono: output == 1,
                }
            }
            _ => return Err(OutputProcessingError::UnsupportedChannelConversion),
        };
        Ok(Self {
            source,
            output,
            channel_conversion,
            sample_rate_conversion: if source.sample_rate() == output.sample_rate() {
                SampleRateConversion::None
            } else {
                SampleRateConversion::HighQuality
            },
        })
    }

    pub(crate) const fn source(self) -> PcmSpec {
        self.source
    }
    pub(crate) const fn output(self) -> PcmSpec {
        self.output
    }
    pub(crate) const fn channel_conversion(self) -> ChannelConversion {
        self.channel_conversion
    }
    pub(crate) const fn sample_rate_conversion(self) -> SampleRateConversion {
        self.sample_rate_conversion
    }
}

struct HighQualityResampler {
    resampler: Fft<f32>,
    input: Vec<f32>,
    input_frames: usize,
    output: Vec<f32>,
    channels: usize,
    delay_remaining: usize,
    total_source_frames: u64,
    emitted_output_frames: u64,
    finished: bool,
    resampler_input_rate: u32,
    resampler_output_rate: u32,
    input_chunk_frames: usize,
}

impl HighQualityResampler {
    fn new(plan: OutputProcessingPlan) -> Result<Self, OutputProcessingError> {
        let channels = usize::from(plan.output().channel_count().get());
        let resampler = Fft::new(
            usize::try_from(plan.source().sample_rate().get()).unwrap_or(usize::MAX),
            usize::try_from(plan.output().sample_rate().get()).unwrap_or(usize::MAX),
            1_024,
            channels,
            FixedSync::Both,
        )
        .map_err(logged(
            OutputProcessingError::ResamplerConstructionFailed,
            "audio.processing.resampler_build",
        ))?;
        let input_capacity_frames = resampler.input_frames_max();
        let output_frames = resampler.output_frames_max();
        let input_chunk_frames = resampler.input_frames_next();
        Ok(Self {
            input: vec![0.0; input_capacity_frames * channels],
            output: vec![0.0; output_frames * channels],
            channels,
            delay_remaining: resampler.output_delay(),
            resampler,
            input_frames: 0,
            total_source_frames: 0,
            emitted_output_frames: 0,
            finished: false,
            resampler_input_rate: plan.source().sample_rate().get(),
            resampler_output_rate: plan.output().sample_rate().get(),
            input_chunk_frames,
        })
    }

    fn push(&mut self, frame: &[f32], output: &mut Vec<f32>) -> Result<(), OutputProcessingError> {
        let start = self.input_frames * self.channels;
        let Some(slot) = self.input.get_mut(start..start + self.channels) else {
            return Err(OutputProcessingError::ResamplerProcessingFailed);
        };
        write_front(slot, frame);
        self.input_frames += 1;
        self.total_source_frames += 1;
        if self.input_frames == self.resampler.input_frames_next() {
            self.process(None, output)?;
        }
        Ok(())
    }

    fn process(
        &mut self,
        partial_len: Option<usize>,
        output: &mut Vec<f32>,
    ) -> Result<usize, OutputProcessingError> {
        let input_frames = self.resampler.input_frames_next();
        let output_frames = self.resampler.output_frames_next();
        let input =
            InterleavedSlice::new(&self.input, self.channels, input_frames).map_err(logged(
                OutputProcessingError::ResamplerProcessingFailed,
                "audio.processing.resampler_input",
            ))?;
        let mut resampled = InterleavedSlice::new_mut(
            &mut self.output,
            self.channels,
            self.resampler.output_frames_max(),
        )
        .map_err(logged(
            OutputProcessingError::ResamplerProcessingFailed,
            "audio.processing.resampler_output",
        ))?;
        let indexing = partial_len.map(|len| Indexing::new().partial_len(len));
        self.resampler
            .process_into_buffer(&input, &mut resampled, indexing.as_ref())
            .map_err(logged(
                OutputProcessingError::ResamplerProcessingFailed,
                "audio.processing.resample",
            ))?;
        self.input_frames = 0;
        let mut emitted = 0;
        for frame in head(&self.output, output_frames * self.channels).chunks_exact(self.channels) {
            if self.delay_remaining > 0 {
                self.delay_remaining -= 1;
                continue;
            }
            if frame.iter().any(|sample| !sample.is_finite()) {
                return Err(OutputProcessingError::InvalidResamplerOutput);
            }
            output.extend(frame.iter().map(|sample| sample.clamp(-1.0, 1.0)));
            emitted += 1;
        }
        self.emitted_output_frames += emitted as u64;
        Ok(emitted)
    }

    fn flush(&mut self, output: &mut Vec<f32>) -> Result<(), OutputProcessingError> {
        if self.finished {
            output.clear();
            return Ok(());
        }
        let expected = ceil_div(
            u128::from(self.total_source_frames) * u128::from(self.output_rate()),
            u128::from(self.input_rate()),
        ) as u64;
        if self.total_source_frames == 0 {
            self.finished = true;
            output.clear();
            return Ok(());
        }
        output.clear();
        if self.input_frames > 0 {
            let remaining = self.input_frames;
            self.process(Some(remaining), output)?;
        }
        if self.emitted_output_frames > expected {
            let excess_frames = (self.emitted_output_frames - expected) as usize;
            output.truncate(output.len().saturating_sub(excess_frames * self.channels));
            self.emitted_output_frames = expected;
        }
        while self.emitted_output_frames < expected {
            let before = self.emitted_output_frames;
            self.process(Some(0), output)?;
            if self.emitted_output_frames == before && self.delay_remaining == 0 {
                return Err(OutputProcessingError::ResamplerProcessingFailed);
            }
            if self.emitted_output_frames > expected {
                let excess_frames = (self.emitted_output_frames - expected) as usize;
                let keep = output.len().saturating_sub(excess_frames * self.channels);
                output.truncate(keep);
                self.emitted_output_frames = expected;
            }
        }
        self.finished = true;
        Ok(())
    }

    fn input_rate(&self) -> u32 {
        self.resampler_input_rate
    }
    fn output_rate(&self) -> u32 {
        self.resampler_output_rate
    }
}

impl OutputPcmProcessor {
    pub(crate) fn new(plan: OutputProcessingPlan) -> Result<Self, OutputProcessingError> {
        let source_channels = usize::from(plan.source().channel_count().get());
        let target_channels = usize::from(plan.output().channel_count().get());
        let resampler = match plan.sample_rate_conversion() {
            SampleRateConversion::None => None,
            SampleRateConversion::HighQuality => Some(HighQualityResampler::new(plan)?),
        };
        Ok(Self {
            channel_scratch: vec![0.0; target_channels],
            channel_conversion: plan.channel_conversion(),
            resampler,
            source_channels,
            finished: false,
        })
    }

    pub(crate) fn convert(
        &mut self,
        input: &[f32],
        output: &mut Vec<f32>,
    ) -> Result<(), OutputProcessingError> {
        if self.finished || !input.len().is_multiple_of(self.source_channels) {
            return Err(OutputProcessingError::MisalignedSamples);
        }
        if input.iter().any(|sample| !sample.is_finite()) {
            return Err(OutputProcessingError::InvalidInputSamples);
        }
        output.clear();
        for frame in input.chunks_exact(self.source_channels) {
            convert_channels_into(self.channel_conversion, frame, &mut self.channel_scratch);
            if let Some(resampler) = self.resampler.as_mut() {
                resampler.push(&self.channel_scratch, output)?;
            } else {
                output.extend_from_slice(&self.channel_scratch);
            }
        }
        Ok(())
    }

    pub(crate) fn flush(&mut self, output: &mut Vec<f32>) -> Result<(), OutputProcessingError> {
        if self.finished {
            output.clear();
            return Ok(());
        }
        if let Some(resampler) = self.resampler.as_mut() {
            resampler.flush(output)?;
        } else {
            output.clear();
        }
        self.finished = true;
        Ok(())
    }

    pub(crate) fn seek_preroll_frames(&self, target_source_frame: u64) -> u64 {
        let Some(resampler) = self.resampler.as_ref() else {
            return 0;
        };
        let source_rate = u128::from(resampler.input_rate());
        let output_rate = u128::from(resampler.output_rate());
        let delay_source_frames = (resampler.delay_remaining as u128)
            .saturating_mul(source_rate)
            .div_ceil(output_rate);
        let warmup_frames = (delay_source_frames + (resampler.input_chunk_frames as u128 * 4))
            .min(u128::from(u64::MAX)) as u64;
        let initial_frame = target_source_frame.saturating_sub(warmup_frames);
        target_source_frame
            .saturating_sub(initial_frame - initial_frame % resampler.input_chunk_frames as u64)
    }
}

pub(crate) struct OutputPcmProcessor {
    channel_scratch: Vec<f32>,
    channel_conversion: ChannelConversion,
    resampler: Option<HighQualityResampler>,
    source_channels: usize,
    finished: bool,
}

/// Per-channel weights into the left and right output, for the standard WAVE channel orders
/// (FL FR [FC] [LFE] [BL BR] [SL SR]). Centre and surrounds enter at -3 dB, the LFE is dropped,
/// and each side is scaled so full-scale input in every channel cannot exceed full scale.
fn surround_weights(channels: usize) -> Option<(&'static [f32], &'static [f32])> {
    const C: f32 = std::f32::consts::FRAC_1_SQRT_2;
    // Each weight is divided by the sum of the weights of its side, so full scale cannot clip.
    const S3: f32 = 1.0 + C;
    const S5: f32 = 1.0 + 2.0 * C;
    const S8: f32 = 1.0 + 3.0 * C;
    const L3: [f32; 3] = [1.0 / S3, 0.0, C / S3];
    const R3: [f32; 3] = [0.0, 1.0 / S3, C / S3];
    const L4: [f32; 4] = [1.0 / S3, 0.0, C / S3, 0.0];
    const R4: [f32; 4] = [0.0, 1.0 / S3, 0.0, C / S3];
    const L5: [f32; 5] = [1.0 / S5, 0.0, C / S5, C / S5, 0.0];
    const R5: [f32; 5] = [0.0, 1.0 / S5, C / S5, 0.0, C / S5];
    const L6: [f32; 6] = [1.0 / S5, 0.0, C / S5, 0.0, C / S5, 0.0];
    const R6: [f32; 6] = [0.0, 1.0 / S5, C / S5, 0.0, 0.0, C / S5];
    const L8: [f32; 8] = [1.0 / S8, 0.0, C / S8, 0.0, C / S8, 0.0, C / S8, 0.0];
    const R8: [f32; 8] = [0.0, 1.0 / S8, C / S8, 0.0, 0.0, C / S8, 0.0, C / S8];
    match channels {
        3 => Some((&L3, &R3)),
        4 => Some((&L4, &R4)),
        5 => Some((&L5, &R5)),
        6 => Some((&L6, &R6)),
        8 => Some((&L8, &R8)),
        _ => None,
    }
}

/// Converts one frame into `output`. The plan's channel counts make every frame carry the channels
/// the conversion reads; a channel the frame does not carry reads as silence.
fn convert_channels_into(conversion: ChannelConversion, frame: &[f32], output: &mut [f32]) {
    let sample = |index: usize| frame.get(index).copied().unwrap_or_default();
    match conversion {
        ChannelConversion::None => write_front(output, frame),
        ChannelConversion::MonoToStereo => write_front(output, &[sample(0), sample(0)]),
        ChannelConversion::StereoToMono => {
            write_front(output, &[f32::midpoint(sample(0), sample(1))]);
        }
        ChannelConversion::Downmix {
            left,
            right,
            to_mono,
        } => {
            let fold = |weights: &[f32]| frame.iter().zip(weights).map(|(s, w)| s * w).sum::<f32>();
            let (left, right) = (fold(left), fold(right));
            if to_mono {
                write_front(output, &[f32::midpoint(left, right)]);
            } else {
                write_front(output, &[left, right]);
            }
        }
    }
}

/// Writes `values` at the front of `output`. A value past the end of `output` is dropped.
fn write_front(output: &mut [f32], values: &[f32]) {
    for (slot, value) in output.iter_mut().zip(values) {
        *slot = *value;
    }
}

fn ceil_div(numerator: u128, denominator: u128) -> u128 {
    numerator.div_ceil(denominator)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::pcm::{ChannelCount, SampleRate};

    fn plan(
        source_rate: u32,
        source_channels: usize,
        output_rate: u32,
        output_channels: usize,
    ) -> OutputProcessingPlan {
        OutputProcessingPlan::new(
            PcmSpec::new(
                SampleRate::new(source_rate).unwrap(),
                ChannelCount::new(source_channels).unwrap(),
            ),
            PcmSpec::new(
                SampleRate::new(output_rate).unwrap(),
                ChannelCount::new(output_channels).unwrap(),
            ),
        )
        .unwrap()
    }

    #[test]
    fn equal_rates_bypass_resampling_and_preserve_channel_rules() {
        let same = plan(44_100, 2, 44_100, 2);
        assert_eq!(same.sample_rate_conversion(), SampleRateConversion::None);
        let mut processor = OutputPcmProcessor::new(same).unwrap();
        let mut output = Vec::new();
        processor
            .convert(&[0.25, -0.5, 0.75, 0.5], &mut output)
            .unwrap();
        assert_eq!(output, [0.25, -0.5, 0.75, 0.5]);

        let mono = plan(44_100, 1, 44_100, 2);
        assert_eq!(mono.channel_conversion(), ChannelConversion::MonoToStereo);
        let mut processor = OutputPcmProcessor::new(mono).unwrap();
        processor.convert(&[0.25, -0.5], &mut output).unwrap();
        assert_eq!(output, [0.25, 0.25, -0.5, -0.5]);
    }

    #[test]
    fn surround_is_folded_to_stereo_and_mono_without_clipping() {
        let mut output = Vec::new();

        let five_one = plan(44_100, 6, 44_100, 2);
        assert!(matches!(
            five_one.channel_conversion(),
            ChannelConversion::Downmix { to_mono: false, .. }
        ));
        let mut processor = OutputPcmProcessor::new(five_one).unwrap();
        // Only the front-left channel: it reaches the left output alone.
        processor
            .convert(&[1.0, 0.0, 0.0, 0.0, 0.0, 0.0], &mut output)
            .unwrap();
        assert!(output[0] > 0.4 && output[1] == 0.0);
        // The LFE is dropped.
        processor
            .convert(&[0.0, 0.0, 0.0, 1.0, 0.0, 0.0], &mut output)
            .unwrap();
        assert_eq!(output, [0.0, 0.0]);
        // Every channel at full scale stays within full scale.
        processor.convert(&[1.0; 6], &mut output).unwrap();
        assert!(output.iter().all(|sample| *sample <= 1.0));

        let mut mono = OutputPcmProcessor::new(plan(44_100, 8, 44_100, 1)).unwrap();
        mono.convert(&[1.0; 8], &mut output).unwrap();
        assert_eq!(output.len(), 1);
        assert!(output[0] > 0.0 && output[0] <= 1.0);

        assert!(
            OutputProcessingPlan::new(
                PcmSpec::new(
                    SampleRate::new(44_100).unwrap(),
                    ChannelCount::new(7).unwrap()
                ),
                PcmSpec::new(
                    SampleRate::new(44_100).unwrap(),
                    ChannelCount::new(2).unwrap()
                ),
            )
            .is_err()
        );
    }

    #[test]
    fn resampling_is_packet_boundary_independent_and_exactly_counted() {
        let input: Vec<f32> = (0..2_000)
            .map(|index| (index as f32 * 0.001).sin() * 0.5)
            .collect();
        let mut whole = OutputPcmProcessor::new(plan(44_100, 1, 48_000, 1)).unwrap();
        let mut whole_output = Vec::new();
        whole.convert(&input, &mut whole_output).unwrap();
        let mut tail = Vec::new();
        whole.flush(&mut tail).unwrap();
        whole_output.extend_from_slice(&tail);

        let mut split = OutputPcmProcessor::new(plan(44_100, 1, 48_000, 1)).unwrap();
        let mut split_output = Vec::new();
        for packet in input.chunks(37) {
            split.convert(packet, &mut tail).unwrap();
            split_output.extend_from_slice(&tail);
        }
        split.flush(&mut tail).unwrap();
        split_output.extend_from_slice(&tail);

        assert_eq!(whole_output.len(), 2_177);
        assert_eq!(split_output.len(), whole_output.len());
        assert!(
            whole_output
                .iter()
                .zip(split_output)
                .all(|(a, b)| (a - b).abs() < 1e-5)
        );
        split.flush(&mut tail).unwrap();
        assert!(tail.is_empty());
    }

    #[test]
    fn rejects_non_finite_input() {
        let mut processor = OutputPcmProcessor::new(plan(44_100, 1, 48_000, 1)).unwrap();
        let mut output = Vec::new();
        assert_eq!(
            processor.convert(&[f32::NAN], &mut output),
            Err(OutputProcessingError::InvalidInputSamples)
        );
    }

    #[test]
    fn seek_preroll_matches_the_continuous_signal_for_both_rate_directions() {
        for (source_rate, output_rate) in [(44_100, 48_000), (48_000, 44_100)] {
            let source: Vec<f32> = (0..20_000)
                .map(|index| ((index as f32) * 0.017).sin() * 0.5)
                .collect();
            let plan = plan(source_rate, 1, output_rate, 1);

            let mut continuous = OutputPcmProcessor::new(plan).unwrap();
            let mut full = Vec::new();
            continuous.convert(&source, &mut full).unwrap();
            let mut tail = Vec::new();
            continuous.flush(&mut tail).unwrap();
            full.extend_from_slice(&tail);

            let target_source_frame = 8_000_u64;
            let mut seeked = OutputPcmProcessor::new(plan).unwrap();
            let preroll_frames = seeked.seek_preroll_frames(target_source_frame);
            let preroll_start = target_source_frame.saturating_sub(preroll_frames) as usize;
            let mut seeked_output = Vec::new();
            seeked
                .convert(&source[preroll_start..], &mut seeked_output)
                .unwrap();
            seeked.flush(&mut tail).unwrap();
            seeked_output.extend_from_slice(&tail);
            let discard = ((target_source_frame - preroll_start as u64) * u64::from(output_rate)
                / u64::from(source_rate)) as usize;
            seeked_output.drain(..discard);

            let expected_start =
                (target_source_frame * u64::from(output_rate) / u64::from(source_rate)) as usize;
            let comparison_len = 1_000.min(full.len().saturating_sub(expected_start));
            let max_error = full[expected_start..expected_start + comparison_len]
                .iter()
                .zip(&seeked_output[..comparison_len])
                .map(|(continuous, seeked)| (continuous - seeked).abs())
                .fold(0.0_f32, f32::max);
            assert!(
                max_error < 1e-4,
                "seek preroll diverged for {source_rate} -> {output_rate}, error={max_error}, preroll={preroll_frames}, discard={discard}"
            );
        }
    }
}
