import { useState } from "react";
import { Menu, X } from "lucide-react";
import { WindowControls } from "@/renderer/widgets/window-controls";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/renderer/shared/ui/shadcn/sheet";
import { Navigation } from "./navigation";

export function TitleBar({ pathname }: { pathname: string }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  return (
    <header
      className="col-span-full grid min-w-0 grid-cols-[minmax(0,1fr)_auto] border-b border-border bg-background md:grid-cols-[16rem_minmax(0,1fr)_auto]"
      data-slot="app-titlebar"
    >
      <div className="flex min-w-0 items-center gap-2 border-sidebar-border px-2 md:border-r md:px-4">
        <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="md:hidden"
                aria-label="Open navigation"
              />
            }
          >
            <Menu aria-hidden="true" className="size-4" />
          </SheetTrigger>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-64 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
          >
            <div className="flex h-10 items-center justify-between border-b border-sidebar-border px-3">
              <SheetTitle className="text-sm font-medium">Nice Audio Player</SheetTitle>
              <SheetClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Close navigation"
                  />
                }
              >
                <X aria-hidden="true" className="size-4" />
              </SheetClose>
            </div>
            <Navigation pathname={pathname} onNavigate={() => setMobileNavigationOpen(false)} />
          </SheetContent>
        </Sheet>
        <span
          className="truncate px-1 text-sm font-medium text-foreground md:px-0"
          data-tauri-drag-region
        >
          Nice Audio Player
        </span>
        <div aria-hidden="true" className="min-w-0 flex-1" data-tauri-drag-region />
      </div>
      <div aria-hidden="true" className="hidden min-w-0 md:block" data-tauri-drag-region />
      <WindowControls />
    </header>
  );
}
