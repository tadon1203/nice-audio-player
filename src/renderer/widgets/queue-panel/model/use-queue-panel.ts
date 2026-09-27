import { create } from "zustand";

type QueuePanelState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

/** The Queue panel's open state. A view preference, not domain state. */
export const useQueuePanelStore = create<QueuePanelState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

export function useQueuePanel() {
  return useQueuePanelStore();
}
