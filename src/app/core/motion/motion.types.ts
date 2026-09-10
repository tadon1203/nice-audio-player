export interface PendingSharedTransition {
	complete(): void;
	cancel(): void;
}
export interface MotionScope {
	beginSharedTransition(): PendingSharedTransition | null;
}
