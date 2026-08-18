---
title: vibe coding开发技能初始化
author: Zst0ry
pubDatetime: 2026-07-15T02:56:31Z
slug: vibe-coding-init-skills
featured: false
draft: true
tags:
  - Agent
  - SKILL
  - AI
description: vibe coding开发技能初始化
---
## 1. 写在前面
大模型的编程能力越来越强，我接触vibe coding也有很长一段时间了，尤其是这段时间一直在在研究AI代码审计和AI渗透测试，从一开始的直接让AI上，到现在用上一些技能和mcp工具，使用过的开发工具也很多，从Trae到codex和claudecode。我认为有必要针对这些我常用的coding工具进行工作空间的初始化，以便快速做好前期准备。

## 2. AGENTS.md
`agents.md`对AGENTS.md的解释：
> A simple, open format for guiding coding agents,  
> used by over [60k open-source projects](https://github.com/search?q=path%3AAGENTS.md+NOT+is%3Afork+NOT+is%3Aarchived&type=code).
> Think of AGENTS.md as a **README for agents**: a dedicated, predictable place to provide the context and instructions to help AI coding agents work on your project.
> AGENTS.md 是一种简单开放的编码代理指导格式，已被超过 6 万个开源项目使用。您可以将 AGENTS.md 理解为代理的 README 文件：一个专门的、可预测的地方，用于提供上下文和说明，以帮助 AI 编码代理在您的项目中工作。

一个标准的AGENTS.md应该包括以下内容：
```markdown
### 1. 项目技术栈 (Project Stack)

(精确到版本号，防止 AI 用老旧的语法或错误的依赖库瞎写。)

Next.js 15 App Router, React 19, TypeScript 5.4, Tailwind CSS.

### 2. 编译与测试命令 (Build & Test Commands)

(告诉 AI 怎么运行和测试你的代码，让它在写完代码后能自己跑测试。)

- 安装：`bun install`   
- 测试：`bun test`
- 格式化：`bun run lint --fix`    

### 3. 代码风格与范式 (Code Style)

(用代码示例告诉 AI 该怎么写，这比文字描述管用得多。)

### 4. 架构与边界约束 (Constraints & Boundaries)

(明确划定哪些目录 AI 绝对不能碰，或者哪些是历史遗留代码。)
示例：
- 绝对不要修改 `/src/legacy/` 目录下的代码。    
- 所有的状态管理必须使用 Zustand，禁止引入 Redux。
- 切勿在代码中硬编码任何 API 密钥或 Token。
```

**编写时的三大黄金法则**

> 1. **不要让 AI 自动生成它**：AI 自动生成的往往都是“写出干净、可维护的代码”这种废话。AI 本来就知道要写好代码，你需要手动写下只有你项目才有的**特殊规定**。
>     
> 2. **多给代码示例，少写小作文**：给 AI 一个 10 行的 `CORRECT / WRONG` 代码对比，比写 3 段小作文更有用。
>     
> 3. **保持简短**：建议控制在 150 行以内，信息太臃肿反而会干扰 AI 的上下文判断。
>

在平时的coding中，前三点都没怎么写，主要写了项目介绍、计划实现的能力，然后就是架构与边界约束，最后就是附加的SKILL描述。

**`AGENTS.md`和`AGENT.md`**

`AGENTS.md`放在项目的根目录下，`AGENT.md`放在子模块下。类似于全局作用域和局部作用域的区别。

| **文件名**         | **存放位置**       | **作用范围与角色**                                                                              |
| --------------- | -------------- | ---------------------------------------------------------------------------------------- |
| **`AGENTS.md`** | **项目全局根目录**    | **全局大总管**：定义整个大项目的通用规则（如：统一用 pnpm、提交代码的 Commit 规范、全局安全隐私要求）。                             |
| **`AGENT.md`**  | **子模块 / 子包目录** | **局部特种兵**：针对特定子模块的定制规则。例如 `/packages/api/AGENT.md` 只规范后端，`/packages/web/AGENT.md` 只规范前端。 |

## claudecode
各种SKILL和mcp基本都支持claudecode，所以安装会很方便。我目前基本使用的SKILL有：

| SKILL                  | 描述                                                                                                                                                                  | 地址                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| superpowers            | An agentic skills framework & software development methodology that works.                                                                                          | https://github.com/obra/superpowers                  |
| superpowers_zh         | AI 编程超能力 · 中文增强版 — superpowers（116k+ ⭐）完整汉化 + 6 个中国原创 skills，让 Claude Code / Copilot CLI / Hermes Agent / Cursor / Windsurf / Kiro / Gemini CLI 等 16 款 AI 编程工具真正会干活 | https://github.com/jnMetaCode/superpowers-zh         |
| ponytail               | Makes your AI agent think like the laziest senior dev in the room. The best code is the code you never wrote.                                                       | https://github.com/DietrichGebert/ponytail           |
| andrej-karpathy-skills | A single CLAUDE.md file to improve Claude Code behavior, derived from Andrej Karpathy's observations on LLM coding pitfalls.                                        | https://github.com/multica-ai/andrej-karpathy-skills |

### superpowers
和superpowers_zh二选一。
安装很方便，仓库都写的很清楚。
- Register the marketplace:

```shell
/plugin marketplace add obra/superpowers-marketplace
```

- Install the plugin from this marketplace:

```shell
/plugin install superpowers@superpowers-marketplace
```

### superpowers_zh
npx安装
```bash
cd /your/project
npx superpowers-zh
```

手动安装，把github仓库的skills目录下的SKILL放入该目录：
```
.claude/skills/
```


### ponytail

`ponytail` 技能的设计核心是**将人类高级开发者的“高级偷懒”制度化、指令化**。它不是让 AI 敷衍了事，而是通过一种“阻力模型（Resistance Model）”，迫使 AI 在写下任何一行代码前，先进行极度严苛的自我审视（The Ladder）。
使每一行代码都有理有据有必要。
```
/plugin marketplace add DietrichGebert/ponytail
```

```
/plugin install ponytail@ponytail
```


### andrej-karpathy-skills


```
/plugin marketplace add forrestchang/andrej-karpathy-skills
```

Then install the plugin:

```
/plugin install andrej-karpathy-skills@karpathy-skills
```