import { WorkspaceContainer } from "@/renderer/shared/layout/workspace-container";
import { ScrollArea } from "@/renderer/shared/ui/shadcn/scroll-area";
import { LibraryFoldersSection } from "./library-folders-section";

export function SettingsPage() {
  return (
    <div className="block h-full min-h-0 min-w-0 overflow-hidden">
      <ScrollArea className="h-full">
        <WorkspaceContainer className="min-h-full py-8 pb-16">
          <section aria-labelledby="settings-heading">
            <div className="border-b border-border pb-7">
              <h1
                id="settings-heading"
                className="text-2xl font-normal leading-8 tracking-tight text-foreground"
              >
                Settings
              </h1>
              <p className="mt-2 max-w-prose text-sm leading-5 text-muted-foreground">
                Manage the folders indexed by your local library.
              </p>
            </div>
            <LibraryFoldersSection />
          </section>
        </WorkspaceContainer>
      </ScrollArea>
    </div>
  );
}
