use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path},
    sync::atomic::{AtomicU64, Ordering},
};

static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone)]
pub struct StoredArtwork {
    pub hash: String,
    pub mime_type: String,
    pub relative_path: String,
    pub byte_length: u64,
}

pub(crate) fn is_canonical_source_path(hash: &str, mime_type: &str, relative: &str) -> bool {
    let extension = match mime_type {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        _ => return false,
    };
    hash.len() == 64
        && hash.bytes().all(|b| b.is_ascii_hexdigit())
        && relative == format!("artwork/{}/{}.{}", &hash[..2], hash, extension)
}

pub(crate) fn is_canonical_relative_path(relative: &str) -> bool {
    let parts: Vec<_> = relative.split('/').collect();
    if parts.len() != 3 || parts[0] != "artwork" || parts[1].len() != 2 {
        return false;
    }
    let (hash, extension) = if let Some(hash) = parts[2].strip_suffix(".jpg") {
        (hash, "jpg")
    } else if let Some(hash) = parts[2].strip_suffix(".png") {
        (hash, "png")
    } else {
        return false;
    };
    hash.len() == 64
        && hash.starts_with(parts[1])
        && hash.bytes().all(|b| b.is_ascii_hexdigit())
        && (extension == "jpg" || extension == "png")
}

pub fn materialize(root: &Path, bytes: &[u8], mime_type: &str) -> Result<StoredArtwork, ()> {
    let extension = match mime_type {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        _ => return Err(()),
    };
    let hash = blake3::hash(bytes).to_hex().to_string();
    let relative_path = format!("artwork/{}/{hash}.{extension}", &hash[..2]);
    let relative = Path::new(&relative_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err(());
    }
    let final_path = root.join(relative);
    if final_path.exists() {
        let size = fs::metadata(&final_path).map_err(|_| ())?.len();
        if size != bytes.len() as u64 {
            return Err(());
        }
        return Ok(StoredArtwork {
            hash,
            mime_type: mime_type.to_owned(),
            relative_path,
            byte_length: size,
        });
    }
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent).map_err(|_| ())?;
    }
    let temp_path = final_path.with_extension(format!(
        "{extension}.tmp-{}-{}",
        std::process::id(),
        TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    {
        let write_result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp_path)
                .map_err(|_| ())?;
            file.write_all(bytes).map_err(|_| ())?;
            file.flush().map_err(|_| ())?;
            Ok::<(), ()>(())
        })();
        if write_result.is_err() {
            let _ = fs::remove_file(&temp_path);
            return Err(());
        }
    }
    if fs::rename(&temp_path, &final_path).is_err() {
        let result = fs::metadata(&final_path)
            .ok()
            .filter(|metadata| metadata.len() == bytes.len() as u64);
        let _ = fs::remove_file(&temp_path);
        if result.is_some() {
            return Ok(StoredArtwork {
                hash,
                mime_type: mime_type.to_owned(),
                relative_path,
                byte_length: bytes.len() as u64,
            });
        }
        return Err(());
    }
    Ok(StoredArtwork {
        hash,
        mime_type: mime_type.to_owned(),
        relative_path,
        byte_length: bytes.len() as u64,
    })
}
