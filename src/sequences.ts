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
  for (let index = from; index < text.length; index++) {
    const char = text[index];
    if (char === OSC_PROGRESS_BEL) return { end: index + 1, terminator: "bel" };
    if (char === OSC_PROGRESS_C1_ST) return { end: index + 1, terminator: "c1st" };
    if (char === "\u001b" && text[index + 1] === "\\") {
      return { end: index + 2, terminator: "st" };
    }
  }
  return undefined;
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
  if (!text.includes(OSC_PROGRESS_PREFIX)) return text;
  const chunks: string[] = [];
  const tailLength = OSC_PROGRESS_PREFIX.length - 1;
  let tail = "";
  let cursor = 0;
  while (cursor < text.length) {
    // Removing a joined prefix can expose an earlier fragment, so refill the lookbehind.
    while (tail.length < tailLength && chunks.length > 0) {
      const previous = chunks.pop()!;
      const split = Math.max(0, previous.length - (tailLength - tail.length));
      if (split > 0) chunks.push(previous.slice(0, split));
      tail = previous.slice(split) + tail;
    }

    const boundary = tail + text.slice(cursor, cursor + tailLength);
    const joinedAt = boundary.indexOf(OSC_PROGRESS_PREFIX);
    let after: number;
    if (joinedAt !== -1) {
      after = cursor + OSC_PROGRESS_PREFIX.length - tail.length + joinedAt;
      tail = tail.slice(0, joinedAt);
    } else {
      const start = text.indexOf(OSC_PROGRESS_PREFIX, cursor);
      if (start === -1) return [...chunks, tail, text.slice(cursor)].join("");
      const literal = tail + text.slice(cursor, start);
      const split = Math.max(0, literal.length - tailLength);
      if (split > 0) chunks.push(literal.slice(0, split));
      tail = literal.slice(split);
      after = start + OSC_PROGRESS_PREFIX.length;
    }

    const match = findTerminator(text, after);
    if (!match) break;
    cursor = match.end;
  }
  chunks.push(tail);
  return chunks.join("");
}

/**
 * Convenience helper:
 * - if `keepOsc` is true, returns the input unchanged (useful when writing to a TTY)
 * - otherwise, strips OSC 9;4 sequences (useful for logs/snapshots)
 */
export function sanitizeOscProgress(text: string, keepOsc: boolean): string {
  return keepOsc ? text : stripOscProgress(text);
}
