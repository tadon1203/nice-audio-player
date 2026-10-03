use specta::{datatype::DataType, Type, Types};
use tauri::ipc::{Channel, InvokeResponseBody, IpcResponse};

use crate::AppState;

/// What a meter channel carries: one binary message per Meter frame, which the renderer
/// receives as an `ArrayBuffer` (layout: `FRAME_BYTES` in the backend's `meter` module). Only
/// the TypeScript contract is described here; the bytes are sent raw.
pub struct MeterFrameBytes(Vec<u8>);

impl IpcResponse for MeterFrameBytes {
    fn body(self) -> tauri::Result<InvokeResponseBody> {
        Ok(InvokeResponseBody::Raw(self.0))
    }
}

impl Type for MeterFrameBytes {
    fn definition(_: &mut Types) -> DataType {
        DataType::Reference(specta_typescript::define("ArrayBuffer"))
    }
}

/// Starts streaming Meter frames to `frames` as binary messages (see `FRAME_BYTES` in the
/// backend's `meter` module for the layout), replacing any earlier subscription. Returns the id
/// to end it with. Frames the channel cannot deliver are dropped; a channel that is gone ends
/// the subscription.
#[tauri::command]
#[specta::specta]
pub async fn subscribe_meter_frames(
    frames: Channel<MeterFrameBytes>,
    state: tauri::State<'_, AppState>,
) -> Result<u32, ()> {
    let meter = state.backend.playback.meter();
    // Replacing a subscription waits for the old analysis thread to end.
    tauri::async_runtime::spawn_blocking(move || {
        meter.subscribe(Box::new(move |frame| {
            frames
                .send(MeterFrameBytes(frame.to_bytes().to_vec()))
                .is_ok()
        }))
    })
    .await
    .map_err(|_| ())
}

/// Ends the subscription `subscription` names; one that was already replaced or ended is left
/// alone.
#[tauri::command]
#[specta::specta]
pub async fn unsubscribe_meter_frames(
    subscription: u32,
    state: tauri::State<'_, AppState>,
) -> Result<(), ()> {
    let meter = state.backend.playback.meter();
    tauri::async_runtime::spawn_blocking(move || meter.unsubscribe(subscription))
        .await
        .map_err(|_| ())
}
