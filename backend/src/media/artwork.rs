use serde::Serialize;

/// Stored artwork as the renderer addresses it. Shared by the library catalog and playback items.
#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ArtworkMimeType {
    Jpeg,
    Png,
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkRef {
    pub content_hash: String,
    pub mime_type: ArtworkMimeType,
    pub relative_path: String,
}
