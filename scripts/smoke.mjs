import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createOscProgressController, startOscProgress, stripOscProgress } from "osc-progress";

const required = createRequire(import.meta.url)("osc-progress");
assert.equal(required.createOscProgressController, createOscProgressController);

const frames = [];
const write = (frame) => frames.push(frame);
const stop = startOscProgress({ force: true, isTty: true, indeterminate: true, write });
stop();
stop();
assert.deepEqual(frames, ["\x1b]9;4;3;;Working…\x1b\\", "\x1b]9;4;0;0;Working…\x1b\\"]);

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    progress.dispose();
    reject(new Error("Completion did not clear progress"));
  }, 2_000);
  const progress = createOscProgressController({
    force: true,
    isTty: true,
    clearDelayMs: 10,
    write(frame) {
      frames.push(frame);
      if (frame.startsWith("\x1b]9;4;0;")) {
        clearTimeout(timeout);
        progress.dispose();
        resolve();
      }
    },
  });
  progress.setPercent("Smoke", 42);
  progress.done();
});
assert.deepEqual(frames.slice(2), [
  "\x1b]9;4;1;42;Smoke\x1b\\",
  "\x1b]9;4;1;100;Smoke\x1b\\",
  "\x1b]9;4;0;0;Smoke\x1b\\",
]);

const throttledFrames = [];
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    progress.dispose();
    reject(new Error("The final throttled percentage was not emitted"));
  }, 2_000);
  const progress = createOscProgressController({
    force: true,
    isTty: true,
    write(frame) {
      throttledFrames.push(frame);
      if (frame.startsWith("\x1b]9;4;1;100;")) {
        clearTimeout(timeout);
        progress.dispose();
        resolve();
      }
    },
  });
  progress.setPercent("Download", 10);
  progress.setPercent("Download", 50);
  progress.setPercent("Download", 100);
});
assert.deepEqual(throttledFrames, [
  "\x1b]9;4;1;10;Download\x1b\\",
  "\x1b]9;4;1;100;Download\x1b\\",
]);
assert.equal(stripOscProgress(`before${frames.join("")}after`), "beforeafter");
console.log(
  "PASS: compiled ESM/CJS entrypoints, idempotent stop, real-timer completion and throttling, stripping",
);
