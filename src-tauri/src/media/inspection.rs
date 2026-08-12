use super::validation::{AudioFileValidationError, ValidatedAudioFile};
use serde::Serialize;
use std::fs::File;
use symphonia::core::codecs::audio::{well_known::*, AudioCodecId, AudioDecoderOptions};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, Track, TrackType};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::units::Timestamp;
use symphonia::default::{get_codecs, get_probe};

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioFileInfo {
    pub codec: AudioCodec,
    pub sample_rate: u32,
    pub channel_count: u16,
    pub duration_ms: Option<u64>,
}
#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AudioCodec {
    Aac,
    Adpcm,
    Alac,
    Flac,
    Mp1,
    Mp2,
    Mp3,
    Pcm,
    Vorbis,
    Other,
}
#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum AudioFileInspectionError {
    ValidationFailed { error: AudioFileValidationError },
    FileOpenFailed,
    UnsupportedFormat,
    MissingAudioTrack,
    MissingCodecParameters,
    UnsupportedCodec,
    MissingSampleRate,
    MissingChannelCount,
    InvalidChannelCount,
    CorruptedFile,
}
#[derive(Debug, Clone)]
pub struct InspectedAudioFile {
    pub info: AudioFileInfo,
    pub bit_depth: Option<u32>,
}

pub fn inspect_audio_file(
    file: &ValidatedAudioFile,
) -> Result<AudioFileInfo, AudioFileInspectionError> {
    Ok(inspect_audio_file_internal(file)?.info)
}
pub fn inspect_audio_file_internal(
    file: &ValidatedAudioFile,
) -> Result<InspectedAudioFile, AudioFileInspectionError> {
    let source = File::open(&file.path).map_err(|_| AudioFileInspectionError::FileOpenFailed)?;
    let stream = MediaSourceStream::new(Box::new(source), MediaSourceStreamOptions::default());
    let mut hint = Hint::new();
    hint.with_extension(&file.extension);
    let format = get_probe()
        .probe(
            &hint,
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(map_probe_error)?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or(AudioFileInspectionError::MissingAudioTrack)?;
    let params = track
        .codec_params
        .as_ref()
        .ok_or(AudioFileInspectionError::MissingCodecParameters)?
        .audio()
        .ok_or(AudioFileInspectionError::MissingCodecParameters)?;
    let codec = codec_from_id(params.codec);
    get_codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default())
        .map_err(map_decoder_error)?;
    let sample_rate = params
        .sample_rate
        .filter(|rate| *rate > 0)
        .ok_or(AudioFileInspectionError::MissingSampleRate)?;
    let count = params
        .channels
        .as_ref()
        .map(|channels| channels.count())
        .filter(|count| *count > 0)
        .ok_or(AudioFileInspectionError::MissingChannelCount)?;
    let channel_count =
        u16::try_from(count).map_err(|_| AudioFileInspectionError::InvalidChannelCount)?;
    Ok(InspectedAudioFile {
        info: AudioFileInfo {
            codec,
            sample_rate,
            channel_count,
            duration_ms: duration_ms(track),
        },
        bit_depth: params.bits_per_sample,
    })
}
fn map_probe_error(error: SymphoniaError) -> AudioFileInspectionError {
    match error {
        SymphoniaError::Unsupported(_) => AudioFileInspectionError::UnsupportedFormat,
        _ => AudioFileInspectionError::CorruptedFile,
    }
}
fn map_decoder_error(error: SymphoniaError) -> AudioFileInspectionError {
    match error {
        SymphoniaError::Unsupported(_) => AudioFileInspectionError::UnsupportedCodec,
        _ => AudioFileInspectionError::CorruptedFile,
    }
}
fn duration_ms(track: &Track) -> Option<u64> {
    let timestamp = Timestamp::try_from(track.duration?.get()).ok()?;
    u64::try_from(track.time_base?.calc_time(timestamp)?.as_millis()).ok()
}
fn codec_from_id(codec: AudioCodecId) -> AudioCodec {
    match codec {
        CODEC_ID_AAC => AudioCodec::Aac,
        CODEC_ID_ADPCM_G722
        | CODEC_ID_ADPCM_G726
        | CODEC_ID_ADPCM_G726LE
        | CODEC_ID_ADPCM_MS
        | CODEC_ID_ADPCM_IMA_WAV
        | CODEC_ID_ADPCM_IMA_QT => AudioCodec::Adpcm,
        CODEC_ID_ALAC => AudioCodec::Alac,
        CODEC_ID_FLAC => AudioCodec::Flac,
        CODEC_ID_MP1 => AudioCodec::Mp1,
        CODEC_ID_MP2 => AudioCodec::Mp2,
        CODEC_ID_MP3 => AudioCodec::Mp3,
        CODEC_ID_PCM_S32LE
        | CODEC_ID_PCM_S32LE_PLANAR
        | CODEC_ID_PCM_S24LE
        | CODEC_ID_PCM_S24LE_PLANAR
        | CODEC_ID_PCM_S16LE
        | CODEC_ID_PCM_S16LE_PLANAR
        | CODEC_ID_PCM_S8
        | CODEC_ID_PCM_S8_PLANAR
        | CODEC_ID_PCM_U32LE
        | CODEC_ID_PCM_U32LE_PLANAR
        | CODEC_ID_PCM_U24LE
        | CODEC_ID_PCM_U24LE_PLANAR
        | CODEC_ID_PCM_U16LE
        | CODEC_ID_PCM_U16LE_PLANAR
        | CODEC_ID_PCM_U8
        | CODEC_ID_PCM_U8_PLANAR
        | CODEC_ID_PCM_F32LE
        | CODEC_ID_PCM_F32LE_PLANAR
        | CODEC_ID_PCM_F64LE
        | CODEC_ID_PCM_F64LE_PLANAR
        | CODEC_ID_PCM_ALAW
        | CODEC_ID_PCM_MULAW => AudioCodec::Pcm,
        CODEC_ID_VORBIS => AudioCodec::Vorbis,
        _ => AudioCodec::Other,
    }
}
