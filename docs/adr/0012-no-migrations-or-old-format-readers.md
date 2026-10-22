# 0012: No migrations or old-format readers

The app does not migrate old data, and it does not read old formats. Old data is deleted and rebuilt. This covers the database, the settings, and the waveform cache.

Reason: no user outside the project has data that must be kept. A rebuild from the source costs less than code that reads an old format. That code runs rarely, so it is rarely tested, and it adds a second path to every format change.

Revisit this decision when the app is distributed. At that point, users have data that a rebuild would lose.
