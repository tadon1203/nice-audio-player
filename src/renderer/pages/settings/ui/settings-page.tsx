import { PageTitle } from "@/renderer/shared/ui/headings";
import { WorkspaceScroll } from "@/renderer/shared/ui/workspace-scroll";
import { LibraryFoldersSection } from "./library-folders-section";

export function SettingsPage() {
  return (
    <WorkspaceScroll scrollRestorationId="settings" contentClassName="min-h-full py-8 pb-16">
      <section aria-labelledby="settings-heading">
        <div className="border-b border-border pb-7">
          <PageTitle id="settings-heading">Settings</PageTitle>
          <p className="mt-2 max-w-prose text-sm leading-5 text-muted-foreground">
            Manage the folders indexed by your local library.
          </p>
        </div>
        <LibraryFoldersSection />
      </section>
    </WorkspaceScroll>
  );
}
