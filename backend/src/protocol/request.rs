use crate::library::models::{
    LibraryAlbumArtistSortKey, LibraryAlbumKey, LibraryAlbumSortKey, LibraryArtistAlbumSortKey,
    LibrarySortDirection, LibraryTrackSortKey,
};
use garde::Validate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(
    tag = "method",
    content = "params",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum BackendRequest {
    Ping,
    GetPlaybackState,
    GetPlaybackQueue,
    PausePlayback,
    ResumePlayback,
    PreviousPlayback,
    NextPlayback,
    SeekPlayback {
        position_ms: u64,
    },
    SetPlaybackVolume {
        volume: f32,
    },
    SetPlaybackMuted {
        muted: bool,
    },
    ListAudioOutputDevices,
    GetApplicationActivities,
    GetLibraryStatus,
    GetLibraryTrackForPath {
        path: String,
    },
    ValidateAudioFile {
        path: String,
    },
    ListLibraryRoots,
    RegisterLibraryRoot {
        path: String,
    },
    SetLibraryRootEnabled {
        id: String,
        enabled: bool,
    },
    RemoveLibraryRoot {
        id: String,
    },
    GetLibraryScanState,
    StartLibraryScan,
    CancelLibraryScan,
    ListLibraryTracks {
        cursor: Option<String>,
        search: Option<String>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
    },
    ListLibraryAlbums {
        cursor: Option<String>,
        search: Option<String>,
        sort_key: LibraryAlbumSortKey,
        sort_direction: LibrarySortDirection,
    },
    ListLibraryAlbumArtists {
        cursor: Option<String>,
        search: Option<String>,
        sort_key: LibraryAlbumArtistSortKey,
        sort_direction: LibrarySortDirection,
    },
    GetLibraryAlbumArtist {
        artist_key: crate::library::models::LibraryAlbumArtistKey,
    },
    ListLibraryArtistAlbums {
        artist_key: crate::library::models::LibraryAlbumArtistKey,
        cursor: Option<String>,
        sort_key: LibraryArtistAlbumSortKey,
        sort_direction: LibrarySortDirection,
    },
    GetLibraryAlbumDetails {
        album_key: LibraryAlbumKey,
    },
    ListLibraryAlbumTracks {
        album_key: LibraryAlbumKey,
        cursor: Option<String>,
    },
    StartLibraryTrack {
        track_id: String,
    },
    StartLibraryAlbum {
        album_key: LibraryAlbumKey,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequestEnvelope {
    pub id: u64,
    pub request: BackendRequest,
}

pub type Envelope = RequestEnvelope;

#[derive(Debug, garde::Validate)]
struct PathParams {
    #[garde(length(min = 1))]
    path: String,
}

#[derive(Debug, garde::Validate)]
struct IdParams {
    #[garde(length(min = 1))]
    id: String,
}

#[derive(Debug, garde::Validate)]
struct VolumeParams {
    #[garde(range(min = 0.0, max = 1.0))]
    volume: f32,
}

#[derive(Debug, garde::Validate)]
struct SeekParams {
    #[garde(range(min = 0))]
    position_ms: u64,
}

impl BackendRequest {
    pub fn validate_request(&self) -> Result<(), garde::Report> {
        match self {
            Self::SeekPlayback { position_ms } => SeekParams {
                position_ms: *position_ms,
            }
            .validate(),
            Self::SetPlaybackVolume { volume } => VolumeParams { volume: *volume }.validate(),
            Self::GetLibraryTrackForPath { path }
            | Self::ValidateAudioFile { path }
            | Self::RegisterLibraryRoot { path } => PathParams { path: path.clone() }.validate(),
            Self::SetLibraryRootEnabled { id, .. } | Self::RemoveLibraryRoot { id } => {
                IdParams { id: id.clone() }.validate()
            }
            Self::GetLibraryAlbumArtist { artist_key } => IdParams {
                id: artist_key.name.clone(),
            }
            .validate(),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_rejects_null_for_required_numbers_and_accepts_nullable_strings() {
        assert!(serde_json::from_str::<BackendRequest>(
            r#"{"method":"seekPlayback","params":{"position_ms":null}}"#
        )
        .is_err());
        let request = serde_json::from_str::<BackendRequest>(
            r#"{"method":"listLibraryTracks","params":{"cursor":null,"search":null,"sort_key":"title","sort_direction":"ascending"}}"#,
        )
        .expect("nullable cursor and search should deserialize");
        assert!(request.validate_request().is_ok());
    }

    #[test]
    fn garde_enforces_request_constraints_before_dispatch() {
        let empty_path = BackendRequest::ValidateAudioFile {
            path: String::new(),
        };
        assert!(empty_path.validate_request().is_err());
        let invalid_volume = BackendRequest::SetPlaybackVolume { volume: 1.1 };
        assert!(invalid_volume.validate_request().is_err());
        let valid_volume = BackendRequest::SetPlaybackVolume { volume: 0.5 };
        assert!(valid_volume.validate_request().is_ok());
    }

    #[test]
    fn unknown_fields_are_rejected_at_the_protocol_boundary() {
        assert!(serde_json::from_str::<RequestEnvelope>(
            r#"{"id":1,"request":{"method":"ping"},"extra":true}"#
        )
        .is_err());
        assert!(serde_json::from_str::<RequestEnvelope>(
            r#"{"id":1,"request":{"method":"ping","extra":true}}"#
        )
        .is_err());
    }
}
