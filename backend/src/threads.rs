//! The thread helpers: the flag that stops background work, the request that waits for a
//! worker's answer, and the priority that keeps analysis out of playback's way.

use crate::errors::CommandError;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Sender, SyncSender, sync_channel};

/// A shared flag that tells background work (source loading, decoding) to stop.
#[derive(Clone, Default)]
pub struct Cancellation(Arc<AtomicBool>);

impl Cancellation {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

/// Sends a command with a reply channel and waits for the answer.
/// A closed channel is `CommandError::TaskFailed`.
pub fn request<C, T>(
    sender: &Sender<C>,
    command: impl FnOnce(SyncSender<T>) -> C,
) -> Result<T, CommandError> {
    let (reply, answer) = sync_channel(1);
    sender
        .send(command(reply))
        .map_err(|_| CommandError::TaskFailed)?;
    answer.recv().map_err(|_| CommandError::TaskFailed)
}

/// Lowers the calling thread to Windows background mode (low CPU, I/O and memory priority), so
/// analysis never competes with playback or other apps. It lasts for the life of the thread.
#[cfg(windows)]
#[expect(unsafe_code, reason = "Win32 FFI; windows-sys has no safe wrapper")]
pub fn run_in_background() {
    use windows_sys::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_MODE_BACKGROUND_BEGIN,
    };
    // SAFETY: the pseudo handle of the current thread is always valid.
    unsafe {
        SetThreadPriority(GetCurrentThread(), THREAD_MODE_BACKGROUND_BEGIN);
    }
}

#[cfg(not(windows))]
pub fn run_in_background() {}

#[cfg(test)]
mod tests {
    use super::request;
    use crate::errors::CommandError;
    use std::sync::mpsc::{SyncSender, channel};
    use std::thread;

    #[test]
    fn request_returns_the_answer_the_worker_sends() {
        let (sender, receiver) = channel::<SyncSender<u8>>();
        thread::spawn(move || receiver.recv().unwrap().send(7).unwrap());

        assert_eq!(request(&sender, |reply| reply), Ok(7));
    }

    #[test]
    fn request_is_task_failed_when_the_receiver_is_dropped() {
        let (sender, receiver) = channel::<SyncSender<u8>>();
        drop(receiver);

        assert_eq!(
            request(&sender, |reply| reply),
            Err(CommandError::TaskFailed)
        );
    }
}
