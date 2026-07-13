import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

function App() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  async function selectAudioFile(): Promise<void> {
    const result = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Audio",
          extensions: ["mp3", "flac", "wav", "m4a", "aac"],
        },
      ],
    });

    if (typeof result === "string") {
      setSelectedPath(result);
    }
  }

  return (
    <main className="grid h-screen place-items-center bg-zinc-950 p-8 text-zinc-100">
      <section className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <p className="text-sm text-zinc-400">Nice Audio Player</p>

        <h1 className="mt-2 text-3xl font-semibold">Audio file selection</h1>

        <button
          type="button"
          onClick={() => void selectAudioFile()}
          className="mt-6 rounded-lg bg-zinc-100 px-4 py-2 font-medium text-zinc-950"
        >
          音楽ファイルを選択
        </button>

        <p className="mt-4 break-all text-sm text-zinc-400">
          {selectedPath ?? "ファイルは選択されていません"}
        </p>
      </section>
    </main>
  );
}

export default App;
