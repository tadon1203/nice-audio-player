import { graphemes } from "./graphemes";

/** Head of each kana row, indexed by the first kana of the row (あ行, か行, ...). */
const KANA_ROWS: readonly [string, string][] = [
  ["あいうえおぁぃぅぇぉ", "あ"],
  ["かきくけこがぎぐげご", "か"],
  ["さしすせそざじずぜぞ", "さ"],
  ["たちつてとだぢづでどっ", "た"],
  ["なにぬねの", "な"],
  ["はひふへほばびぶべぼぱぴぷぺぽ", "は"],
  ["まみむめも", "ま"],
  ["やゆよゃゅょ", "や"],
  ["らりるれろ", "ら"],
  ["わをん", "わ"],
];

/** Katakana to hiragana (a fixed offset), so one table covers both. */
const toHiragana = (char: string) =>
  char.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/**
 * The letter an item sorts under in a list ordered by name: Latin letters uppercased without
 * accents, kana as their row's head (か for が), digits and symbols as `#`, anything else
 * (kanji) as itself.
 */
export function sortIndexLetter(text: string): string {
  const [first] = graphemes(text.trim());
  if (first === undefined) return "#";
  const plain = first.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/^[a-z]$/i.test(plain)) return plain.toUpperCase();
  const kana = toHiragana(plain.normalize("NFC"));
  const row = KANA_ROWS.find(([members]) => members.includes(kana));
  if (row !== undefined) return row[1];
  if (/^[\p{L}]$/u.test(plain)) return plain;
  return "#";
}
