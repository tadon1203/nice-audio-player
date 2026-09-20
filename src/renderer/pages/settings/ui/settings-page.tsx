import { ScrollArea } from "@/renderer/shared/ui/scroll-area";
import { LibraryFoldersSection } from "./library-folders-section";

export function SettingsPage() {
  return (
    <div className="block h-full min-h-0 min-w-0 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="mx-auto min-h-full max-w-[1360px] px-[clamp(24px,3vw,40px)] py-10 max-md:py-7">
          <section aria-labelledby="settings-heading">
            <div className="border-b border-border pb-7">
              <h1
                id="settings-heading"
                className="text-2xl font-normal leading-8 tracking-[-0.02em] text-foreground"
              >
                Settings
              </h1>
              <p className="mt-2 max-w-[65ch] text-sm leading-5 text-muted-foreground">
                Manage the folders indexed by your local library.
              </p>
            </div>
            <LibraryFoldersSection />
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
