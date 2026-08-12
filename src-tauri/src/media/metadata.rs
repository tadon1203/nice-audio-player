//! Metadata is deliberately best-effort: it can never change Symphonia playability.
use lofty::{
    config::ParseOptions, file::TaggedFileExt, prelude::Accessor, probe::Probe, tag::ItemKey,
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
    }))
}
