import { describe, expect, test } from "vitest";
import {
  findOscProgressSequences,
  OSC_PROGRESS_BEL,
  OSC_PROGRESS_C1_ST,
  OSC_PROGRESS_PREFIX,
  OSC_PROGRESS_ST,
  sanitizeLabel,
  sanitizeOscProgress,
  stripOscProgress,
} from "../src/index.js";

describe("sanitizeLabel", () => {
  test("removes escape and OSC terminators", () => {
    const label = `Load\u001b[31m  file${OSC_PROGRESS_ST}${OSC_PROGRESS_BEL}${OSC_PROGRESS_C1_ST}]`;
    expect(sanitizeLabel(label)).toBe("Load[31m  file]");
  });

  test("strips C0, C1, and DEL controls that would break the OSC sequence", () => {
    const c0Controls = Array.from({ length: 0x20 }, (_, code) => String.fromCodePoint(code)).join(
      "",
    );
    const c1Controls = Array.from({ length: 0x20 }, (_, index) =>
      String.fromCodePoint(0x80 + index),
    ).join("");

    expect(sanitizeLabel(`a${c0Controls}\u007f${c1Controls}b[ok]`)).toBe("ab[ok]");
    expect(sanitizeLabel("download\nrm -rf")).toBe("downloadrm -rf");
    expect(sanitizeLabel("plain label")).toBe("plain label");
  });
});

describe("findOscProgressSequences", () => {
  test("finds ST-terminated sequences", () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_ST}b`;
    const sequences = findOscProgressSequences(text);
    expect(sequences).toHaveLength(1);
    expect(sequences[0].raw).toBe(`${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_ST}`);
  });

  test("finds BEL-terminated sequences", () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_BEL}b`;
    const sequences = findOscProgressSequences(text);
    expect(sequences).toHaveLength(1);
    expect(sequences[0].raw).toBe(`${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_BEL}`);
  });

  test("finds C1 ST terminated sequences", () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_C1_ST}b`;
    const sequences = findOscProgressSequences(text);
    expect(sequences).toHaveLength(1);
    expect(sequences[0].raw).toBe(`${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_C1_ST}`);
  });

  test("ignores unterminated sequences", () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;Xb`;
    expect(findOscProgressSequences(text)).toEqual([]);
  });

  test("chooses the earliest terminator when multiple are present", () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_BEL}${OSC_PROGRESS_ST}b`;
    const sequences = findOscProgressSequences(text);
    expect(sequences).toHaveLength(1);
    expect(sequences[0].raw).toBe(`${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_BEL}`);
  });
});

describe("strip/sanitize", () => {
  test("strips multiple sequences with mixed terminators", () => {
    const text = [
      "pre",
      `${OSC_PROGRESS_PREFIX}3;;Waiting${OSC_PROGRESS_ST}`,
      "mid",
      `${OSC_PROGRESS_PREFIX}1;5;Downloading${OSC_PROGRESS_BEL}`,
      "post",
    ].join("");
    expect(stripOscProgress(text)).toBe("premidpost");
  });

  test("strips C1 ST terminated sequences", () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_C1_ST}b`;
    expect(stripOscProgress(text)).toBe("ab");
  });

  test("sanitizeOscProgress keeps when requested", () => {
    const text = `${OSC_PROGRESS_PREFIX}3;;Waiting${OSC_PROGRESS_ST}hello`;
    expect(sanitizeOscProgress(text, true)).toBe(text);
    expect(sanitizeOscProgress(text, false)).toBe("hello");
  });

  test("stripOscProgress removes unterminated sequences to end of string", () => {
    const text = `pre${OSC_PROGRESS_PREFIX}1;50;Xpost`;
    expect(stripOscProgress(text)).toBe("pre");
  });
});

describe("captured output", () => {
  test.each([
    ["st", OSC_PROGRESS_ST],
    ["bel", OSC_PROGRESS_BEL],
    ["c1st", OSC_PROGRESS_C1_ST],
  ] as const)("preserves offsets and the first %s terminator", (terminator, end) => {
    const raw = `${OSC_PROGRESS_PREFIX}1;42;escaped\u001bX${end}`;
    expect(findOscProgressSequences(`🌍${raw}tail`)).toEqual([
      { start: 2, end: 2 + raw.length, raw, terminator },
    ]);
  });

  test.each([0, 8_186, 8_190, 16_378])(
    "removes prefixes assembled after %i literal characters",
    (length) => {
      const inner = `${OSC_PROGRESS_PREFIX}1;42;inner${OSC_PROGRESS_BEL}`;
      const literal = "x".repeat(length);
      const text = `${literal}${OSC_PROGRESS_PREFIX.slice(0, 4)}${inner}${OSC_PROGRESS_PREFIX.slice(4)}1;42;outer${OSC_PROGRESS_BEL}tail`;
      expect(stripOscProgress(text)).toBe(`${literal}tail`);
    },
  );

  test("removes nested prefixes exposed by successive removals", () => {
    let nested = `${OSC_PROGRESS_PREFIX}1;42;inner${OSC_PROGRESS_BEL}`;
    for (let split = 1; split < OSC_PROGRESS_PREFIX.length; split++) {
      nested = `${OSC_PROGRESS_PREFIX.slice(0, split)}${nested}${OSC_PROGRESS_PREFIX.slice(split)}1;42;outer${OSC_PROGRESS_ST}`;
    }
    expect(stripOscProgress(`before${nested}after`)).toBe("beforeafter");
  });

  test("handles a dense capture without quadratic scanning", () => {
    const count = 40_000;
    const text = `log\n${OSC_PROGRESS_PREFIX}1;42;x${OSC_PROGRESS_BEL}`.repeat(count);
    const startedAt = performance.now();
    const sequences = findOscProgressSequences(text);
    expect(sequences).toHaveLength(count);
    expect(sequences.at(-1)?.end).toBe(text.length);
    expect(stripOscProgress(text)).toBe("log\n".repeat(count));
    // Generous headroom for slow CI; repeated suffix scans took over 15 seconds locally.
    expect(performance.now() - startedAt).toBeLessThan(5_000);
  });
});
