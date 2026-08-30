import { Kbd } from "@/components/ui/kbd";
import { typographyVariants } from "@/components/ui/typography";
export function KeyboardShortcutsSettings() {
  return (
    <section className="mt-12" aria-labelledby="shortcuts-title">
      <h2 id="shortcuts-title" className={typographyVariants({ role: "section-title" })}>
        Keyboard shortcuts
      </h2>
      <p>Keep playback within reach while you browse.</p>
      <dl className="mt-4 grid max-w-[32rem] gap-2">
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 border-b border-border-subtle py-2">
          <dt>
            <Kbd>Space</Kbd>
          </dt>
          <dd>Play or pause</dd>
        </div>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 border-b border-border-subtle py-2">
          <dt>
            <Kbd>Q</Kbd>
          </dt>
          <dd>Open or close Queue</dd>
        </div>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 border-b border-border-subtle py-2">
          <dt>
            <Kbd>Escape</Kbd>
          </dt>
          <dd>Close Queue or a menu</dd>
        </div>
      </dl>
    </section>
  );
}
