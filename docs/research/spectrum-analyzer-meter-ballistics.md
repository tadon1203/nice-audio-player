# Research: ballistics for a 30-band 1/3-octave analyzer and an L/R level meter

Question: what do the standards and RME's own documents say about meter integration, return rate, peak-hold, 1/3-octave band definitions and analyzer time weighting, and which concrete numbers should a 90 dB-range display in this app use? The display is drawn at 60-144 Hz from analysis frames arriving at about 120 Hz.

Research date: 2026-10-03. Every claim is marked **[verified]** (read in a primary source I could open; cited with URL and section or page), **[derived]** (arithmetic from verified numbers), **[judgement]** (my recommendation, no source), or **[unreached]** (primary source exists but I could not open its text; no secondary source is cited as a substitute). Sources: EBU Tech 3205-E, EBU Tech 3341, ITU-R BS.1770-5, ITU-R BS.1771-1, IEC 61260-1:2014 and IEC 61672-1:2013 (publisher preview extracts), RME manuals and tech notes, and Julius O. Smith's CCRMA text.

Text extraction of the PDFs was done locally with `pdftotext`; page numbers below are the printed page numbers where the document has them.

## Answer

1. **Quasi-peak PPM ballistics (EBU / IEC Type IIb): 10 ms integration, return of 24 dB in 2.8 s, approximately constant speed.** [verified, EBU Tech 3205-E s.3.3, s.3.10] That is about 8.6 dB/s, linear in dB [derived]. The standard says nothing about a hold marker. Hold is a feature of digital meters, not of the PPM standard; the only standardised hold I could read is the 150 ms minimum for a digital overload light. [verified, ITU-R BS.1771-1 Annex 1, Table 4 PLI-4 and Appendix 1 item b]
2. **1/3-octave bands are base-10 (G = 10^(3/10), reference 1000 Hz) and filters are class 1 or class 2.** [verified, IEC 61260-1:2014 s.1.2, s.5.2, s.5.3] **Fast = 125 ms and Slow = 1 s** are the F and S exponential time weightings of IEC 61672-1, but I could not open the clause that gives the values. [unreached] **RME publishes no number for its analyzer's time weighting.** The ADI-2 manuals say only "carefully selected attack and release times" [verified]. RME's DIGICheck note gives a 7 ms rise and a 1 s or 2 s release as recommended settings [verified], with a 30-band, 50 dB range there and 60 dB range on the ADI-2 [verified].
3. **Recommended numbers for a 90 dB range:** see [Recommended set](#recommended-set). Short form: bar rises instantly, falls linearly in dB at 30 dB/s; peak cap holds 1.5 s then falls linearly at 10 dB/s; L/R meter falls at 8.6 dB/s with a 1.5 s hold. Only the 8.6 dB/s, the 10 dB/s anchor, the 7 ms rise and the 150 ms floor come from sources.
4. **Make decay frame-rate independent by computing it from elapsed time, never from a per-frame constant.** Linear-in-dB decay is `level -= rate * dt`; exponential smoothing is `alpha = 1 - exp(-dt / tau)`. [verified for the exponential relation, Smith; the rest is **[judgement]**]

Confidence: high on the EBU, ITU and IEC 61260-1 facts; medium on RME's behaviour because RME never states its analyzer numbers; the Fast/Slow values and IEC 60268-18 / DIN 45406 specifics are not confirmed from a primary source.

## Q1: PPM ballistics, return rate, hold

**EBU Tech 3205-E** (2nd edition, November 1979; "kept only as a historical record", superseded by R 128), <https://tech.ebu.ch/docs/tech/tech3205.pdf>:

- Quasi-peak reading with "a nominal integration time of 10 ms" in normal mode, and about one second of averaging in slow-indication mode (General, item a, p.5). [verified]
- Integration time is defined as the burst of 5000 Hz at a level that, applied continuously, reads +9, which gives a reading of +7. "The integration time in normal mode shall be 10 +/-2 ms" (s.3.3, p.10). [verified]
- Return time: a 1 kHz tone reading +12 is suddenly removed, "the indication shall fall to the -12 mark in 2.8 +/-0.3 s in the normal mode, and in 3.8 +/-0.5 s in the slow mode. The return speed should be approximately constant" (s.3.10, p.11). [verified] Taking the marks as 1 dB per unit (the +/-0.5 dB style tolerances elsewhere in the standard imply dB-calibrated marks), that is 24 dB in 2.8 s, about 8.6 dB/s, and "approximately constant" means linear in dB. [derived]
- Overswing at most 0.5 dB (s.3.9) and a delay of at most 150 ms to pass +8 for a +9 steady tone (s.3.8). [verified]
- Appendix 2, Table 8 compares scale marks of EBU, IEC Type I, BBC and DIN meters (reading levels only); it gives no return rates. [verified]
- The standard defines **no hold marker**. I found nothing on peak hold anywhere in it. [verified by reading the whole text]

**IEC 60268-18 / IEC 60268-10 / DIN 45406 / BBC.** IEC publishes IEC TR 60268-18:1995 with the one-line scope "Describes a digital audio peak level indicator for professional and consumer use to indicate the peak levels of sampled and quantized audio signals" (<https://webstore.iec.ch/en/publication/1217>, abstract). The normative text, including any return rate and hold time, is behind a paywall and the preview URLs I tried returned HTML, not the standard. **[unreached]** The same applies to IEC 60268-10 (Type I / IIa / IIb PPM) and DIN 45406. Values often quoted for Type I (20 dB in 1.7 s) and for a digital PPM hold of 1.5 s appear only in secondary pages, which this note does not cite. EBU Tech 3205-E states that IEC 268-10 recognises "types I, IIa and IIb" and that IIb is the EBU meter (Introduction, p.4). [verified]

**Digital meters (EBU / ITU).**

- ITU-R BS.1770-5 Annex 2, Appendix 1 ("Considerations for accurate peak metering of digital audio signals"), <https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-5-202311-I!!PDF-E.pdf>: a peak-sample meter "usually works by comparing the absolute (rectified) value of each incoming sample with the meter's current reading; if the new sample is larger it replaces the current reading; if not, the current reading is multiplied by a constant slightly less than unity to produce a logarithmic decay". [verified] This is the textbook sample-peak meter: instant attack, per-sample multiply, which is **linear in dB**. [derived] It gives no decay rate and no hold. True-peak is estimated by at least 4x oversampling (Annex 2), and a sample-peak meter can under-read it. [verified]
- ITU-R BS.1771-1 Annex 1, Table 4 (optional peak indicator on a loudness meter), <https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1771-1-201201-I!!PDF-E.pdf>: PLI-4 "Once the indicator light is activated it shall remain activated for at least 150 ms after the signal has fallen below the threshold"; the threshold is "2 dB re full scale" for the true-peak level. Appendix 1 to Annex 1, item b: "A minimum hold time of 150 ms was chosen as a long enough time for the light to register with the eye". [verified] This is a floor for an overload light, not a spec for a bar's hold marker.
- EBU Tech 3341 (Loudness metering: 'EBU Mode'), <https://tech.ebu.ch/docs/tech/tech3341.pdf>, s.2.2: momentary loudness is a 0.4 s rectangular window, short-term 3 s with a live-meter update rate of at least 10 Hz, and "Further slowdown of the attack or release (decay) parts of the loudness signals ... shall not be employed in 'EBU Mode'". s.2.6 requires the true-peak measure to meet BS.1770 Annex 2 tolerances. [verified] These are loudness meters, not level bars; they set no peak-hold or decay rate.

## Q2: 1/3-octave bands, time weightings, RME

**IEC 61260-1:2014** (publisher preview extract hosted by iTeh, 15 pages, <https://cdn.standards.iteh.ai/samples/13383/3c4ae3e762b540cc8111744cb8f0ae8e/IEC-61260-1-2014.pdf>):

- Two classes: "Performance requirements are provided for two filter classes: class 1 and class 2 ... acceptance limits for class 2 are greater than, or equal to, those for class 1" (s.1.2). [verified]
- Octave frequency ratio `G = 10^(3/10)` = 1,995 26, "designated base-10 filters"; base-2 is no longer a design goal (s.5.2.1, s.5.2.2, Note 2). [verified]
- Reference frequency exactly 1000 Hz (s.5.3). Exact mid-band frequencies `fm = fr * G^(x/b)` (s.5.4, Formula 2, odd denominators such as 1/3 include 1000 Hz). Filters are labelled by nominal mid-band frequencies, listed in Annex E, Table E.1 (s.5.5; table not in the preview). [verified]
- The nominal list for a 30-band display (25 Hz to 20 kHz, the preferred-number series) is therefore generated from `1000 * 10^(n/10)`, `n = -16..13` and rounded to the Annex E labels. **[derived; I could not read Table E.1, so the exact labels (e.g. 31.5, 63, 125) are from the usual convention, not from this extract]**
- Band filters can be "an integral component of a specific instrument such as a spectrum analyser" (scope; seen via the preview summary). [verified]

**Fast / Slow.** IEC 61672-1:2013 s.3 defines time weighting as "exponential function of time, of a specified time constant" applied to the squared signal, with time weightings F and S (<https://cdn.standards.iteh.ai/samples/17900/df52d949fc904f329404e965b6268258/IEC-61672-1-2013.pdf>, definition of "time weighting" and Figure 1: square, low-pass with one real pole, log, display in dB). [verified] **The values 125 ms (F) and 1 s (S) are in a clause not in the preview, so I cannot cite them. [unreached]** What can be said: Fast and Slow are time constants of an exponential average of the squared signal, so after the input stops the dB reading falls along a decaying exponential in power, which is linear in dB in the log domain [derived], at 8.69/tau dB per second (69.5 dB/s at 125 ms, 8.69 dB/s at 1 s) if the values are as commonly stated.

**RME.**

- ADI-2 DAC User's Guide v1.8, s.15.2 Analyzer, pp.28-29, <https://rme-audio.de/downloads/adi2dac_e.pdf>; ADI-2 Pro User's Guide v1.91, s.15.2, <https://rme-audio.de/downloads/adi2pro_e.pdf>: 30 bands, "29 biquad bandpass filters" plus a lowest band that is a low-pass "from 0 Hz up to 30 Hz" so DC shows; "Using carefully selected attack and release times the display is responsive, but still easy to read"; "Max LR technique" prevents a 6 dB higher level for mono and zero for out-of-phase signals; "no FFT"; "a 30 band analyzer with 60 dB range, sharp filters and 0.5 dB steps accuracy per band"; "no parameters to change"; range 20 Hz to 20 kHz. [verified] **No attack, release, hold or dB/s number is given, and the analyzer shows no peak-hold cap in the text.** [verified by reading both sections]
- ADI-2 Pro s.15.1 Global Level Meter: "peak level meters with peak hold function, bandwidth limited to 40 kHz at higher sample rates". The DAC's horizontal stereo meter is a peak meter (Display Options, "Hor. Meter" setting: "peak level before all DSP processing"). No hold time or fall rate is stated. [verified]
- DIGICheck Spectral Analyser note, "The Spectral Analyser: Theory and Usage" (Analysis of Music), <https://rme-audio.de/downloads/Spectral_Analyser_Theory_and_Usage.pdf>: 30 bands, "50 dB range" and "100 LEDs per band"; "freely adjustable rise and release times"; "a 7 ms rise time results in a much better display behaviour" than the fastest (one-sample) rise; "The release time should be set to three different values. A very fast display (1 s) ... At 2 s the display will be more easier to read ... values around 10 to 20 seconds" for averaging; pink noise measurement uses rise at maximum (4999 ms) and release 5 s. Peak Hold display mode puts a peak display above the bars, reset unless Instant Hold is on. [verified] The note does not define what a release of "1 s" means (time constant, or time to fall across the 50 dB range), so converting it to dB/s is not possible from the source. **[unverified]**
- DIGICheck Tech Info (level meter), <https://archiv.rme-audio.de/old/english/techinfo/digich.htm>, "Peak and RMS Level Measurement": "Every single sample is used for computing Peak level and RMS level"; "A Peak Hold function with adjustable hold time (0.2 s to 100 s)"; "To achieve a better readability at lower noise levels we recommend to set the release rate to 10 dB/s"; visible range adjustable "between 0 and -160 dBFS", 0.1 dB steps. [verified] This is the only RME statement of a fall in dB/s, and it is for the level meter, not the spectrum.

## Q3: practical decay conventions

Primary sources give fall rates only for PPM and for the RME level meter. They give **no** spectrum-bar or cap numbers, because nobody standardised them. Everything below Table 1 is therefore partly judgement.

| Element                 | Sourced fact                                                                   | Source                                           |
| ----------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| Meter fall shape        | Linear in dB ("approximately constant" return; "logarithmic decay" per sample) | EBU Tech 3205-E s.3.10; BS.1770-5 Annex 2 App. 1 |
| Quasi-peak return       | 24 dB in 2.8 s, about 8.6 dB/s                                                 | EBU Tech 3205-E s.3.10                           |
| Quasi-peak attack       | 10 ms integration                                                              | EBU Tech 3205-E s.3.3                            |
| Level meter release     | 10 dB/s recommended for low-noise readability                                  | RME DIGICheck Tech Info                          |
| Level meter peak hold   | Adjustable 0.2 s to 100 s; fall rate not stated                                | RME DIGICheck Tech Info                          |
| Analyzer rise / release | 7 ms rise; release 1 s fast, 2 s easy to read (definition unstated)            | RME Spectral Analyser note                       |
| Overload light hold     | at least 150 ms                                                                | ITU-R BS.1771-1                                  |
| Analyzer range          | 60 dB (ADI-2), 50 dB (DIGICheck)                                               | RME manuals / note                               |

Does the fall accelerate? EBU says the PPM return should be roughly constant in dB. A one-pole (Fast/Slow style) average is a constant in dB per second only after the input has dropped well below the old level; it looks like an exponential in linear amplitude. I found no primary source describing an accelerating (gravity-style) fall for any pro meter. A gravity-style cap is a decorative choice and not recommended here (DESIGN principle 8).

### Recommended set

For a 90 dB range (for example 0 to -90 dBFS) at ~120 Hz analysis frames. Source column says where a number comes from.

| Quantity                  | Value                                                                                                               | Basis                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analysis frame to display | take the maximum of all frames since the last draw                                                                  | **judgement** (never drop a peak between a 120 Hz frame and a 144 Hz or 60 Hz draw)                                                                                                   |
| Bar rise                  | instant (follow the analysis value); the band filter and a ~7 ms window already provide integration                 | 7 ms rise is **sourced** (RME note); "instant at the frame rate" is **judgement**                                                                                                     |
| Bar fall                  | linear in dB at **30 dB/s** (90 dB in 3 s)                                                                          | **judgement**; sits between RME's "1 s" and "2 s" releases for a 50 dB range (about 50 and 25 dB/s if read as full-range time, **[unverified]** reading)                              |
| Cap hold                  | **1.5 s** after the last time the bar touched the cap                                                               | **judgement**; inside RME's 0.2 s to 100 s adjustable range (sourced range), above the 150 ms floor (sourced)                                                                         |
| Cap fall after hold       | linear in dB at **10 dB/s**                                                                                         | 10 dB/s anchored on RME's recommended release rate (**sourced**); applying it to the cap is **judgement**                                                                             |
| Cap floor                 | never below the bar                                                                                                 | **judgement**                                                                                                                                                                         |
| Level meter (L/R) bar     | instant rise; linear fall at **8.6 dB/s** (EBU return)                                                              | **sourced** (EBU Tech 3205-E s.3.10) for the rate; instant rise is the BS.1770 sample-peak convention (**sourced**)                                                                   |
| Level meter hold marker   | **1.5 s**, then falls at 8.6 dB/s                                                                                   | rate **sourced**; hold time **judgement**                                                                                                                                             |
| Clip / over indicator     | latch at 0 dBFS (or after N consecutive full-scale samples), hold at least 150 ms; suggest **2 s or until clicked** | 150 ms floor **sourced** (BS.1771-1); 2 s **judgement**. RME counts overs after "a user defined count (1 to 20) of consecutive full scale samples" (**sourced**, DIGICheck Tech Info) |
| Fast/Slow-type smoothing  | not used for the bars (they would hide short peaks); optional Slow mode with tau = 1 s                              | **judgement**; the 1 s value is **[unreached]** in IEC 61672-1                                                                                                                        |
| Display resolution        | 0.5 dB steps (RME ADI-2)                                                                                            | **sourced** (ADI-2 manual s.15.2)                                                                                                                                                     |

If the product wants the analyzer to match RME, the honest statement is: RME does not publish its numbers, so ours are chosen for readability, not copied.

## Q4: jitter-free drawing from frames at ~120 Hz

- **Frame-rate independence.** One-pole smoothing is `y[n] = x[n] + R*(y[n-1] - x[n])` with `R = exp(-T/tau)`; the exact relation is `e^(-t/tau) -> e^(-nT/tau) = R^n`, so `R = e^(-T/tau)`, and `R ~ 1 - T/tau` only when `T << tau` (Julius O. Smith III, _Introduction to Digital Filters_, "Time Constant of One Pole", <https://ccrma.stanford.edu/~jos/fp/Time_Constant_One_Pole.html>). [verified] Taking `T` as the real elapsed time since the previous update (not a fixed frame interval) gives the same decay at 60, 120 and 144 Hz: `alpha = 1 - exp(-dt / tau)`. [derived]
- **Linear-in-dB decay** is naturally frame independent: `level = max(input, level - rate * dt)`, with `dt` from a monotonic clock. A per-frame constant (as in BS.1770's "multiplied by a constant slightly less than unity") is only frame-rate independent when the update rate is fixed; the constant per second is `c_s = c_frame^(frames per second)`. [derived]
- **60 dB decay time.** For a one-pole in amplitude, `T60 = tau * ln(1000) = 6.91 * tau` [derived]; so a 1 s release defined as T60 equals tau of 0.145 s. This is why a "release" number must say what it measures (the RME note does not).
- **Aliasing between frame rate and display rate.** Frames at 120 Hz drawn at 144 Hz repeat one frame in six; at 60 Hz every second frame is skipped. A peak in a skipped frame is lost unless the draw takes the max since the last draw (the table's first row). **[judgement; no primary source on this]**
- Attack/release smoothing of an envelope with separate time constants for rise and fall is the standard control-signal form in dynamics processing (for example Giannoulis, Massberg, Reiss, "Digital Dynamic Range Compressor Design - A Tutorial and Analysis", JAES 60(6), 2012). **[unreached: paywalled, not read; cited by title only]**

## Not verified

- IEC TR 60268-18:1995, IEC 60268-10 and DIN 45406: normative return rates and hold values (paywalled; previews were not usable).
- IEC 61672-1 values for F (125 ms) and S (1 s), and IEC 61260-1 Annex E Table E.1 nominal frequency labels.
- What RME's "release time" of 1 s or 2 s measures, and any RME analyzer number on the ADI-2 hardware.
- Any primary description of an accelerating (gravity) cap fall in a pro meter.
- The reading-level convention (scale marks per dB) assumed in the 8.6 dB/s derivation; the clause says "+12 to -12 mark in 2.8 s", and 24 dB assumes 1 dB per mark.

## Follow-up outline (draft only; no ticket file created)

**Analyzer and meter ballistics as pure functions.** Status: needs a design decision. Implement bar and cap update as `step(state, input_db, dt)` in the renderer or shared package with the numbers above as named constants, so the numbers can be tuned in one place and unit-tested at 60, 120 and 144 Hz with identical results. Decide the displayed range (90 dB) and the meter's 8.6 dB/s against the analyzer's 30 dB/s in `/grill-with-docs`; add the terms Bar, Cap, Hold to `CONTEXT.md` if kept.
