//! The locks the Backend and the Host take. Each function says how it recovers.

use std::sync::{
    Condvar, Mutex, MutexGuard, PoisonError, RwLock, RwLockReadGuard, RwLockWriteGuard,
};

/// Locks `mutex`. A poisoned lock is recovered: the guarded data of this crate stays valid
/// when a holder panics, and one panicking thread must not stop the others.
#[expect(
    clippy::disallowed_methods,
    reason = "this is the one place that calls `Mutex::lock`"
)]
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Waits on `condvar`, with the same recovery.
#[expect(
    clippy::disallowed_methods,
    reason = "this is the one place that calls `Condvar::wait`"
)]
pub fn wait<'a, T>(condvar: &Condvar, guard: MutexGuard<'a, T>) -> MutexGuard<'a, T> {
    condvar.wait(guard).unwrap_or_else(PoisonError::into_inner)
}

/// Read-locks `lock`, with the same recovery.
#[expect(
    clippy::disallowed_methods,
    reason = "this is the one place that calls `RwLock::read`"
)]
pub fn read<T>(lock: &RwLock<T>) -> RwLockReadGuard<'_, T> {
    lock.read().unwrap_or_else(PoisonError::into_inner)
}

/// Write-locks `lock`, with the same recovery.
#[expect(
    clippy::disallowed_methods,
    reason = "this is the one place that calls `RwLock::write`"
)]
pub fn write<T>(lock: &RwLock<T>) -> RwLockWriteGuard<'_, T> {
    lock.write().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use super::{lock, read, wait, write};
    use std::sync::{Condvar, Mutex, RwLock};
    use std::thread;

    /// Poisons `mutex` the way a panicking holder does, and checks that it is poisoned.
    fn poison<T: Send>(mutex: &Mutex<T>) {
        let holder = thread::scope(|s| {
            s.spawn(|| {
                let _held = mutex.try_lock().unwrap();
                panic!("the holder panicked");
            })
            .join()
        });
        assert!(holder.is_err());
        assert!(mutex.is_poisoned());
    }

    #[test]
    fn lock_recovers_a_poisoned_mutex() {
        let mutex = Mutex::new(7);
        poison(&mutex);

        assert_eq!(*lock(&mutex), 7);
    }

    #[test]
    fn read_and_write_recover_a_poisoned_rwlock() {
        let rwlock = RwLock::new(7);
        thread::scope(|s| {
            let holder = s
                .spawn(|| {
                    let _held = rwlock.try_write().unwrap();
                    panic!("the holder panicked");
                })
                .join();
            assert!(holder.is_err());
        });
        assert!(rwlock.is_poisoned());

        assert_eq!(*read(&rwlock), 7);
        *write(&rwlock) = 8;
        assert_eq!(*read(&rwlock), 8);
    }

    #[test]
    fn wait_returns_after_a_notify_and_recovers_a_poisoned_guard() {
        let mutex = Mutex::new(false);
        let condvar = Condvar::new();
        poison(&mutex);

        thread::scope(|s| {
            s.spawn(|| {
                *lock(&mutex) = true;
                condvar.notify_one();
            });
            let mut ready = lock(&mutex);
            while !*ready {
                ready = wait(&condvar, ready);
            }
        });
        assert!(*lock(&mutex));
    }
}
