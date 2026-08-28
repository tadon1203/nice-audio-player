use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::thread::{self, JoinHandle};

use log::error;

use super::super::compressed_source::{
    prepare_compressed_source, CompressedAudioSource, CompressedSourceError, SourceLoadCancellation,
};
use crate::media::validation::ValidatedAudioFile;

pub(crate) struct SourceLoadWorker {
    cancellation: SourceLoadCancellation,
    receiver: Receiver<Result<CompressedAudioSource, CompressedSourceError>>,
    join_handle: Option<JoinHandle<()>>,
}

impl SourceLoadWorker {
    pub(crate) fn spawn(file: ValidatedAudioFile) -> Result<Self, ()> {
        let cancellation = SourceLoadCancellation::default();
        let (sender, receiver) = mpsc::sync_channel(1);
        let worker_cancellation = cancellation.clone();
        let join_handle = thread::Builder::new()
            .name("audio-source-load".into())
            .spawn(move || {
                let result = prepare_compressed_source(&file, &worker_cancellation);
                let _ = sender.send(result);
            })
            .map_err(|_| ())?;
        Ok(Self {
            cancellation,
            receiver,
            join_handle: Some(join_handle),
        })
    }

    pub(crate) fn try_complete(
        &mut self,
    ) -> Result<Option<Result<CompressedAudioSource, CompressedSourceError>>, ()> {
        match self.receiver.try_recv() {
            Ok(result) => {
                self.join_finished()?;
                Ok(Some(result))
            }
            Err(TryRecvError::Empty) => Ok(None),
            Err(TryRecvError::Disconnected) => {
                self.join_finished()?;
                error!("playback.source_loader_panicked");
                Err(())
            }
        }
    }

    pub(crate) fn cancel_and_join(mut self) {
        self.cancellation.cancel();
        if let Some(handle) = self.join_handle.take() {
            if handle.join().is_err() {
                error!("playback.source_loader_panicked");
            }
        }
    }

    fn join_finished(&mut self) -> Result<(), ()> {
        let Some(handle) = self.join_handle.take() else {
            return Ok(());
        };
        if handle.join().is_err() {
            error!("playback.source_loader_panicked");
            return Err(());
        }
        Ok(())
    }
}
