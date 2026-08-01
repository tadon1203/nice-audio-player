export const layoutStressFixtures = {
  longFilename:
    "A recording with an exceptionally long descriptive filename that must remain usable across narrow desktop layouts.flac",
  japaneseFilename:
    "東京都交響楽団による非常に長い演奏会録音ファイル名として保存された音声資料.flac",
  unbrokenFilename: "RECORDING_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ.flac",
  longDeviceName:
    "Digital Audio Interface (High Definition USB Audio Device with Extended Channel Routing)",
  longError:
    "Playback could not begin because the selected output device is no longer available and the system default device could not be opened.",
} as const;
