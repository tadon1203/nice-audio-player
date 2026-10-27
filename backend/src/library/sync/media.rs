//! Reading a file for the Library: whether a path names a supported audio file, what the decoder
//! reports about it, and what its tags say. Metadata is deliberately best-effort: it can never
//! change Symphonia playability.

use crate::library::errors::LibraryError;
use crate::library::errors::Result;
use crate::library::read::artwork::ArtworkMimeType;
use lofty::{
    config::ParseOptions,
    file::TaggedFileExt,
    picture::{PictureInformation, PictureType},
    prelude::Accessor,
    probe::Probe,
    tag::ItemKey,
};
use std::{
    borrow::Cow,
    fs::File,
    path::{Path, PathBuf},
};
use symphonia::core::audio::Channels;
use symphonia::core::codecs::audio::well_known::{
    CODEC_ID_AAC, CODEC_ID_ADPCM_G722, CODEC_ID_ADPCM_G726, CODEC_ID_ADPCM_G726LE,
    CODEC_ID_ADPCM_IMA_QT, CODEC_ID_ADPCM_IMA_WAV, CODEC_ID_ADPCM_MS, CODEC_ID_ALAC, CODEC_ID_FLAC,
    CODEC_ID_MP1, CODEC_ID_MP2, CODEC_ID_MP3, CODEC_ID_PCM_ALAW, CODEC_ID_PCM_F32LE,
    CODEC_ID_PCM_F32LE_PLANAR, CODEC_ID_PCM_F64LE, CODEC_ID_PCM_F64LE_PLANAR, CODEC_ID_PCM_MULAW,
    CODEC_ID_PCM_S8, CODEC_ID_PCM_S8_PLANAR, CODEC_ID_PCM_S16LE, CODEC_ID_PCM_S16LE_PLANAR,
    CODEC_ID_PCM_S24LE, CODEC_ID_PCM_S24LE_PLANAR, CODEC_ID_PCM_S32LE, CODEC_ID_PCM_S32LE_PLANAR,
    CODEC_ID_PCM_U8, CODEC_ID_PCM_U8_PLANAR, CODEC_ID_PCM_U16LE, CODEC_ID_PCM_U16LE_PLANAR,
    CODEC_ID_PCM_U24LE, CODEC_ID_PCM_U24LE_PLANAR, CODEC_ID_PCM_U32LE, CODEC_ID_PCM_U32LE_PLANAR,
    CODEC_ID_VORBIS,
};
use symphonia::core::codecs::audio::{AudioCodecId, AudioDecoderOptions};
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, Track, TrackType};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::units::Timestamp;
use symphonia::default::{get_codecs, get_probe};

pub(crate) const SUPPORTED_EXTENSIONS: [&str; 5] = ["mp3", "flac", "wav", "aac", "m4a"];

// Validation: is a path a supported audio file?

/// An audio file the Backend can play. The path stays a `PathBuf` all the way to the file system,
/// so a name the platform allows but Unicode cannot hold still opens.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedAudioFile {
    pub path: PathBuf,
    pub file_name: String,
    pub extension: String,
}

pub(crate) fn is_supported_extension(extension: &str) -> bool {
    SUPPORTED_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
}

/// Checks that `path` names an existing supported audio file. A file that is not one is a track
/// that cannot be played.
pub(crate) fn validate_audio_file(path: &Path) -> Result<ValidatedAudioFile> {
    if is_blank(path) {
        return Err(LibraryError::TrackUnavailable);
    }
    let Ok(metadata) = std::fs::metadata(path) else {
        return Err(LibraryError::TrackUnavailable);
    };
    if !metadata.is_file() {
        return Err(LibraryError::TrackUnavailable);
    }
    describe_audio_file(path)
}

