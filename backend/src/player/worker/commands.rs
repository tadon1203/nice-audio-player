//! Dispatches each player command to the method that carries it out.

use super::PlayerWorker;
use super::types::PlayerCommand;
use crate::threads::answer;

impl PlayerWorker {
    /// Carries out a command and answers it. Returns `false` when the command stops the worker.
    pub(super) fn handle_command(&mut self, command: PlayerCommand) -> bool {
        match command {
            PlayerCommand::PlayQueue {
                tracks,
                start,
                reply,
            } => {
                answer(&reply, self.play_queue(tracks, start));
            }
            PlayerCommand::Enqueue {
                tracks,
                next,
                reply,
            } => {
                answer(&reply, self.enqueue(tracks, next));
            }
            PlayerCommand::Pause { reply } => {
                self.pause();
                answer(&reply, Ok(()));
            }
            PlayerCommand::Resume { reply } => {
                answer(&reply, self.resume());
            }
            PlayerCommand::Previous { reply } => {
                answer(&reply, self.previous());
            }
            PlayerCommand::Next { reply } => {
                answer(&reply, self.next());
            }
            PlayerCommand::Seek { position_ms, reply } => {
                answer(&reply, self.seek(position_ms));
            }
            PlayerCommand::SetVolume { volume, reply } => {
                self.set_volume(volume);
                answer(&reply, Ok(()));
            }
            PlayerCommand::SetMuted { muted, reply } => {
                self.set_muted(muted);
                answer(&reply, Ok(()));
            }
            PlayerCommand::SetOutputSelection { selection, reply } => {
                self.set_output_selection(selection);
                answer(&reply, Ok(()));
            }
            PlayerCommand::SetRepeatMode { mode, reply } => {
                self.set_repeat_mode(mode);
                answer(&reply, Ok(()));
            }
            PlayerCommand::SetShuffle { enabled, reply } => {
                self.set_shuffle(enabled);
                answer(&reply, Ok(()));
            }
            PlayerCommand::RemoveQueueItem { id, reply } => {
                answer(&reply, self.remove_queue_item(id));
            }
            PlayerCommand::MoveQueueItem { id, to, reply } => {
                answer(&reply, self.move_queue_item(id, to));
            }
            PlayerCommand::PlayQueueItem { id, reply } => {
                answer(&reply, self.play_queue_item(id));
            }
            PlayerCommand::ClearQueue { reply } => {
                self.clear_queue();
                answer(&reply, Ok(()));
            }
            PlayerCommand::RestorePreviousQueue { reply } => {
                answer(&reply, self.restore_previous_queue());
            }
            PlayerCommand::QueueWindow {
                offset,
                limit,
                reply,
            } => {
                answer(&reply, Ok(self.queue_window(offset, limit)));
            }
            PlayerCommand::Shutdown => return false,
        }
        true
    }
}
