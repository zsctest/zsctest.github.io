---
title: 让 Agent 更主动调用 Skill：从 reverse-skill 路由机制到 Skill Assist 插件
author: Zst0ry
pubDatetime: 2026-11-06T10:00:00Z
slug: agent-skill-routing-and-skill-assist
featured: false
draft: false
tags:
  - AI
  - Agent
  - opencode
  - Skill
  - 渗透测试
  - 插件
description: opencode 能把 Skill 暴露给模型，但模型常常不按 Skill 执行。从 reverse-skill 的"入口引导 + 规则路由"出发，构建事件驱动的 Skill Assist 技能推荐插件
---

## Skill 暴露了，但模型不用

最近在用靶场测试以 opencode 作为基础引擎构建渗透测试智能体，为了教会agent解决某一类漏洞写了一份skill，但发现不管怎样它都不加载skill，一股脑的自己在做（模型用的是1017的deepseek-flash)。opencode 原生支持 Skill 机制：把 SKILL.md 放进技能目录，模型就能看到每个技能的 name 和 description，理论上可以在合适的时机按需加载正文。听起来很理想——把渗透测试的方法论拆成一个个 Skill（信息收集、前端逆向、越权测试……），Agent 就能在对的时机用对的方法。

实际跑起来才发现问题：**Skill 确实暴露给了模型，但模型往往不会都这个skill，也不会按 Skill 去做。** 明明技能目录里躺着对应的方法论，Agent 还是凭借自身"直觉"自顾自开工——该加载的不加载，流程想怎么走就怎么走，颇有点"自以为是"。

---

## 调研 reverse-skill

平时在比赛的时候会用上reverse-skill这个skill集合，使用过程中能明显感知到agent调用了reverse-skill的skill，为了提升opencode对有效skill的使用意愿。我让gpt给我分析了 reverse-skill 项目。reverse-skill的做法并不是简单地把几十个 SKILL.md 安装到 Agent 的技能目录，而是构建了一套"入口引导 + 任务分类 + 规则路由 + 按需加载 Skill + 工具执行"的机制。

它的 Skill 调用分为两个层次：

1. **Agent 发现入口**：通过项目指令（如 AGENTS.md、CLAUDE.md）或客户端适配机制，让 Agent 知道 reverse-skill 的存在。
2. **reverse-skill 内部路由**：通过 MASTER-ROUTING.md、routing.json 和路由脚本，将具体任务映射到对应的场景 Skill。

对比一下两种调用链：

```text
普通 Agent：
任务 → 模型判断是否需要 Skill → 可能直接执行

reverse-skill：
任务 → 入口引导 → 路由匹配 → 读取 Skill → 执行
```

只要 Agent 遵循入口引导，并且路由规则覆盖了相关任务，Skill 就更不容易被忽略。

但要说清楚一点：**这种效果并不等于模型自身的 Skill 选择能力变强**，而是通过外部规则和流程约束提高了调用概率。尽管如此，在同样的任务中，采取类似 reverse-skill 的方式，确实能够提升 Agent 调用 Skill 的意愿，不至于"自以为是"。

---

## Skill Assist 插件

顺着reverse-skill的这个思路，让 GPT 写了一个 **Skill Assist** 插件——一个事件驱动的启发式技能推荐器。它不替模型做决定，只在合适的时机把候选递到模型眼前。

推荐具体分为四个阶段。

### 阶段一：收集判断上下文

插件会收集：

|输入|作用|
|---|---|
|当前任务|确定用户要解决什么问题|
|近期工具结果|发现新技术、接口、参数、报错等证据|
|Agent 探索方向|推断下一步准备开展的工作|
|Todo 或可见计划|辅助识别阶段性任务|
|已加载技能状态|减少重复推荐和重复加载|

例如，用户只要求：

> 测试这个 Web 应用。

Agent 读取页面后，工具结果出现：

```text
/static/js/app.bundle.js
/static/js/app.bundle.js.map

GET /api/users/{id}
GET /api/orders/{orderId}
```

这会提供与前端逆向、API 分析以及对象访问控制相关的潜在线索。但**发现对象 ID 并不自动代表必须加载访问控制 Skill**，仍需要结合任务范围与当前证据判断。

### 阶段二：判断是否值得重新推荐

插件并不是每次执行工具都推荐技能，而是通过变化检测与去重机制判断是否应提醒。典型触发因素包括：