/// Names a supported audio file without touching the filesystem. Playback contexts describe
/// thousands of library files at once; a file that vanished fails when it is loaded instead.
pub(crate) fn describe_audio_file(path: &Path) -> Result<ValidatedAudioFile> {
    if is_blank(path) {
        return Err(LibraryError::TrackUnavailable);
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or(LibraryError::TrackUnavailable)?;
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    let extension = match extension {
        Some(extension) if SUPPORTED_EXTENSIONS.contains(&extension.as_str()) => extension,
        _ => return Err(LibraryError::TrackUnavailable),
    };
    Ok(ValidatedAudioFile {
        path: path.to_path_buf(),
        file_name: file_name.to_owned(),
        extension,
    })
}

/// Nothing to name: an empty path, or one that is only whitespace.
fn is_blank(path: &Path) -> bool {
    path.to_str().is_some_and(|text| text.trim().is_empty()) || path.as_os_str().is_empty()
}

// Inspection: what the decoder reports about a file.

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AudioFileInfo {
    pub codec: AudioCodec,
    pub sample_rate: u32,
    pub channel_count: u16,
    pub duration_ms: Option<u64>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AudioCodec {
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
/// The file cannot be decoded. Nothing downstream tells why, so there is one error.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Undecodable;

#[derive(Debug, Clone)]
pub(crate) struct InspectedAudioFile {
    pub info: AudioFileInfo,
    pub bit_depth: Option<u32>,
}

/// What the decoder reports about the audio file at `path` (`extension` is its format hint).
pub(crate) fn inspect_audio_file(
    path: &Path,
    extension: &str,
) -> std::result::Result<InspectedAudioFile, Undecodable> {
    let source = File::open(path)
        .inspect_err(|cause| log::warn!("media.inspection.open_failed cause={cause}"))
        .ok()
        .ok_or(Undecodable)?;
    let stream = MediaSourceStream::new(Box::new(source), MediaSourceStreamOptions::default());
    let mut hint = Hint::new();
    hint.with_extension(extension);
    let format = get_probe()
        .probe(
            &hint,
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .inspect_err(|cause| log::warn!("media.inspection.probe_failed cause={cause}"))
        .ok()
        .ok_or(Undecodable)?;
    let track = format.default_track(TrackType::Audio).ok_or(Undecodable)?;
    let params = track
        .codec_params
        .as_ref()
        .ok_or(Undecodable)?
        .audio()
        .ok_or(Undecodable)?;
    let codec = codec_from_id(params.codec);
    get_codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default())
        .inspect_err(|cause| log::warn!("media.inspection.decoder_failed cause={cause}"))
        .ok()
        .ok_or(Undecodable)?;
    let sample_rate = params
        .sample_rate
        .filter(|rate| *rate > 0)
        .ok_or(Undecodable)?;
    let count = params
        .channels
        .as_ref()
        .map(Channels::count)
        .filter(|count| *count > 0)
        .ok_or(Undecodable)?;
    let channel_count = u16::try_from(count)
        .inspect_err(|cause| log::warn!("media.inspection.channels_out_of_range cause={cause}"))
        .ok()
        .ok_or(Undecodable)?;
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

// Metadata: what the tags say.

#[derive(Debug, Clone, Default)]
pub(crate) struct SourceMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    /// The `SortOrder` tags: how the title, artist, album and Album Artist are to be sorted.
    pub title_sort: Option<String>,
    pub artist_sort: Option<String>,
    pub album_sort: Option<String>,
    pub album_artist_sort: Option<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub genre: Option<String>,
    pub date: Option<String>,
    pub artwork: ArtworkRead,
}
#[derive(Debug, Clone, Default)]
pub(crate) enum ArtworkRead {
    #[default]
    NotPresent,
    Unavailable,
    Invalid,
    Selected {
        bytes: Vec<u8>,
        mime_type: ArtworkMimeType,
    },
}
pub(crate) fn read_source_metadata(path: &Path) -> anyhow::Result<Option<SourceMetadata>> {
    let tagged = Probe::open(path)?
        .options(ParseOptions::new().read_properties(false))
        .read()?;
    let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else {
        return Ok(None);
    };
    Ok(Some(SourceMetadata {
        title: tag.title().map(Cow::into_owned),
        artist: tag.artist().map(Cow::into_owned),
        album: tag.album().map(Cow::into_owned),
        album_artist: tag.get_string(ItemKey::AlbumArtist).map(ToOwned::to_owned),
        title_sort: tag
            .get_string(ItemKey::TrackTitleSortOrder)
            .map(ToOwned::to_owned),
        artist_sort: tag
            .get_string(ItemKey::TrackArtistSortOrder)
            .map(ToOwned::to_owned),
        album_sort: tag
            .get_string(ItemKey::AlbumTitleSortOrder)
            .map(ToOwned::to_owned),
        album_artist_sort: tag
            .get_string(ItemKey::AlbumArtistSortOrder)
            .map(ToOwned::to_owned),
        track_number: tag.track(),
        track_total: tag.track_total(),
        disc_number: tag.disk(),
        disc_total: tag.disk_total(),
        genre: tag.genre().map(Cow::into_owned),
        date: tag.date().map(|v| v.to_string()),
        artwork: select_artwork(&tagged, tag),
    }))
}

fn select_artwork(file: &lofty::file::TaggedFile, primary: &lofty::tag::Tag) -> ArtworkRead {
    let mut pictures: Vec<&lofty::picture::Picture> = primary.pictures().iter().collect();
    for tag in file.tags() {
        if !std::ptr::eq(tag, primary) {
            pictures.extend(tag.pictures());
        }
    }
    let has_pictures = !pictures.is_empty();
    let valid = |picture: &&&lofty::picture::Picture| -> Option<(Vec<u8>, ArtworkMimeType)> {
        let bytes = picture.data();
        if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) && PictureInformation::from_jpeg(bytes).is_ok() {
            Some((bytes.to_vec(), ArtworkMimeType::Jpeg))
        } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n")
            && PictureInformation::from_png(bytes).is_ok()
        {
            Some((bytes.to_vec(), ArtworkMimeType::Png))
        } else {
            None
        }
    };
    let mut ordered = pictures
        .iter()
        .filter(|p| p.pic_type() == PictureType::CoverFront)
        .collect::<Vec<_>>();
    ordered.extend(
        pictures
            .iter()
            .filter(|p| p.pic_type() != PictureType::CoverFront),
    );
    if let Some((bytes, mime_type)) = ordered.iter().find_map(valid) {
        ArtworkRead::Selected { bytes, mime_type }
    } else if has_pictures {
        ArtworkRead::Invalid
    } else {
        ArtworkRead::NotPresent
    }
}

/// The year of a tag date (`2019`, `2019-05`, `2019-05-03`): its first four characters, when they
/// are digits from 1000 to 9999. Anything else, `0000` included, is no year.
pub(crate) fn year_of(date: &str) -> Option<i32> {
    let year = date.trim().get(..4)?;
    if !year.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    year.parse()
        .ok()
        .filter(|year| (1000..=9999).contains(year))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_year_is_four_digits_from_1000_to_9999() {
        assert_eq!(year_of("2019"), Some(2019));
        assert_eq!(year_of(" 2019-05-03"), Some(2019));
        assert_eq!(year_of("1000"), Some(1000));
        assert_eq!(year_of("9999-12"), Some(9999));
        for none in [
            "0000",
            "0999",
            "19",
            "n/a",
            "+123",
            "-123",
            "日本語日本語",
            "",
        ] {
            assert_eq!(year_of(none), None, "{none:?}");
        }
    }
}
