from pathlib import Path
import argparse
import subprocess
import zipfile


def main():
    parser = argparse.ArgumentParser()
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

    files = [
        root / path.decode("utf-8")
        for path in result.stdout.split(b"\0")
        if path
    ]

    with zipfile.ZipFile(
        output,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for path in files:
            if path.is_file() and path.resolve() != output:
                archive.write(path, path.relative_to(root).as_posix())

    print(f"Created: {output}")
    print(f"Files: {len(files)}")


if __name__ == "__main__":
    main()