/** The Queue panel's open state. A view preference, not domain state. */
class QueuePanel {
  isOpen = $state(false);

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }
}

export const queuePanel = new QueuePanel();
