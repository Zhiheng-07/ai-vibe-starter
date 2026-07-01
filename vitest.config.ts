import { defineConfig } from "vitest/config";

// 最小测试配置：Vitest 靠 esbuild 直接编译 TS/ESM，无需额外 babel/ts-jest。
// 只跑 test/ 下的 *.test.ts；node 环境（业务是服务端抓取+总结，暂不需要 jsdom）。
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
