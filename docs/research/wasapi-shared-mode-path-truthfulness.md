# Research: is the Path notation ("bit-perfect") true in WASAPI shared mode?

Question (ticket `.scratch/codebase-review/issues/03-research-path-truthfulness.md`): `CONTEXT.md` says a **Path**'s length alone shows whether playback is bit-perfect. The app plays through cpal 0.18.1, which uses WASAPI shared mode. Does a 96 kHz file yield `path=native` or `path=fallback`, does the Windows mixer still convert when the rate matches, and what should we do?

Research date: 2026-10-03. No real hardware was available. Every claim is marked **[verified]** (read in the cited source), **[inferred]** (follows from verified code/docs, not observed), or **[unverified]** (needs a log from real hardware). Sources: Microsoft Learn (Win32 Core Audio docs), the cpal 0.18.1 source as vendored in `~/.cargo/registry/src/*/cpal-0.18.1/` (cited `cpal:wasapi/device.rs:N`), and this repo.

## Answer

1. **96 kHz file, shared mode: `path=fallback`, unless the device's shared-mode format is already 96 kHz.** [inferred from verified code and docs] On the common 44.1 or 48 kHz mix format, cpal advertises 96 kHz but refuses to build the stream, and the app falls back to the mix format and resamples itself. `path=native` happens only when the file's rate and channel count equal the device's shared-mode (mix) format.
2. **Yes, the mixer still sits in the path even when `path=native`, so "bit-perfect" is not guaranteed.** [verified from docs] Shared mode always passes through the Windows audio engine (mix, float32 internal format, any APOs, session/endpoint volume, conversion to the device format). With no other audio, volume 100 %, no enhancements and a float or wide-integer device format the result may be numerically identical, but nothing in the app can verify that.
3. **Recommendation: reword the Path (and `CONTEXT.md`) so it claims only what the app can know: "the app did not change the audio" (no resampling, no channel conversion, gain 1.0).** Show the mixer format as an additional fact (cheap: already logged). Treat exclusive mode as a separate, larger feature, because cpal 0.18.1 does not support it.

Confidence: high on cpal behaviour and Microsoft semantics; medium on the exact S_OK / S_FALSE result for 96 kHz on a given driver (driver/APO dependent, see Q1).

## Q1: 96 kHz file in shared mode, native or fallback?

Chain of evidence:

