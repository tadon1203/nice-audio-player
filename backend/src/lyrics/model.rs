use crate::errors::CommonError;
use crate::ids::TrackId;
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
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LyricsResolution {
    Resolved {
        track_id: TrackId,
        document: LyricsDocument,
        notice: Option<LyricsResolutionNotice>,
    },
    NotFound {
        track_id: TrackId,
    },
    SourceFailed {
        track_id: TrackId,
        /// The name of the sidecar file the track looks for, without its folder.
        sidecar_file_name: String,
    },
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(
    tag = "code",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LyricsCommandError {
    Common { error: CommonError },
}

impl crate::tasks::TaskError for LyricsCommandError {
    fn task_failed() -> Self {
        Self::Common {
            error: CommonError::TaskFailed,
        }
    }
}

#[derive(Debug, Clone)]
pub struct LyricsTrackContext {
    pub track_id: TrackId,
    pub source: PathBuf,
    pub root: PathBuf,
}
