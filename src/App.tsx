import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

import { isAudioFileValidationError, validateAudioFile } from "@/api/audio-files";
import type { ValidatedAudioFile } from "@/types/audio-files";

function formatValidationError(error: unknown): string {
  if (!isAudioFileValidationError(error)) {
    return "The selected file could not be validated.";
  }

  switch (error.code) {
    case "emptyPath":
      return "Select an audio file first.";
    case "notFound":
      return "File not found.";
    case "notAFile":
      return "The selected path is not a file.";
    case "unsupportedExtension": {
      const extension = error.details?.extension;
      return extension
        ? `.${extension} is not currently supported.`
        : "The selected file has no supported extension.";
    }
    case "invalidFileName":
      return "The selected file name is invalid.";
  }
}

function App() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [validatedFile, setValidatedFile] = useState<ValidatedAudioFile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

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
      setValidatedFile(null);
      setValidationError(null);

      try {
        setValidatedFile(await validateAudioFile(result));
      } catch (error: unknown) {
        setValidationError(formatValidationError(error));
      }
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

        {validatedFile ? (
          <dl className="mt-4 space-y-1 text-sm text-zinc-300">
            <div>
              <dt className="inline text-zinc-500">File: </dt>
              <dd className="inline">{validatedFile.fileName}</dd>
            </div>
            <div>
              <dt className="inline text-zinc-500">Extension: </dt>
              <dd className="inline">.{validatedFile.extension}</dd>
            </div>
          </dl>
        ) : null}

        {validationError ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {validationError}
          </p>
        ) : null}
      </section>
    </main>
  );
}

export default App;
