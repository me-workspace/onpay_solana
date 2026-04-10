import { describe, expect, it } from "vitest";

import type { Result } from "@/lib/result";
import {
  err,
  flatMap,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  trySync,
  unwrap,
  unwrapOr,
} from "@/lib/result";

describe("Result", () => {
  it("ok() produces a successful result", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toBe(42);
    }
  });

  it("err() produces a failed result", () => {
    const r = err("nope");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error).toBe("nope");
    }
  });

  it("map() transforms Ok values", () => {
    const r = map(ok(2), (x) => x * 3);
    expect(unwrap(r)).toBe(6);
  });

  it("map() passes Err through unchanged", () => {
    const input: Result<number, string> = err("boom");
    const r = map(input, (x: number) => x * 3);
    expect(isErr(r)).toBe(true);
  });

  it("mapErr() transforms Err values", () => {
    const r = mapErr(err("boom"), (e) => `wrapped:${e}`);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error).toBe("wrapped:boom");
    }
  });

  it("flatMap() chains Ok through to the next computation", () => {
    const r = flatMap(ok(2), (x) => ok(x + 1));
    expect(unwrap(r)).toBe(3);
  });

  it("flatMap() short-circuits on Err", () => {
    let called = false;
    const input: Result<number, string> = err("stop");
    const r = flatMap(input, (x) => {
      called = true;
      return ok(x);
    });
    expect(called).toBe(false);
    expect(isErr(r)).toBe(true);
  });

  it("unwrapOr() returns fallback on Err", () => {
    expect(unwrapOr(ok(1), 99)).toBe(1);
    const errResult: Result<number, string> = err("nope");
    expect(unwrapOr(errResult, 99)).toBe(99);
  });

  it("trySync() wraps thrown errors into Err", () => {
    const r = trySync(
      () => {
        throw new Error("boom");
      },
      (cause) => String(cause),
    );
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error).toContain("boom");
    }
  });

  it("unwrap() throws on Err", () => {
    expect(() => unwrap(err("bad"))).toThrow();
  });
});
