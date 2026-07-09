---
name: verify-all
description: 一条命令跑完项目全套质检。当你在提交前、或改动代码后想一次性跑完所有检查——Node 版本、Prettier 格式、ESLint、TypeScript 类型、Vitest 测试——而不想逐个手敲、也不担心 Node 版本漂移时使用。
---

# verify-all

一键跑完本项目的质量闸：先把 Node 切到项目锁定的版本（`.nvmrc` = 22），再跑 `npm run verify`。

`npm run verify` 串联五关，任一失败即中止：

1. `check:node` —— 校验 Node 版本匹配 `.nvmrc`（不对直接拦下）
2. `format:check` —— `prettier --check .`
3. `lint` —— `next lint`
4. `typecheck` —— `tsc --noEmit`
5. `test` —— `vitest run`

## 怎么执行

在**仓库根目录**执行下面这**一条命令**（务必写成一条、放在同一个 shell 里跑）：

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; \
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"; \
command -v nvm >/dev/null 2>&1 && [ -s "$(brew --prefix nvm 2>/dev/null)/nvm.sh" ] && \. "$(brew --prefix nvm)/nvm.sh"; \
nvm use && npm run verify
```

跑完把 `npm run verify` 的真实输出贴给用户，逐关确认是否全绿。

## 为什么要先 source nvm（关键坑，别省）

`nvm` 是一个 **shell function**，不是可执行文件。在一个全新的、非交互式的 shell 里，它往往**没被加载**——此时直接 `nvm use` 会报 `nvm: command not found`，Node 保持在系统默认版本（常见 v24），紧接着 `npm run verify` 的第一关 `check:node` 就会因版本不符把整条链拦下。

所以执行前必须先确保 nvm 已加载：

- 先 `source` 掉 `$NVM_DIR/nvm.sh`（标准安装路径，通常是 `~/.nvm/nvm.sh`）；
- 若是 Homebrew 装的 nvm，则 `source "$(brew --prefix nvm)/nvm.sh"`；
- 上面那条命令已把这两种情况都覆盖，`nvm use` 会读仓库根的 `.nvmrc` 自动切到 Node 22。

## 注意事项

- **必须一条命令**：`nvm use` 只对当前 shell 生效。若把 `nvm use` 和 `npm run verify` 拆成两次调用（各自新开 shell），第二条又会漂回默认 Node、被 `check:node` 拦。所以用 `&&` 串在同一条里。
- **在仓库根目录跑**：`.nvmrc`、`package.json` 都在根目录；不在根目录 `nvm use` 找不到 `.nvmrc`、`npm run verify` 也找不到脚本。
- **失败即停**：`verify` 用 `&&` 串联，哪一关红了后面就不跑。把红的那一关的原始输出贴出来定位，别只报"失败"。
- **诚实第一**：只有真跑出全绿输出才说通过；没真执行就别贴假的"成功"。
