use super::pcm::{ChannelCount, SampleRate};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum PcmConversionError {
    MisalignedSamples,
    UnsupportedChannelConversion,
}

/// Incremental, deterministic PCM conversion performed by the decode worker.
pub(crate) struct PcmConverter {
    source_rate: u32,
    target_rate: u32,
    source_channels: usize,
    target_channels: usize,
    source_frames: u64,
    output_frames: u64,
    phase_remainder: u64,
    previous: Option<Vec<f32>>,
    finished: bool,
}

impl PcmConverter {
    pub(crate) fn new(
        source_rate: SampleRate,
        source_channels: ChannelCount,
        target_rate: SampleRate,
        target_channels: ChannelCount,
    ) -> Result<Self, PcmConversionError> {
        let source_channels = usize::from(source_channels.get());
        let target_channels = usize::from(target_channels.get());
        if source_channels != target_channels
            && !matches!((source_channels, target_channels), (1, 2) | (2, 1))
        {
            return Err(PcmConversionError::UnsupportedChannelConversion);
        }
        Ok(Self {
            source_rate: source_rate.get(),
            target_rate: target_rate.get(),
            source_channels,
            target_channels,
            source_frames: 0,
            output_frames: 0,
            phase_remainder: 0,
            previous: None,
            finished: false,
        })
    }

    pub(crate) fn is_passthrough(&self) -> bool {
        self.source_rate == self.target_rate && self.source_channels == self.target_channels
    }

    pub(crate) fn convert(
        &mut self,
        input: &[f32],
        output: &mut Vec<f32>,
    ) -> Result<(), PcmConversionError> {
        if self.finished || !input.len().is_multiple_of(self.source_channels) {
            return Err(PcmConversionError::MisalignedSamples);
        }
        output.clear();
        if self.is_passthrough() {
            output.extend_from_slice(input);
            self.source_frames += (input.len() / self.source_channels) as u64;
            self.output_frames = self.source_frames;
            return Ok(());
        }

        for frame in input.chunks_exact(self.source_channels) {
            let converted = convert_channels(frame, self.target_channels);
            if let Some(previous) = self.previous.take() {
                while self.output_source_index() < self.source_frames {
                    let fraction = self.phase_remainder as f32 / self.target_rate as f32;
                    for channel in 0..self.target_channels {
                        output.push(
                            previous[channel] + (converted[channel] - previous[channel]) * fraction,
                        );
                    }
                    self.advance_phase();
                }
            }
            self.previous = Some(converted);
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
        let Some(last) = self.previous.take() else {
            self.finished = true;
            return;
        };
        let expected = ceil_div(
            u128::from(self.source_frames) * u128::from(self.target_rate),
            u128::from(self.source_rate),
        ) as u64;
        while self.output_frames < expected {
            output.extend_from_slice(&last);
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

fn convert_channels(frame: &[f32], target_channels: usize) -> Vec<f32> {
    match (frame.len(), target_channels) {
        (channels, target) if channels == target => frame.to_vec(),
        (1, 2) => vec![frame[0], frame[0]],
        (2, 1) => vec![(frame[0] + frame[1]) * 0.5],
        _ => unreachable!("channel conversion was validated by PcmConverter::new"),
    }
}

fn ceil_div(numerator: u128, denominator: u128) -> u128 {
    numerator.div_ceil(denominator)
}

#[cfg(test)]
mod tests {
    use super::{PcmConversionError, PcmConverter};
    use crate::audio::pcm::{ChannelCount, SampleRate};

    fn converter(
        source_rate: u32,
        source_channels: usize,
        target_rate: u32,
        target_channels: usize,
    ) -> PcmConverter {
        PcmConverter::new(
            SampleRate::new(source_rate).unwrap(),
            ChannelCount::new(source_channels).unwrap(),
            SampleRate::new(target_rate).unwrap(),
            ChannelCount::new(target_channels).unwrap(),
        )
        .unwrap()
    }

    fn run(converter: &mut PcmConverter, input: &[f32]) -> Vec<f32> {
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
            Err(PcmConversionError::MisalignedSamples)
        );
        assert_eq!(output, [9.0]);
        assert_eq!(
            PcmConverter::new(
                SampleRate::new(1).unwrap(),
                ChannelCount::new(3).unwrap(),
                SampleRate::new(1).unwrap(),
                ChannelCount::new(2).unwrap()
            )
            .err(),
            Some(PcmConversionError::UnsupportedChannelConversion)
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
}
