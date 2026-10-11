import { describe, expect, it } from "vitest";

import { binZone } from "./field-shredder";

const bin = { left: 900, top: 600, right: 1012, bottom: 712 };

describe("binZone", () => {
  it("counts the padded area around the bin as a drop", () => {
    expect(binZone({ x: 956, y: 656 }, bin)).toBe("over");
    expect(binZone({ x: 880, y: 590 }, bin)).toBe("over");
  });

  it("reacts when close and ignores far pointers", () => {
    expect(binZone({ x: 800, y: 560 }, bin)).toBe("near");
    expect(binZone({ x: 200, y: 100 }, bin)).toBe("far");
  });
});
