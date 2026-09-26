use std::path::PathBuf;

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LyricsSourceKind {
    Sidecar,
    Embedded,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LyricsTimedLine {
    pub start_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LyricsContent {
    Plain { lines: Vec<String> },
    Timed { lines: Vec<LyricsTimedLine> },
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LyricsDocument {
    pub source: LyricsSourceKind,
    pub language: Option<String>,
    pub content: LyricsContent,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LyricsResolutionNotice {
    SidecarFailedUsingEmbedded,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LyricsResolution {
    Resolved {
        track_id: String,
        document: LyricsDocument,
        notice: Option<LyricsResolutionNotice>,
    },
    NotFound {
        track_id: String,
    },
    SourceFailed {
        track_id: String,
    },
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum LyricsCommandError {
    InvalidId,
    TrackNotFound,
    TrackUnavailable,
    LibraryUnavailable,
    PersistenceFailed,
    TaskFailed,
}

#[derive(Debug, Clone)]
pub struct LyricsTrackContext {
    pub track_id: String,
    pub source: PathBuf,
    pub root: PathBuf,
}