1. The app asks the device for its configs and picks the lowest-ranked sample format whose range contains the source rate and exact source channel count (`backend/src/audio/output.rs:399-406`, `:513-534`). Any failure to build that stream with `UnsupportedConfiguration` / `StreamConfigurationUnsupported` falls back (`:204-218`, `:435-446`). The fallback uses the device default config (the mix format), builds a resampling plan, and logs `path=fallback` (`:448-485`).
2. cpal's `supported_output_configs` on WASAPI does not probe the device for output. For render devices it skips `IsFormatSupported` (`usable = is_output || is_format_supported(...)`) and lists every common rate from 8 kHz to 384 kHz in 7 sample formats, but only with the mix format's channel count (`cpal:wasapi/device.rs:628-745`, comment at `:664-666`, rate limits `:1350-1352`). So a 96 kHz stereo F32 range is always offered for a stereo device, whatever the device really runs at. **[verified]** (Consequence: `select_output_config` succeeds for 96 kHz stereo, and for no other channel count than the mix format's, so a mono file on a stereo mix format goes straight to fallback.)
3. `build_output_stream` then calls `is_format_supported` and returns `ErrorKind::UnsupportedConfig` "Stream configuration is not supported in shared mode" when the result is not `S_OK` (`cpal:wasapi/device.rs:986-1000`). `is_format_supported` returns true only for `S_OK`; `S_FALSE` counts as unsupported (`:197-217`, comment: "S_FALSE (hr.0 == 1): only usable when AUTOCONVERTPCM is set (output)"). **[verified]** The same reject happens even though `Initialize` is later called with `AUTOCONVERTPCM` (`:1003-1008`), because the pre-check runs first.
4. Microsoft's contract for shared mode: if the engine supports the format, `S_OK`; if it only supports a similar format, it returns that in `ppClosestMatch` and `S_FALSE`. "In shared mode, the audio engine always supports the mix format ... the audio engine might support similar formats that have the same sample rate and number of channels as the mix format but differ in the representation of audio sample values" ([IsFormatSupported](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-isformatsupported)). "The format for an application stream typically must have the same number of channels and the same sample rate as the stream format used by the device" ([Device Formats](https://learn.microsoft.com/en-us/windows/win32/coreaudio/device-formats)). **[verified]** A 96 kHz request on a 48 kHz mix format is therefore expected to give `S_FALSE`.
5. cpal maps that to `ErrorKind::UnsupportedConfig` (`:990-994`); the app maps it to `StreamConfigurationUnsupported` (`output.rs:714-723`), `classify_native_attempt` returns `Fallback`, and `audio.output.native_fallback` (warn) then `audio.output.configured path=fallback ... output_rate=<mix rate>` are logged.

Conclusion **[inferred]**: for a 96 kHz file the app is `native` only if the shared-mode device format is 96 kHz (Sound control panel, Advanced, Default Format). Otherwise it is `fallback`, and the app's own rubato resampler converts to the mix rate. A driver that ships an LFX APO accepting other rates could return `S_OK` ("Typically, an LFX APO supports only client formats with sample rates that match the sample rate of the mix format", same IsFormatSupported page), so this cannot be ruled out per device. **[unverified]**

Side finding: the rate-matching case is the *only* way to be `native`, so the `native`/`fallback` split in the code already tracks "does the app have to resample", which is the thing the Path wants to show. The frontend shows `processing` as null only when there is no resampling and no channel conversion (`src/lib/playback/playback-technical-status.ts:19-33`).

## Q2: does the mixer still convert when the rate matches?

What happens to a `path=native` stream in shared mode:

- The audio engine always sits between the app and the hardware: "If a client of WASAPI opens a stream in shared mode ... the audio engine mixes the streams from these applications and plays the resulting mix through the hardware. The audio engine ... performs all of its stream-processing operations in software" ([User-Mode Audio Components](https://learn.microsoft.com/en-us/windows/win32/coreaudio/user-mode-audio-components)). **[verified]**
- Internal format is floating point: "The audio engine will use a format with the same number of channels ... and the same sample rate ..., but it will convert samples to floating-point numbers before processing them. The audio engine will convert the floating-point samples in the output mix to 16-bit integers before playing them through the device" ([Device Formats](https://learn.microsoft.com/en-us/windows/win32/coreaudio/device-formats)). **[verified]** The app asks for `F32` first (`output.rs:536-552`), so the app-to-engine step is float32 to float32. The engine-to-device step is float to the user-chosen device format (16, 24 or 32 bit). If the device format is narrower than the source (24-bit file, 16-bit device format) the audio is truncated or rounded after the app, invisibly. **[inferred]**
- Volume: session and endpoint volume apply in shared mode and "have no effect on exclusive-mode streams" ([Exclusive-Mode Streams](https://learn.microsoft.com/en-us/windows/win32/coreaudio/exclusive-mode-streams)). **[verified]** At 100 % this is gain 1.0 (identity in float), but the OS can change it without the app knowing. **[inferred]**
- Effects: an LFX/GFX APO or audio enhancement installed by the driver sits in the shared-mode chain ([IsFormatSupported remarks](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-isformatsupported)). Whether the user's device has one, and whether Windows "Audio enhancements", spatial audio or loudness equalization are on, is not queryable from our code today. **[unverified]**
- Other apps' streams (notifications, browser) are summed into the same mix, so the output is not only our samples ([User-Mode Audio Components](https://learn.microsoft.com/en-us/windows/win32/coreaudio/user-mode-audio-components)). **[verified]**
- `AUTOCONVERTPCM` is set on every cpal output stream, with `SRC_DEFAULT_QUALITY` (`cpal:wasapi/device.rs:1003-1008`). Per the flag doc it inserts "a channel matrixer and a sample rate converter ... as necessary to convert between the uncompressed format supplied to `Initialize` and the audio engine mix format" ([AUDCLNT_STREAMFLAGS_XXX](https://learn.microsoft.com/en-us/windows/win32/coreaudio/audclnt-streamflags-xxx-constants)). In our flow the `S_FALSE` pre-check (Q1.3) means that converter is never reached for a rate mismatch, so the OS does not silently resample behind a `native` label; the app resamples and says so (`fallback`). The flag still matters for sample-format differences between app and engine. **[inferred]**
- What the app itself does to samples: decode to f32, apply `effective_gain` (default 1.0, `backend/src/audio/volume.rs:6`) with a non-finite guard and clamp to +/-1.0 (`:104-113`), then `T::from_sample` into the stream's format (`output.rs:650-665`). At gain 1.0 and F32 output this is identity. A 24-bit source fits exactly in f32; a 32-bit integer source would not. **[verified for the code, inferred for the bit-exactness claim]**

Conclusion: even for `path=native`, "bit-perfect" is **untrue as a guarantee**. At best it is "the app did not alter it". Microsoft itself points to exclusive mode for "a hard requirement for bit-exact output or custom sample rates" (Exclusive-Mode Streams tip, link above). **[verified]**

## Q3: options

| Option | What it fixes | Cost / risk |
| --- | --- | --- |
| A. Reword the Path and `CONTEXT.md` for shared mode: the Path tells what the *app* did to the audio (resampled, channels changed), never "bit-perfect" | DESIGN principle 8 ("nothing decorative that means nothing", behaves truthfully) is met with no new capability | Wording and UI copy only. Loses the "bit-perfect" appeal, which was never provable in shared mode |
| B. Show the mixer format in the Path/tooltip (e.g. `FLAC 24/96 › 48 kHz mixer › Speakers`) | Makes the OS stage visible, so a rate mismatch is not hidden | Needs the mix format surfaced to the renderer. `fallback` already knows it (`output_rate`); for `native` it equals the source. Device bit depth needs `PKEY_AudioEngine_DeviceFormat` (not in cpal, needs a Windows API call) |
| C. Add WASAPI exclusive mode | Only way to make bit-exact (and rates beyond the mix format) real | cpal 0.18.1 has no exclusive mode: "We always create voices in shared mode" (`cpal:wasapi/device.rs:758`) and only `AUDCLNT_SHAREMODE_SHARED` is used (`:875`, `:986`). Needs a custom WASAPI backend (windows crate) or a cpal change; seizes the device from other apps; per-device user setting can forbid it; `requirements.md:81` lists exclusive output as planned, not done. Large, separate feature |

**Recommendation: A now, with the cheap half of B, and keep C as its own planned feature.**

- A: the Path claims only what is knowable. Replace "Its length alone says whether playback is bit-perfect" with "Its length says whether the app altered the audio". Align `docs/requirements.md` wording on bit-perfect (planned list) and DESIGN principle 8 usage.
- B (cheap part): when `fallback`, the existing `processing` step already shows the mixer rate (`96 kHz` source, `48 kHz` step). So the Path is already truthful about conversion the app does; only the "native = bit-perfect" reading is wrong.
- C only if exclusive mode becomes a goal; only then may a "bit-perfect" label come back, and only in exclusive mode.

## What to check on real hardware (logs)

Log file: tauri-plugin-log default location, `%LOCALAPPDATA%\com.niceaudioplayer.app\logs\` (identifier from `src-tauri/tauri.conf.json:5`; rotation 1 MB x 5, `src-tauri/src/lib.rs:36-42`). **[inferred from plugin defaults; confirm the folder]**

1. Play a 96 kHz stereo file with the device's Default Format set to 48 kHz. Expect `audio.output.native_fallback` then `audio.output.configured path=fallback source_rate=96000 ... output_rate=48000`. If instead `path=native`, the driver/APO accepted 96 kHz at `S_OK`, which contradicts Q1 (record the device and driver).
2. Set the device Default Format to 96 kHz (Sound control panel, Properties, Advanced) and replay. Expect `path=native source_rate=96000 output_rate=96000 sample_format=Some(F32)`.
3. Play a 44.1 kHz file on a 48 kHz device: expect `fallback`; and a mono file on a stereo device: expect `fallback` with `conversion=MonoToStereo`.
4. If anything fails at build, look for `audio.output.stream_build_failed kind=... sample_format=... sample_rate=... channels=...` (`output.rs:714`).
5. To test Q2 independent of the app: Windows Sound settings, device Properties, Enhancements tab (or Audio enhancements toggle) and Advanced tab (Default Format, "Allow applications to take exclusive control"), and note the endpoint volume. Loopback-capturing the render endpoint to compare samples is the only real bit-exactness test and is out of scope here. **[unverified]**
6. Gap in logging: nothing logs the mix format or the device's bit depth when `native`. Adding that (see Follow-up 2) would settle most open items.

## Not verified

- Exact `IsFormatSupported` return for 96 kHz on a given 48 kHz device with its vendor driver/APO.
- Whether the user's device has APOs or enhancements enabled.
- Whether bytes leaving the engine equal bytes entering it (no loopback capture done).
- The tauri-plugin-log folder name on this machine.

## Follow-up ticket outlines (drafts only; no ticket files created)

**Follow-up 1: Reword the Path for shared mode (docs and copy).**
Status: ready-for-agent. Update `CONTEXT.md` (Path definition, Gapless line "so the Path stays true"), `docs/requirements.md` (planned "bit-perfect" line, line 81), and any UI copy or tooltip, so the Path says the app did not alter the audio, not that playback is bit-perfect. No code change besides copy. Acceptance: no doc or UI string claims bit-perfect for shared mode; DESIGN principle 8 check passes.

**Follow-up 2: Log the mixer and device format on `path=native`.**
Status: ready-for-agent. At `audio.output.configured`, also log the device default config (`default_output_config`, i.e. the mix format: rate, channels, sample format) for both paths, and the output stream's buffer size. Query `PKEY_AudioEngine_DeviceFormat` only if a Windows API call is acceptable (otherwise skip). Acceptance: one log line lets a reader see source, mix format and chosen path.

**Follow-up 3 (optional): surface the mixer stage in the Path.**
Status: needs a design decision (`/grill-with-docs`). Show a mixer-rate step in the dock Path when it differs from the source; no new step when equal. Depends on Follow-up 1 wording.

**Follow-up 4 (later, large): exclusive output mode.**
Status: needs a spec. Custom WASAPI exclusive backend (cpal 0.18.1 cannot), per-device opt-in, fall back to shared with a visible Path change ("no silent fallback that changes a selected playback mode", `docs/requirements.md:70`), handle device-in-use and user-disabled exclusive access (`AUDCLNT_E_DEVICE_IN_USE`, `AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED`), and an ADR. Only then may a "bit-perfect" label exist, and only in exclusive mode.
