# AI-News-Brief

每天抓 OpenAI / Anthropic 官方动态 → DeepSeek 总结+翻译成简体中文 → 网页简报。
基于 ai-vibe-starter 脚手架（Next.js App Router + TS strict + Tailwind）。

## 命令

- 开发前先 `nvm use`（锁 Node 22，版本不对 verify 会拦）
- `npm run verify`：质量闸（Node/格式/lint/类型），合并前必须全绿

## 红线（不可破）

- **诚实第一：绝不编造工具输出或验证结果。** 没真执行的命令，绝不贴"成功"的假输出（如假的 EXIT_CODE=0、curl 200、build 成功）。说"做完了"前，必须真有对应工具调用和真实结果。
- **每个关键结论用真实命令收尾并展示原始输出**（git status / curl / ls / cat），让用户能亲手核对。
- **状态变更类操作一次只做一件、做完即停**，读到真实结果再继续；绝不把"写文件+验证"串成一段叙述一口气做完。
- DeepSeek key 只在服务端用，绝不进前端 / 不硬编码 / 不提交；真 key 只放 .env.local。
- main 分支受保护，改动一律走新分支 + PR。

## 约定

- 数据源可插拔：加新源 = 新建 lib/sources/<name>.ts + registry.ts 加 2 行，核心逻辑不动。
- 抓取/总结都要容错：单源失败就跳过、单条失败就退回「原标题+原文链接」，绝不让整页崩。
- 范围纪律：只做用户明确要求的，不擅自扩大（不提前做后面模块的存储/归档/部署）。
