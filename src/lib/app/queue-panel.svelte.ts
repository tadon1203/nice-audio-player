/** The Queue panel's open state. A view preference, not domain state. */
export class QueuePanel {
  public isOpen = $state(false);

  public open(): void {
    this.isOpen = true;
  }

  public close(): void {
    this.isOpen = false;
  }

  public toggle(): void {
    this.isOpen = !this.isOpen;
  }
}
