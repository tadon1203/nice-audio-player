//! Metadata is deliberately best-effort: it can never change Symphonia playability.
use lofty::{
    config::ParseOptions,
    file::TaggedFileExt,
    picture::{PictureInformation, PictureType},
    prelude::Accessor,
    probe::Probe,
    tag::ItemKey,
};
#[derive(Debug, Clone, Default)]
pub struct SourceMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub genre: Option<String>,
    pub date: Option<String>,
    pub artwork: ArtworkRead,
}
#[derive(Debug, Clone, Default)]
pub enum ArtworkRead {
    #[default]
    NotPresent,
    Unavailable,
    Invalid,
    Selected {
        bytes: Vec<u8>,
        mime_type: &'static str,
    },
}
pub fn read_source_metadata(path: &std::path::Path) -> Result<Option<SourceMetadata>, ()> {
    let tagged = Probe::open(path)
        .map_err(|_| ())?
        .options(ParseOptions::new().read_properties(false))
        .read()
        .map_err(|_| ())?;
    let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else {
        return Ok(None);
    };
    Ok(Some(SourceMetadata {
        title: tag.title().map(|v| v.into_owned()),
        artist: tag.artist().map(|v| v.into_owned()),
        album: tag.album().map(|v| v.into_owned()),
        album_artist: tag.get_string(ItemKey::AlbumArtist).map(ToOwned::to_owned),
        track_number: tag.track(),
        track_total: tag.track_total(),
        disc_number: tag.disk(),
        disc_total: tag.disk_total(),
        genre: tag.genre().map(|v| v.into_owned()),
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
    let valid = |picture: &&&lofty::picture::Picture| -> Option<(Vec<u8>, &'static str)> {
        let bytes = picture.data();
        if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) && PictureInformation::from_jpeg(bytes).is_ok() {
            Some((bytes.to_vec(), "image/jpeg"))
        } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n")
            && PictureInformation::from_png(bytes).is_ok()
        {
            Some((bytes.to_vec(), "image/png"))
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
