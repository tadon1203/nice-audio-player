//! The thread helpers: the flag that stops background work, the reply a worker answers on, the
//! request that waits for that answer, the handle that joins a worker thread, and the priority
//! that keeps analysis out of playback's way.

use crate::errors::Error;
use log::error;
use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Sender, SyncSender, sync_channel};
use std::thread::{self, JoinHandle};

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

/// Where a worker answers one command. The answer is sent once, by the worker.
pub type Reply<T> = SyncSender<crate::Result<T>>;

/// Answers a command, if its caller is still waiting. A caller that has gone away is logged, not
/// an error.
pub fn answer<T>(reply: &Reply<T>, result: crate::Result<T>) {
    let _ = reply.send(result);
}

/// Sends a command with its reply and waits for the answer. A worker that has stopped, before or
/// while it answers, is `Error::WorkerStopped`.
pub fn request<C, T>(sender: &Sender<C>, command: impl FnOnce(Reply<T>) -> C) -> crate::Result<T> {
    let (reply, answer) = sync_channel(1);
    sender
        .send(command(reply))
        .ok()
        .ok_or(Error::WorkerStopped)?;
    answer.recv().ok().ok_or(Error::WorkerStopped)?
}

/// A named thread that its owner joins: once in `join`, and again when the handle is dropped.
/// Calling `join` again does nothing. The owner must stop the thread's loop first.
pub struct WorkerThread {
    name: String,
    handle: Mutex<Option<JoinHandle<()>>>,
}

impl WorkerThread {
    /// Starts `run` on a thread called `name`. Panics if the OS cannot start it.
    pub fn spawn(name: &str, run: impl FnOnce() + Send + 'static) -> Self {
        let handle = thread::Builder::new()
            .name(name.into())
            .spawn(run)
            .expect("the OS starts a thread unless it is out of resources");
        Self {
            name: name.into(),
            handle: Mutex::new(Some(handle)),
        }
    }

    /// Waits for the thread to finish. A thread that panicked is logged.
    pub fn join(&self) {
        if let Some(handle) = self.handle.lock().take()
            && handle.join().is_err()
        {
            error!("thread.panicked name={}", self.name);
        }
    }
}

impl Drop for WorkerThread {
    fn drop(&mut self) {
        self.join();
    }
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
    use super::{Reply, WorkerThread, request};
    use crate::errors::Error;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::mpsc::channel;
    use std::thread;

    #[test]
    fn request_returns_the_answer_the_worker_sends() {
        let (sender, receiver) = channel::<Reply<u8>>();
        thread::spawn(move || receiver.recv().unwrap().send(Ok(7)).unwrap());

        assert_eq!(request(&sender, |reply| reply).ok(), Some(7));
    }

    #[test]
    fn request_passes_on_the_error_the_worker_answers_with() {
        let (sender, receiver) = channel::<Reply<u8>>();
        thread::spawn(move || {
            receiver
                .recv()
                .unwrap()
                .send(Err(Error::QueueItemNotFound))
                .unwrap();
        });

        assert!(matches!(
            request(&sender, |reply| reply),
            Err(Error::QueueItemNotFound)
        ));
    }

    #[test]
    fn request_is_worker_stopped_when_the_receiver_is_dropped() {
        let (sender, receiver) = channel::<Reply<u8>>();
        drop(receiver);

        assert!(matches!(
            request(&sender, |reply| reply),
            Err(Error::WorkerStopped)
        ));
    }

    #[test]
    fn request_is_worker_stopped_when_the_worker_drops_the_reply() {
        let (sender, receiver) = channel::<Reply<u8>>();
        thread::spawn(move || drop(receiver.recv().unwrap()));

        assert!(matches!(
            request(&sender, |reply| reply),
            Err(Error::WorkerStopped)
        ));
    }

    #[test]
    fn a_worker_thread_is_joined_once() {
        let runs = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&runs);
        let worker = WorkerThread::spawn("test-worker", move || {
            counted.fetch_add(1, Ordering::SeqCst);
        });

        worker.join();
        worker.join();
        drop(worker);
        assert_eq!(runs.load(Ordering::SeqCst), 1);
    }
}
