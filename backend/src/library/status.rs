//! The states stored as text in the library tables. Each one is a Rust enum, so a misspelled
//! state is a compile error instead of a row that silently matches nothing; the migration's
//! CHECK constraints list the same names.

/// Makes an enum a text column: `as_str`, `Display`, `ToSql` and `FromSql` from one table of
/// names.
macro_rules! sql_text_enum {
    ($name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        impl $name {
            pub fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $text),+ }
            }
        }
        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.as_str())
            }
        }
        impl rusqlite::ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
                Ok(self.as_str().into())
            }
        }
        impl rusqlite::types::FromSql for $name {
            fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
                match value.as_str()? {
                    $($text => Ok(Self::$variant),)+
                    _ => Err(rusqlite::types::FromSqlError::InvalidType),
                }
            }
        }
    };
}
pub(crate) use sql_text_enum;

pub use super::models::LibraryFileAvailability as Availability;

sql_text_enum!(Availability {
    Available => "available",
    Missing => "missing",
});

/// Where a file stands once inspected: `Unsupported` when it cannot be decoded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InspectionStatus {
    Indexed,
    Unsupported,
}

sql_text_enum!(InspectionStatus {
    Indexed => "indexed",
    Unsupported => "unsupported",
});

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TagStatus {
    Loaded,
    Absent,
    Failed,
}

sql_text_enum!(TagStatus {
    Loaded => "loaded",
    Absent => "absent",
    Failed => "failed",
});

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtworkStatus {
    NotPresent,
    Unavailable,
    Invalid,
    Stored,
    StoreFailed,
}

sql_text_enum!(ArtworkStatus {
    NotPresent => "notPresent",
    Unavailable => "unavailable",
    Invalid => "invalid",
    Stored => "stored",
    StoreFailed => "storeFailed",
});
