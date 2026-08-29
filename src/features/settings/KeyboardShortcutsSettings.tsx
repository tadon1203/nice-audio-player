import { Kbd } from "@/components/ui/kbd";
export function KeyboardShortcutsSettings() {
  return (
    <section
      className="settings-view__section settings-view__shortcuts"
      aria-labelledby="shortcuts-title"
    >
      <h2 id="shortcuts-title" className="type-section-title">
        Keyboard shortcuts
      </h2>
      <p>Keep playback within reach while you browse.</p>
      <dl>
        <div>
          <dt>
            <Kbd>Space</Kbd>
          </dt>
          <dd>Play or pause</dd>
        </div>
        <div>
          <dt>
            <Kbd>Q</Kbd>
          </dt>
          <dd>Open or close Queue</dd>
        </div>
        <div>
          <dt>
            <Kbd>Escape</Kbd>
          </dt>
          <dd>Close Queue or a menu</dd>
        </div>
      </dl>
    </section>
  );
}
