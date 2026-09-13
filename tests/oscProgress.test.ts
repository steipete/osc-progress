import { afterEach, describe, expect, test, vi } from "vitest";
import {
  OSC_PROGRESS_BEL,
  OSC_PROGRESS_PREFIX,
  OSC_PROGRESS_ST,
  startOscProgress,
  supportsOscProgress,
} from "../src/index.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("supportsOscProgress", () => {
  test("requires a TTY", () => {
    expect(supportsOscProgress({ TERM_PROGRAM: "ghostty" }, false)).toBe(false);
  });

  test("defaults to the stderr TTY state", () => {
    const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    const stderrDescriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    try {
      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
      Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });
      expect(supportsOscProgress({ TERM_PROGRAM: "ghostty" })).toBe(true);

      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
      Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: false });
      expect(supportsOscProgress({ TERM_PROGRAM: "ghostty" })).toBe(false);
    } finally {
      if (stdoutDescriptor) Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
      else Reflect.deleteProperty(process.stdout, "isTTY");
      if (stderrDescriptor) Object.defineProperty(process.stderr, "isTTY", stderrDescriptor);
      else Reflect.deleteProperty(process.stderr, "isTTY");
    }
  });

  test("returns false for unknown terminals", () => {
    expect(supportsOscProgress({ TERM_PROGRAM: "unknown" }, true)).toBe(false);
  });

  test("supports known OSC 9;4 terminals", () => {
    expect(supportsOscProgress({ TERM_PROGRAM: "ghostty" }, true)).toBe(true);
    expect(supportsOscProgress({ TERM_PROGRAM: "WezTerm" }, true)).toBe(true);
    expect(supportsOscProgress({ TERM_PROGRAM: "Canario" }, true)).toBe(true);
    expect(supportsOscProgress({ WT_SESSION: "1" }, true)).toBe(true);
  });

  test("honors force/disabled flags", () => {
    expect(supportsOscProgress({}, true, { disabled: true })).toBe(false);
    expect(supportsOscProgress({}, true, { force: true })).toBe(true);
  });

  test("honors env var overrides", () => {
    expect(
      supportsOscProgress({ NO: "1", TERM_PROGRAM: "ghostty" }, true, { disableEnvVar: "NO" }),
    ).toBe(false);
    expect(supportsOscProgress({ YES: "1" }, true, { forceEnvVar: "YES" })).toBe(true);
  });
});

describe("startOscProgress", () => {
  test("noop when not supported", () => {
    const writes: string[] = [];
    const stop = startOscProgress({
      write: (chunk) => {
        writes.push(chunk);
      },
      env: { TERM_PROGRAM: "ghostty" },
      isTty: false,
    });
    stop();
    expect(writes).toEqual([]);
  });

  test("indeterminate emits start and clear", () => {
    const writes: string[] = [];
    const stop = startOscProgress({
      label: "Waiting",
      indeterminate: true,
      write: (chunk) => writes.push(chunk),
      env: { TERM_PROGRAM: "ghostty" },
      isTty: true,
    });
    stop();
    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}3;;Waiting${OSC_PROGRESS_ST}`);
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}0;0;Waiting${OSC_PROGRESS_ST}`);
  });

  test("determinate advances but never reaches 100 by itself", () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const stop = startOscProgress({
      label: "Fetching",
      targetMs: 2_000,
      write: (chunk) => writes.push(chunk),
      env: { TERM_PROGRAM: "ghostty" },
      isTty: true,
    });

    vi.advanceTimersByTime(3_000);
    stop();

    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}1;0;Fetching${OSC_PROGRESS_ST}`);
    expect(writes.some((w) => w.includes(`${OSC_PROGRESS_PREFIX}1;99;`))).toBe(true);
    expect(writes.at(-1)).toBe(`${OSC_PROGRESS_PREFIX}0;0;Fetching${OSC_PROGRESS_ST}`);
  });

  test("supports BEL terminator", () => {
    const writes: string[] = [];
    const stop = startOscProgress({
      label: "Fetch",
      indeterminate: true,
      terminator: "bel",
      write: (chunk) => writes.push(chunk),
      env: { TERM_PROGRAM: "ghostty" },
      isTty: true,
    });
    stop();
    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}3;;Fetch${OSC_PROGRESS_BEL}`);
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}0;0;Fetch${OSC_PROGRESS_BEL}`);
  });

  test("stop is idempotent", () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const stop = startOscProgress({
      label: "Fetch",
      targetMs: 2_000,
      write: (chunk) => writes.push(chunk),
      env: { TERM_PROGRAM: "ghostty" },
      isTty: true,
    });
    vi.advanceTimersByTime(950);
    stop();
    stop();
    expect(writes.at(-1)).toBe(`${OSC_PROGRESS_PREFIX}0;0;Fetch${OSC_PROGRESS_ST}`);
  });

  test("indeterminate stop is idempotent", () => {
    const writes: string[] = [];
    const stop = startOscProgress({
      label: "Waiting",
      indeterminate: true,
      write: (chunk) => writes.push(chunk),
      env: { TERM_PROGRAM: "ghostty" },
      isTty: true,
    });

    stop();
    stop();

    expect(writes).toEqual([
      `${OSC_PROGRESS_PREFIX}3;;Waiting${OSC_PROGRESS_ST}`,
      `${OSC_PROGRESS_PREFIX}0;0;Waiting${OSC_PROGRESS_ST}`,
    ]);
  });

  test("uses default write (process.stderr.write) when not provided", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const stop = startOscProgress({
        label: "Waiting",
        indeterminate: true,
        env: { TERM_PROGRAM: "ghostty" },
        isTty: true,
      });
      stop();
      expect(writeSpy).toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
    }
  });
});
