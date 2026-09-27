use rusqlite::Connection;
pub const CURRENT_SCHEMA_VERSION: i32 = 2;
const MIGRATIONS: [&str; 2] = [
    include_str!("migrations/0001_library.sql"),
    include_str!("migrations/0002_artwork_accent.sql"),
];
#[derive(Debug)]
pub enum MigrationError {
    SchemaTooNew,
    Sql,
}
impl From<rusqlite::Error> for MigrationError {
    fn from(_: rusqlite::Error) -> Self {
        Self::Sql
    }
}
pub fn apply(connection: &mut Connection) -> Result<(), MigrationError> {
    let version: i32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version > CURRENT_SCHEMA_VERSION {
        return Err(MigrationError::SchemaTooNew);
    };
    if version == CURRENT_SCHEMA_VERSION {
        return Ok(());
    };
    let transaction = connection.transaction()?;
    for sql in MIGRATIONS.iter().skip(version as usize) {
        transaction.execute_batch(sql)?;
    }
    transaction.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;
    transaction.commit()?;
    Ok(())
}
