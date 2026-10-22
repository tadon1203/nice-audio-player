mod compressed_source;
pub(crate) mod decoding;
pub(crate) mod devices;
#[cfg(test)]
pub(crate) mod fake_output;
pub(crate) mod meter;
pub(crate) mod output;
pub(crate) mod output_processing;
pub(crate) mod pcm;
pub(crate) mod pcm_queue;
pub(crate) mod playback;
pub(crate) mod timebase;
pub(crate) mod volume;
pub(crate) mod waveform;

// Playback consumes the shared media boundary; it does not own validation or inspection.