- 出现新的技术或证据类型；
- 当前探索方向发生变化；
- 遇到新的阻塞或错误；
- 任务阶段改变，原先的 Skill 可能不再适用。

重复抓取具有相同特征的页面，不应持续产生相同提醒。

这一步主要解决的是**推荐时机**，而不是选哪个技能。

### 阶段三：根据词法相关性产生候选

这是 skill assist 插件的推荐核心。它会将任务、近期证据和探索方向提取成检索文本，然后与原生 Skill 目录中的 name 和 description 做词法匹配。主要涉及：

- 英文词语匹配；
- 中文二元字符组合；
- 技能名称与描述的相关性；
- 不同上下文来源带来的候选排序影响。

例如，假设提取的线索是 `JavaScript bundle / source map / API routes / object ID`，可能形成的候选：

|候选|强弱|原因|
|---|---|---|
|frontend-reverse|词法匹配较强|描述中包含 JavaScript、bundle、source map 等特征|
|object-access-control|可能相关|描述中包含对象标识、资源访问、跨用户权限等特征|

这里的强弱只是示例，不是插件实际计算出的数值。

**重要限制：这不是语义理解。** 即使两个句子表达的是相同的漏洞场景，只要用词差异较大，词法检索仍可能漏掉对应技能。

另外，Agent 已经提出的探索方向也可能参与排序，这会产生一种反馈效应：

```text
Agent 猜测可能存在越权
→ 插件认为访问控制 Skill 更相关
→ Agent 看到推荐后进一步倾向于测试越权
```

这正是潜在误推荐的来源之一。

### 阶段四：提示模型自行选择

插件最多显示 4 个候选，但**不会自动调用这些技能，也不会将它们的正文注入上下文**。它追加的提醒大意是：

> 当前任务或执行证据发生变化，请根据完整技能目录重新判断是否存在适用 Skill。候选只作参考，没有适用技能可以不调用；如果正文已经可用，不必重复加载。

随后由 Agent：

- 判断哪个 Skill 适用；
- 判断已有正文是否够用；
- 决定是否调用原生 skill；
- 依照原生权限执行加载。

---

### 阶段五：AGENTS.md强制加载的提示词引导

单单通过skill assist插件进行skill匹配和暴露和opencode原来的暴露机制效果没什么区别，还需要在AGENTS.md补上提示词去引导调用。而reverse-skill是通过 PRIMARY（路由器选出的“主 Skill”）去让Agent打开选出的skill并执行的。

```
PRIMARY -> skills/xxx/SKILL.md

// master-route.sh#L154
ACTION: Open PRIMARY SKILL.md now and execute ACTION REQUIRED.
```
而配合skill-assist插件并没有弄太复杂，而是在AGENTS.md上添加了以下内容：
```
## Skill 使用规则

不要因为你熟悉相关领域、已有执行方案或收到详细的委派指令，就跳过适用的 Skill。
- 开始新的具体工作前，检查可用 Skill 的 description。当前工作明确符合某个 Skill 的适用条件时，必须先调用 SKILL 加载并阅读，再执行相关操作。
- 工作方向发生变化，或新发现触发其他 Skill 的适用条件时，重新检查并加载相关 Skill。无需在每次工具调用前重复检查。
- 主 Agent 和每个子 Agent 分别履行上述要求。不得假定其他 Agent 加载过的 Skill 正文对自己可见。
- 当前会话已加载且正文仍在上下文中的 Skill 无需重复加载。
- 阅读后遵循适用的要求，按实际情况选择操作步骤；不要为了使用 Skill 执行与目标无关的动作。
- 没有明确匹配的 Skill 时，直接继续工作。加载失败或权限不允许时，如实记录，不得声称已阅读或遵循。
Skill 不扩大任务 Scope、工具权限或授权范围；
其中的操作始终受当前任务的授权、安全和预算约束。
```

## 小结

把三种方式放在一起看：

|方案|谁来决定用哪个 Skill|Skill 正文何时进入上下文|
|---|---|---|
|普通 Agent|模型随缘|模型想加载才加载|
|reverse-skill|路由规则|路由命中后读取|
|Skill Assist|模型（候选仅参考）+AGENTS.md提示词约束执行|仍走原生加载|

本质上，外部规则约束解决的是"愿不愿意用"，词法推荐解决的是"什么时候提醒"，而AGENTS.md的强制引导也只是提示词上的软约束，最终"用哪个、怎么用"仍然交还给模型。

模型内置知识更丰富后，却不太愿意去主动调用skill了，算是一种工具性过度自信了。
