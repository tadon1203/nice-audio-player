pub mod decoding;
pub mod devices;
pub mod output;
pub mod output_processing;
pub mod pcm;
pub mod pcm_queue;
pub mod playback;
pub mod volume;

// Playback consumes the shared media boundary; it does not own validation or inspection.
