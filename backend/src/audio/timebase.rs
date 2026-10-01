//! Conversions between frames and milliseconds. All round down and saturate.

pub fn frame_to_millis(frame: u64, sample_rate: u32) -> u64 {
    scale(frame, 1_000, sample_rate)
}

pub fn millis_to_frame(millis: u64, sample_rate: u32) -> u64 {
    scale(millis, sample_rate, 1_000)
}

/// Re-expresses a frame count at another sample rate.
pub fn rescale_frame(frame: u64, to_rate: u32, from_rate: u32) -> u64 {
    scale(frame, to_rate, from_rate)
}

fn scale(value: u64, numerator: u32, denominator: u32) -> u64 {
    u128::from(value)
        .saturating_mul(u128::from(numerator))
        .checked_div(u128::from(denominator))
        .unwrap_or(0)
        .min(u128::from(u64::MAX)) as u64
}

#[cfg(test)]
mod tests {
    use super::{frame_to_millis, millis_to_frame, rescale_frame};

    #[test]
    fn converts_frames_and_milliseconds() {
        assert_eq!(frame_to_millis(22_050, 44_100), 500);
        assert_eq!(frame_to_millis(132_300, 44_100), 3_000);
        assert_eq!(frame_to_millis(96_000, 96_000), 1_000);
        assert_eq!(frame_to_millis(1, 0), 0);
    }

    #[test]
    fn rounds_down_and_rescales_to_the_output_rate() {
        assert_eq!(millis_to_frame(999, 44_100), 44_055);
        assert_eq!(frame_to_millis(44_055, 44_100), 998);
        assert_eq!(rescale_frame(44_100, 48_000, 44_100), 48_000);
        assert_eq!(millis_to_frame(2_001, 48_000), 96_048);
    }

    #[test]
    fn saturates_large_values() {
        assert_eq!(millis_to_frame(u64::MAX, u32::MAX), u64::MAX);
        assert_eq!(rescale_frame(u64::MAX, u32::MAX, 1), u64::MAX);
    }
}
