pub(crate) mod cancellation;
mod compressed_source;
pub(crate) mod decoding;
pub mod devices;
#[cfg(test)]
pub(crate) mod fake_output;
pub mod meter;
pub(crate) mod output;
pub(crate) mod output_processing;
pub(crate) mod pcm;
pub(crate) mod pcm_queue;
pub mod playback;
pub(crate) mod timebase;
pub(crate) mod volume;
pub mod waveform;

// Playback consumes the shared media boundary; it does not own validation or inspection.
