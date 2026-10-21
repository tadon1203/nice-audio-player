//! Prefix and suffix slices that clamp to the slice instead of panicking. The audio callback uses
//! them where a count can run past the buffer, and the clamp keeps the callback from panicking.

/// The first `n` items, or the whole slice when `n` is past its end.
pub(crate) fn head<T>(slice: &[T], n: usize) -> &[T] {
    slice.get(..n).unwrap_or(slice)
}

/// The items from index `n`, or an empty slice when `n` is past its end.
pub(crate) fn tail_from<T>(slice: &[T], n: usize) -> &[T] {
    slice.get(n..).unwrap_or(&[])
}

/// Mutable `head`.
pub(crate) fn head_mut<T>(slice: &mut [T], n: usize) -> &mut [T] {
    let len = slice.len();
    slice.get_mut(..n.min(len)).unwrap_or_default()
}

/// Mutable `tail_from`.
pub(crate) fn tail_from_mut<T>(slice: &mut [T], n: usize) -> &mut [T] {
    slice.get_mut(n..).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{head, head_mut, tail_from, tail_from_mut};

    #[test]
    fn head_mut_writes_only_the_first_n_items() {
        let mut items = [1, 2, 3];
        head_mut(&mut items, 2).fill(9);
        assert_eq!(items, [9, 9, 3]);
    }

    #[test]
    fn head_mut_past_the_end_covers_the_whole_slice() {
        let mut items = [1, 2, 3];
        head_mut(&mut items, 10).fill(9);
        assert_eq!(items, [9, 9, 9]);
    }

    #[test]
    fn tail_from_mut_writes_only_from_n() {
        let mut items = [1, 2, 3, 4];
        tail_from_mut(&mut items, 2).fill(9);
        assert_eq!(items, [1, 2, 9, 9]);
    }

    #[test]
    fn tail_from_mut_past_the_end_is_empty() {
        let mut items = [1, 2, 3];
        tail_from_mut(&mut items, 10).fill(9);
        assert_eq!(items, [1, 2, 3]);
    }

    #[test]
    fn head_takes_the_first_n_items() {
        assert_eq!(head(&[1, 2, 3, 4], 2), &[1, 2]);
    }

    #[test]
    fn head_past_the_end_takes_the_whole_slice() {
        assert_eq!(head(&[1, 2, 3], 10), &[1, 2, 3]);
    }

    #[test]
    fn head_of_an_empty_slice_is_empty() {
        let empty: &[u8] = &[];
        assert_eq!(head(empty, 0), empty);
        assert_eq!(head(empty, 4), empty);
    }

    #[test]
    fn head_of_zero_is_empty() {
        assert_eq!(head(&[1, 2, 3], 0), &[] as &[i32]);
    }

    #[test]
    fn tail_from_takes_the_items_from_n() {
        assert_eq!(tail_from(&[1, 2, 3, 4], 2), &[3, 4]);
    }

    #[test]
    fn tail_from_at_the_end_is_empty() {
        assert_eq!(tail_from(&[1, 2, 3], 3), &[] as &[i32]);
    }

    #[test]
    fn tail_from_past_the_end_is_empty() {
        assert_eq!(tail_from(&[1, 2, 3], 10), &[] as &[i32]);
    }

    #[test]
    fn tail_from_zero_takes_the_whole_slice() {
        assert_eq!(tail_from(&[1, 2, 3], 0), &[1, 2, 3]);
    }

    #[test]
    fn tail_from_of_an_empty_slice_is_empty() {
        let empty: &[u8] = &[];
        assert_eq!(tail_from(empty, 0), empty);
        assert_eq!(tail_from(empty, 4), empty);
    }
}
