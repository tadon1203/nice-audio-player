use super::pcm::PcmSpec;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum OutputProcessingError {
    MisalignedSamples,
    UnsupportedChannelConversion,
}

/// Incremental, deterministic PCM conversion performed by the decode worker.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ChannelConversion {
    None,
    MonoToStereo,
    StereoToMono,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct OutputProcessingPlan {
    source: PcmSpec,
    output: PcmSpec,
    channel_conversion: ChannelConversion,
}

impl OutputProcessingPlan {
    pub(crate) fn new(source: PcmSpec, output: PcmSpec) -> Result<Self, OutputProcessingError> {
        let source_channels = source.channel_count().get();
        let output_channels = output.channel_count().get();
        let channel_conversion = match (source_channels, output_channels) {
            (source, output) if source == output => ChannelConversion::None,
            (1, 2) => ChannelConversion::MonoToStereo,
            (2, 1) => ChannelConversion::StereoToMono,
            _ => return Err(OutputProcessingError::UnsupportedChannelConversion),
        };
        Ok(Self {
            source,
            output,
            channel_conversion,
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
}

/// Incremental, deterministic PCM output processing performed by the decode worker.
pub(crate) struct OutputPcmProcessor {
    source_rate: u32,
    target_rate: u32,
    source_channels: usize,
    target_channels: usize,
    source_frames: u64,
    output_frames: u64,
    phase_remainder: u64,
    current_frame: Vec<f32>,
    previous_frame: Vec<f32>,
    has_previous_frame: bool,
    finished: bool,
}

impl OutputPcmProcessor {
    pub(crate) fn new(plan: OutputProcessingPlan) -> Self {
        let source = plan.source();
        let output = plan.output();
        let source_channels = usize::from(source.channel_count().get());
        let target_channels = usize::from(output.channel_count().get());
        Self {
            source_rate: source.sample_rate().get(),
            target_rate: output.sample_rate().get(),
            source_channels,
            target_channels,
            source_frames: 0,
            output_frames: 0,
            phase_remainder: 0,
            current_frame: vec![0.0; target_channels],
            previous_frame: vec![0.0; target_channels],
            has_previous_frame: false,
            finished: false,
        }
    }

    pub(crate) fn is_passthrough(&self) -> bool {
        self.source_rate == self.target_rate && self.source_channels == self.target_channels
    }

    pub(crate) fn convert(
        &mut self,
        input: &[f32],
        output: &mut Vec<f32>,
    ) -> Result<(), OutputProcessingError> {
        if self.finished || !input.len().is_multiple_of(self.source_channels) {
            return Err(OutputProcessingError::MisalignedSamples);
        }
        output.clear();
        if self.is_passthrough() {
            output.extend_from_slice(input);
            self.source_frames += (input.len() / self.source_channels) as u64;
            self.output_frames = self.source_frames;
            return Ok(());
        }

        for frame in input.chunks_exact(self.source_channels) {
            convert_channels_into(frame, &mut self.current_frame);
            if self.has_previous_frame {
                while self.output_source_index() < self.source_frames {
                    let fraction = self.phase_remainder as f32 / self.target_rate as f32;
                    for channel in 0..self.target_channels {
                        output.push(
                            self.previous_frame[channel]
                                + (self.current_frame[channel] - self.previous_frame[channel])
                                    * fraction,
                        );
                    }
                    self.advance_phase();
                }
            }
            std::mem::swap(&mut self.current_frame, &mut self.previous_frame);
            self.has_previous_frame = true;
            self.source_frames += 1;
        }
        Ok(())
    }

    pub(crate) fn flush(&mut self, output: &mut Vec<f32>) {
        output.clear();
        if self.finished || self.is_passthrough() || self.source_frames == 0 {
            self.finished = true;
            return;
        }
        if !self.has_previous_frame {
            self.finished = true;
            return;
        }
        let expected = ceil_div(
            u128::from(self.source_frames) * u128::from(self.target_rate),
            u128::from(self.source_rate),
        ) as u64;
        while self.output_frames < expected {
            output.extend_from_slice(&self.previous_frame);
            self.advance_phase();
        }
        self.finished = true;
    }

    fn output_source_index(&self) -> u64 {
        // The integer source position of the next output frame. The remainder
        // is kept separately so no floating-point clock can drift.
        (self.output_frames * u64::from(self.source_rate)) / u64::from(self.target_rate)
    }

    fn advance_phase(&mut self) {
        self.output_frames += 1;
        let phase = self.phase_remainder + u64::from(self.source_rate);
        self.phase_remainder = phase % u64::from(self.target_rate);
    }
}

fn convert_channels_into(frame: &[f32], output: &mut [f32]) {
    match (frame.len(), output.len()) {
        (channels, target) if channels == target => output.copy_from_slice(frame),
        (1, 2) => output.copy_from_slice(&[frame[0], frame[0]]),
        (2, 1) => output[0] = (frame[0] + frame[1]) * 0.5,
        _ => unreachable!("channel conversion was validated by OutputProcessingPlan::new"),
    }
}

fn ceil_div(numerator: u128, denominator: u128) -> u128 {
    numerator.div_ceil(denominator)
}

#[cfg(test)]
mod tests {
    use super::{
        ChannelConversion, OutputPcmProcessor, OutputProcessingError, OutputProcessingPlan,
    };
    use crate::audio::pcm::{ChannelCount, PcmSpec, SampleRate};

    fn converter(
        source_rate: u32,
        source_channels: usize,
        target_rate: u32,
        target_channels: usize,
    ) -> OutputPcmProcessor {
        let source = PcmSpec::new(
            SampleRate::new(source_rate).unwrap(),
            ChannelCount::new(source_channels).unwrap(),
        );
        let output = PcmSpec::new(
            SampleRate::new(target_rate).unwrap(),
            ChannelCount::new(target_channels).unwrap(),
        );
        OutputPcmProcessor::new(OutputProcessingPlan::new(source, output).unwrap())
    }

    fn run(converter: &mut OutputPcmProcessor, input: &[f32]) -> Vec<f32> {
        let mut output = Vec::new();
        converter.convert(input, &mut output).unwrap();
        let mut flushed = Vec::new();
        converter.flush(&mut flushed);
        output.extend(flushed);
        output
    }

    #[test]
    fn pass_through_and_channel_conversion_are_exact() {
        let mut pass = converter(2, 3, 2, 3);
        assert_eq!(
            run(&mut pass, &[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]),
            [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
        );
        let mut mono = converter(1, 1, 1, 2);
        assert_eq!(run(&mut mono, &[0.25, 0.75]), [0.25, 0.25, 0.75, 0.75]);
        let mut stereo = converter(1, 2, 1, 1);
        assert_eq!(run(&mut stereo, &[0.0, 1.0, 1.0, -1.0]), [0.5, 0.0]);
    }

    #[test]
    fn rejects_bad_alignment_and_channel_layout() {
        let mut converter = converter(44_100, 2, 48_000, 2);
        let mut output = vec![9.0];
        assert_eq!(
            converter.convert(&[1.0], &mut output),
            Err(OutputProcessingError::MisalignedSamples)
        );
        assert_eq!(output, [9.0]);
        assert_eq!(
            OutputProcessingPlan::new(
                PcmSpec::new(SampleRate::new(1).unwrap(), ChannelCount::new(3).unwrap()),
                PcmSpec::new(SampleRate::new(1).unwrap(), ChannelCount::new(2).unwrap())
            )
            .err(),
            Some(OutputProcessingError::UnsupportedChannelConversion)
        );
    }

    #[test]
    fn interpolation_is_chunk_boundary_independent_and_flush_is_idempotent() {
        let mut whole = converter(2, 1, 3, 1);
        assert_eq!(
            run(&mut whole, &[0.0, 1.0, 2.0]),
            [0.0, 2.0 / 3.0, 4.0 / 3.0, 2.0, 2.0]
        );
        let mut chunks = converter(2, 1, 3, 1);
        let mut result: Vec<f32> = Vec::new();
        let mut part = Vec::new();
        chunks.convert(&[0.0, 1.0], &mut part).unwrap();
        result.extend(&part);
        chunks.convert(&[2.0], &mut part).unwrap();
        result.extend(&part);
        chunks.flush(&mut part);
        result.extend(&part);
        let once = result.clone();
        chunks.flush(&mut part);
        result.extend(&part);
        assert_eq!(result, once);
        assert_eq!(result, [0.0, 2.0 / 3.0, 4.0 / 3.0, 2.0, 2.0]);
    }

    #[test]
    fn downsampling_uses_the_rational_phase() {
        let mut converter = converter(3, 1, 2, 1);
        assert_eq!(run(&mut converter, &[0.0, 1.0, 2.0]), [0.0, 1.5]);
    }

    #[test]
    fn combined_conversion_is_frame_aligned_and_counts_ceiling() {
        let mut converter = converter(2, 1, 3, 2);
        let output = run(&mut converter, &[0.0, 1.0, 2.0]);
        assert_eq!(output.len(), 10);
        assert!(output.chunks_exact(2).all(|frame| frame[0] == frame[1]));
    }

    #[test]
    fn reuses_current_and_previous_frame_buffers() {
        let mut converter = converter(48_000, 2, 96_000, 2);
        let current_ptr = converter.current_frame.as_ptr();
        let previous_ptr = converter.previous_frame.as_ptr();
        let mut output = Vec::new();
        converter
            .convert(&[0.0, 1.0, 2.0, 3.0, 4.0, 5.0], &mut output)
            .unwrap();
        assert!(
            (converter.current_frame.as_ptr() == current_ptr
                && converter.previous_frame.as_ptr() == previous_ptr)
                || (converter.current_frame.as_ptr() == previous_ptr
                    && converter.previous_frame.as_ptr() == current_ptr)
        );
    }

    #[test]
    fn plan_reports_channel_conversion() {
        let source = PcmSpec::new(SampleRate::new(1).unwrap(), ChannelCount::new(1).unwrap());
        let stereo = PcmSpec::new(SampleRate::new(1).unwrap(), ChannelCount::new(2).unwrap());
        assert_eq!(
            OutputProcessingPlan::new(source, stereo)
                .unwrap()
                .channel_conversion(),
            ChannelConversion::MonoToStereo
        );
    }
}
