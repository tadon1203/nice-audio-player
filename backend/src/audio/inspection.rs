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

use super::validation::{AudioFileValidationError, ValidatedAudioFile};

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

pub fn inspect_audio_file(
    file: &ValidatedAudioFile,
) -> Result<AudioFileInfo, AudioFileInspectionError> {
    let source = File::open(&file.path).map_err(|_| AudioFileInspectionError::FileOpenFailed)?;
    let media_source =
        MediaSourceStream::new(Box::new(source), MediaSourceStreamOptions::default());

    let mut hint = Hint::new();
    hint.with_extension(&file.extension);

    let probed = get_probe()
        .probe(
            &hint,
            media_source,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(map_probe_error)?;
    let format = probed;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or(AudioFileInspectionError::MissingAudioTrack)?;
    let codec_params = track
        .codec_params
        .as_ref()
        .ok_or(AudioFileInspectionError::MissingCodecParameters)?
        .audio()
        .ok_or(AudioFileInspectionError::MissingCodecParameters)?;
    let codec = codec_from_id(codec_params.codec);

    let _decoder = get_codecs()
        .make_audio_decoder(codec_params, &AudioDecoderOptions::default())
        .map_err(map_decoder_error)?;

    let sample_rate = codec_params
        .sample_rate
        .filter(|rate| *rate > 0)
        .ok_or(AudioFileInspectionError::MissingSampleRate)?;
    let channel_count = codec_params
        .channels
        .as_ref()
        .map(|channels| channels.count())
        .filter(|count| *count > 0)
        .ok_or(AudioFileInspectionError::MissingChannelCount)?;
    let channel_count =
        u16::try_from(channel_count).map_err(|_| AudioFileInspectionError::InvalidChannelCount)?;

    Ok(AudioFileInfo {
        codec,
        sample_rate,
        channel_count,
        duration_ms: duration_ms(track),
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
    let time_base = track.time_base?;
    let duration = track.duration?;
    let timestamp = Timestamp::try_from(duration.get()).ok()?;
    u64::try_from(time_base.calc_time(timestamp)?.as_millis()).ok()
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

#[cfg(test)]
mod tests {
    use super::{inspect_audio_file, AudioCodec, AudioFileInspectionError};
    use crate::audio::test_support::{write_pcm_i16_wav, TestDirectory};
    use crate::audio::validation::ValidatedAudioFile;
    use std::fs::File;
    use std::io::Write;
    use std::path::Path;

    fn validated(path: &Path) -> ValidatedAudioFile {
        ValidatedAudioFile {
            path: path.to_string_lossy().into_owned(),
            file_name: path.file_name().unwrap().to_string_lossy().into_owned(),
            extension: "wav".to_owned(),
        }
    }

    #[test]
    fn inspects_mono_wav() {
        let directory = TestDirectory::new();
        let path = directory.file("mono.wav");
        write_pcm_i16_wav(&path, 44_100, 1, &vec![0; 44_100]);
        let info = inspect_audio_file(&validated(&path)).expect("WAV must inspect");
        assert_eq!(info.codec, AudioCodec::Pcm);
        assert_eq!(info.sample_rate, 44_100);
        assert_eq!(info.channel_count, 1);
        assert_eq!(info.duration_ms, Some(1_000));
    }

    #[test]
    fn inspects_stereo_wav() {
        let directory = TestDirectory::new();
        let path = directory.file("stereo.wav");
        write_pcm_i16_wav(&path, 48_000, 2, &vec![0; 48_000]);
        let info = inspect_audio_file(&validated(&path)).expect("WAV must inspect");
        assert_eq!(info.codec, AudioCodec::Pcm);
        assert_eq!(info.sample_rate, 48_000);
        assert_eq!(info.channel_count, 2);
        assert_eq!(info.duration_ms, Some(500));
    }

    #[test]
    fn rejects_empty_wav() {
        let directory = TestDirectory::new();
        let path = directory.file("empty.wav");
        File::create(&path).unwrap();
        assert_eq!(
            inspect_audio_file(&validated(&path)),
            Err(AudioFileInspectionError::UnsupportedFormat)
        );
    }

    #[test]
    fn rejects_invalid_wav() {
        let directory = TestDirectory::new();
        let path = directory.file("corrupted.wav");
        File::create(&path)
            .unwrap()
            .write_all(b"RIFF\xff\xff\xff\xffWAVE")
            .unwrap();
        assert_eq!(
            inspect_audio_file(&validated(&path)),
            Err(AudioFileInspectionError::CorruptedFile)
        );
    }
}
