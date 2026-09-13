/**
 * OSC 9;4 progress prefix (`ESC ] 9 ; 4 ;`).
 *
 * Typical emitted forms:
 * - `ESC ] 9;4;<state>;<percent>;<payload> ST`
 * - `ESC ] 9;4;<state>;;<payload> ST` (indeterminate)
 */
export const OSC_PROGRESS_PREFIX = "\u001b]9;4;";
/** String Terminator (ST): `ESC \\` */
export const OSC_PROGRESS_ST = "\u001b\\";
/** Bell (BEL): `0x07` */
export const OSC_PROGRESS_BEL = "\u0007";
/** C1 String Terminator (ST): `0x9c` */
export const OSC_PROGRESS_C1_ST = "\u009c";

export interface OscProgressSequence {
  /** Inclusive start index in the input string. */
  start: number;
  /** Exclusive end index in the input string. */
  end: number;
  /** Raw substring that matched. */
  raw: string;
  /** Which terminator was encountered. */
  terminator: "st" | "bel" | "c1st";
}

/**
 * Sanitizes a label/payload so it can't break the surrounding OSC sequence.
 * Removes escape chars and common OSC terminators; trims whitespace.
 */
export function sanitizeLabel(label: string): string {
  const withoutSt = label.replaceAll(OSC_PROGRESS_ST, "");
  // Strip C0/C1 controls and DEL. This removes every OSC introducer/terminator
  // while preserving printable payload characters such as closing brackets.
  const withoutControls = [...withoutSt]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 0x1f && code !== 0x7f && !(code >= 0x80 && code <= 0x9f);
    })
    .join("");
  return withoutControls.trim();
}

function findTerminator(
  text: string,
  from: number,
): { end: number; terminator: OscProgressSequence["terminator"] } | undefined {
  let first: { end: number; terminator: OscProgressSequence["terminator"] } | undefined;
  for (const [value, terminator] of [
    [OSC_PROGRESS_ST, "st"],
    [OSC_PROGRESS_BEL, "bel"],
    [OSC_PROGRESS_C1_ST, "c1st"],
  ] as const) {
    const start = text.indexOf(value, from);
    if (start !== -1) {
      const end = start + value.length;
      if (!first || end < first.end) first = { end, terminator };
    }
  }
  return first;
}

/**
 * Finds OSC 9;4 progress sequences inside an arbitrary string.
 *
 * Supports three terminators:
 * - ST (`ESC \\`)
 * - BEL (`0x07`)
 * - C1 ST (`0x9c`)
 *
 * Unterminated sequences are ignored (use `stripOscProgress` if you want to drop them).
 */
export function findOscProgressSequences(text: string): OscProgressSequence[] {
  const sequences: OscProgressSequence[] = [];
  const prefixLen = OSC_PROGRESS_PREFIX.length;
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf(OSC_PROGRESS_PREFIX, searchFrom);
    if (start === -1) break;

    const after = start + prefixLen;
    const match = findTerminator(text, after);
    if (!match) break;
    sequences.push({ start, ...match, raw: text.slice(start, match.end) });
    searchFrom = match.end;
  }
  return sequences;
}

/**
 * Removes OSC 9;4 progress sequences from `text`.
 *
 * Behavior:
 * - strips sequences terminated by ST/BEL/C1 ST
 * - if a sequence is unterminated, it is removed until end-of-string
 */
export function stripOscProgress(text: string): string {
  const prefixLen = OSC_PROGRESS_PREFIX.length;
  let current = text;
  while (current.includes(OSC_PROGRESS_PREFIX)) {
    const start = current.indexOf(OSC_PROGRESS_PREFIX);
    const after = start + prefixLen;

    const cutEnd = findTerminator(current, after)?.end ?? current.length;
    current = `${current.slice(0, start)}${current.slice(cutEnd)}`;
  }
  return current;
}

/**
 * Convenience helper:
 * - if `keepOsc` is true, returns the input unchanged (useful when writing to a TTY)
 * - otherwise, strips OSC 9;4 sequences (useful for logs/snapshots)
 */
export function sanitizeOscProgress(text: string, keepOsc: boolean): string {
  return keepOsc ? text : stripOscProgress(text);
}
