//! Missing tracks: the tracks whose file is gone. Deleting them forgets them for good. Source files
//! are never touched.

use crate::library::errors::Result;
use crate::library::storage::Database;
use crate::library::sync::rebuild::rebuild_albums_and_artists;

/// Forgets the tracks whose file is gone, for good, then rebuilds the albums. Never touches a source
/// file.
pub(crate) fn delete_missing_tracks(database: &Database) -> Result<()> {
    let mut connection = database.write()?;
    let transaction = connection.transaction()?;
    // Tracks and their metadata cascade.
    transaction.execute(
        "DELETE FROM library_files WHERE availability = 'missing'",
        [],
    )?;
    rebuild_albums_and_artists(&transaction)?;
    transaction.commit()?;
    Ok(())
}
