//! The states stored as text in the library tables. Each one is a Rust enum, so a misspelled
//! state is a compile error instead of a row that silently matches nothing; the migration's
//! CHECK constraints list the same names.

use rusqlite::{
    types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef},
    Result as SqlResult,
};

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
        impl ToSql for $name {
            fn to_sql(&self) -> SqlResult<ToSqlOutput<'_>> {
                Ok(self.as_str().into())
            }
        }
        impl FromSql for $name {
            fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
                match value.as_str()? {
                    $($text => Ok(Self::$variant),)+
                    _ => Err(FromSqlError::InvalidType),
                }
            }
        }
    };
}

pub use super::models::{
    LibraryFileAvailability as Availability, LibraryInspectionStatus as InspectionStatus,
};

sql_text_enum!(Availability {
    Available => "available",
    Missing => "missing",
});

sql_text_enum!(InspectionStatus {
    Pending => "pending",
    Indexed => "indexed",
    Unsupported => "unsupported",
    Failed => "failed",
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
