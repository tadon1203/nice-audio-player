from pathlib import Path
import argparse
import subprocess
import zipfile


INTERNAL_FILES = {"_prompts.md"}
EXCLUDED_PATHS = {
    ".angular",
    ".pnpm-store",
    "project_snapshot.zip",
}


def main():
    parser = argparse.ArgumentParser(description="Create a zip snapshot of the project worktree.")
    parser.add_argument("output", nargs="?", default="project_snapshot.zip")
    parser.add_argument("--root", default=".")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    output = Path(args.output).resolve()

    result = subprocess.run(
        [
            "git",
            "-C",
            str(root),
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
        ],
        check=True,
        capture_output=True,
    )

    files = []
    for entry in result.stdout.split(b"\0"):
        if not entry:
            continue
        relative = Path(entry.decode("utf-8"))
        relative_posix = relative.as_posix()
        if relative_posix in INTERNAL_FILES or any(
            part in EXCLUDED_PATHS for part in relative.parts
        ):
            continue
        path = root / relative
        if path.is_file() and path.resolve() != output:
            files.append(path)

    with zipfile.ZipFile(
        output,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for path in files:
            archive.write(path, path.relative_to(root).as_posix())

    print(f"Created: {output}")
    print(f"Files: {len(files)}")


if __name__ == "__main__":
    main()
