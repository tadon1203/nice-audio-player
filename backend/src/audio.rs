pub(crate) mod decode;
#[cfg(test)]
pub(crate) mod fake_output;
pub(crate) mod meter;
pub(crate) mod output;
pub(crate) mod pcm;
pub(crate) mod playback;
pub(crate) mod processing;
pub(crate) mod volume;
pub(crate) mod waveform;

// Playback consumes the shared media boundary; it does not own validation or inspection.
