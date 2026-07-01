import { describe, it, expect } from "vitest";

// 冒烟测试：只为证明测试框架能在本 TS 项目里跑通，不涉及任何业务逻辑。
describe("测试环境冒烟", () => {
  it("1 + 1 = 2", () => {
    expect(1 + 1).toBe(2);
  });
});
