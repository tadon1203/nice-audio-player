pub mod cancellation;
mod compressed_source;
pub mod decoding;
pub mod devices;
#[cfg(test)]
pub(crate) mod fake_output;
pub mod output;
pub mod output_processing;
pub mod pcm;
pub mod pcm_queue;
pub mod playback;
pub mod timebase;
pub mod volume;
pub mod waveform;

// Playback consumes the shared media boundary; it does not own validation or inspection.
