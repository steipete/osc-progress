import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

describe("package exports", () => {
  test("CJS resolvers can fall back to the default condition", () => {
    const root = path.join(tmpdir(), `osc-progress-exports-${process.pid}-${Date.now()}`);
    const packageRoot = path.join(root, "node_modules", "osc-progress");
    const distRoot = path.join(packageRoot, "dist", "esm");
    mkdirSync(distRoot, { recursive: true });

    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, unknown>;
    writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify(pkg), "utf8");
    writeFileSync(path.join(distRoot, "index.js"), "export const ok = true;\n", "utf8");

    const requireFromConsumer = createRequire(path.join(root, "consumer.cjs"));

    expect(requireFromConsumer.resolve("osc-progress")).toBe(
      realpathSync(path.join(distRoot, "index.js")),
    );
  });
});
