import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/renderer/shared/ui/shadcn/button";

function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const desktop = isTauri();

  useEffect(() => {
    if (!desktop) return;

    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const syncMaximized = () =>
      void appWindow.isMaximized().then((value) => {
        if (!disposed) setMaximized(value);
      });

    syncMaximized();
    void appWindow.onResized(syncMaximized).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);

  if (!desktop) return null;

  return (
    <div className="flex h-10 shrink-0 items-stretch" aria-label="Window controls" role="group">
      <Button
        type="button"
        variant="ghost"
        className="size-10 rounded-none"
        aria-label="Minimize window"
        onClick={() => void getCurrentWindow().minimize()}
      >
        <Minus aria-hidden="true" className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="size-10 rounded-none"
        aria-label={maximized ? "Restore window" : "Maximize window"}
        onClick={() => void getCurrentWindow().toggleMaximize()}
      >
        {maximized ? (
          <Copy aria-hidden="true" className="size-3.5" />
        ) : (
          <Square aria-hidden="true" className="size-3.5" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="size-10 rounded-none hover:bg-destructive hover:text-destructive-foreground"
        aria-label="Close window"
        onClick={() => void getCurrentWindow().close()}
      >
        <X aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

export { WindowControls };
