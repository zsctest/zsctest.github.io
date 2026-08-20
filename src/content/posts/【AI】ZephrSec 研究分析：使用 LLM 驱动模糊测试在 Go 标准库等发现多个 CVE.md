---
title: ZephrSec 研究分析：使用 LLM 驱动模糊测试在 Go 标准库等发现多个 CVE
author: diudiu-ai
pubDatetime: 2026-08-19T10:00:00Z
featured: false
draft: false
tags:
  - LLM模糊测试
  - 漏洞挖掘
  - Go标准库CVE
  - MCP安全研究
  - 自动化红队
  - TokenBurn
  - 零日漏洞
description: 安全研究员 Andy Gill 使用 Claude Code+MCP 构建自主漏洞狩猎系统，在 Go 标准库发现多个 CVE，并发布 TokenBurn 成本对比工具证明投资回报
---

## 文章元信息

|项目|内容|
|---|---|
|**标题**|Autonomous Vulnerability Hunting with MCP（Alt: Bullying LLMs into submission to find 0days at scale）|
|**作者**|Andy Gill (ZephrFish) / ZephrSec|
|**来源**|[blog.zsec.uk](https://blog.zsec.uk/)|
|**日期**|2026 年|
|**类型**|安全研究博客 / 工具发布|

---

## 核心论点

> **用 LLM 驱动的自主漏洞狩猎系统，配合 MCP 工具链和 "幻觉垃圾桶" 验证机制，可以在标准库级别发现真实可利用的零日漏洞，且投资回报为正。**

安全研究员 Andy Gill 自 2026 年初构建了一套基于 Claude Code + MCP（Model Context Protocol）的自主漏洞狩猎系统，横跨 5 台 VM、8 个 MCP Server、300+ 工具。该系统在 Go 标准库中发现 2 个 CVE，以及 Windows OEM 零日、macOS 应用等多个漏洞。

---

## 系统架构

### 基础设施

|组件|配置|
|---|---|
|**宿主机**|Proxmox 主机|
|**VM 数量**|5 台|
|**MCP Server**|8 个|
|**工具总数**|300+|
|**AI 驱动**|Claude Code (Claude Max 订阅)|
|**网络**|隔离网段|

### 5 台 VM 职责

|VM|用途|
|---|---|
|**Windows 11（最新补丁）**|RPC、服务、AD 攻击面分析|
|**Windows 11（N-1 补丁）**|Patch Tuesday 二进制差分|
|**Linux 靶机**|Ghidra、radare2、GDB/pwndbg、angr|
|**模糊测试专用**|WinAFL、Jackalope、DynamoRIO|
|**macOS**|macOS 应用分析、Raptor|

### 8 个 MCP Server

|MCP|能力|
|---|---|
|**SSH/WinRM**|远程会话管理、Proxmox VM 管理|
|**补丁差分**|Patch Tuesday 对比、攻击面枚举|
|**模糊测试**|10 个模糊测试域、崩溃分诊、campaign 管理|
|**逆向工程**|Ghidra、radare2、Frida|
|**漏洞利用**|Shellcode 生成、堆喷射、CFG 绕过、PoC 组装|
|**调试器**|持久化 WinDbg/GDB 会话|
|**知识检索**|Campaign 数据语义搜索|
|**披露报告**|赏金提交、CVE 请求|

---

## 核心设计：幻觉垃圾桶（Hallucination Bin）

> **所有发现默认为幻觉。只有通过验证门才能晋升。**

这是整个系统**最重要的设计决策**。

### 验证门（Gate）

|Gate|条件|
|---|---|
|**Gate 0**|PoC 存在且可编译|
|**Gate 1**|PoC 在干净 VM 快照中可复现|
|**Gate 2**|崩溃可利用（非空指针解引用或优雅退出）|
|**Gate 3**|Bug 在标准用户（非 SYSTEM/admin）下触发|

### 实际效果

> 一次早期狩猎中，自主引擎从手动分析中标记了 6 个发现。经过动态分析验证，**全部 6 个被证伪**—— 幻觉垃圾桶在它们到达最终报告之前就全部拦截了。

晋升 / 降级流程：

- `tool_finding_promote` — 验证通过后晋升
- `tool_finding_demote` — 被证伪后降级

---

## 知识循环（Knowledge Loop）

### RAG 反馈机制

```plaintext
启动 Campaign
    ↓
查询 RAG："这个二进制之前见过崩溃吗？什么技术有效？什么防御阻止了我们？"
    ↓
模糊测试运行
    ↓
每个崩溃记录：域、目标、崩溃类别
    ↓
供应商安全公告、补丁差分、变体分析、赏金提交 → 全部索引
    ↓
向量存储（sentence-transformer 嵌入）
    ↓
下次 Campaign 从更丰富的上下文开始
```

### 本地知识库

|数据源|规模|
|---|---|
|**个人笔记**|561,000+ chunks（15 年积累）|
|**Sigma 规则**|5,800+|
|**GitHub 仓库**|1,025 个精选|
|**工具文档**|全部索引|
|**运行方式**|Ollama 本地 + MCP Server|

### 已知防御数据库

当目标被发现加固（AM-PPL、SxS 保护、严格 Authenticode），记录到数据库。加固目标在未来的 Campaign 中被**乘法惩罚**优先级，避免浪费周期。

---

## 赏金情报（Bounty Intelligence）

### 目标排名算法

```plaintext
Expected ROI = 保守赔付估计 / 估计狩猎小时数
```

|漏洞类型|估计工时|
|---|---|
|DLL 劫持|~8 小时|
|LPE|~20 小时|
|RCE|~40 小时|
|类型混淆 / UAF|~80 小时|

### 竞争调整

|竞争级别|保留价值|
|---|---|
|低竞争|90%|
|高竞争（大厂 OS）|40%|
|极高竞争|20%|

> 系统自然倾向于**审查不足但赏金不错的软件**：第三方系统工具、OEM 管理代理、企业中间件。

---

## 漏洞成果

### CVE-2026-33809：Go x/image TIFF OOM

|项目|内容|
|---|---|
|**包**|`golang.org/x/image/tiff`|
|**类型**|OOM（内存耗尽）|
|**触发**|8 字节恶意 TIFF 文件|
|**影响**|任何处理不受信任输入的 Go 进程|
|**影响版本**|v0.0.0 至 v0.37.0（所有版本）|
|**下游影响**|945+ 包|

**Payload（8 字节）**：

```hex
49 49 2a 00 ff ff ff ff
```

有效 TIFF 头（小端序，magic `0x002A`）后跟指向 32 位地址空间末尾的 IFD 偏移。`tiff.Decode` 尝试读取该偏移时分配约 **4GB** 缓冲区。

**根因**：CVE-2022-41727 的修复未覆盖 `IFD` 偏移读取的独立代码路径。

### CVE-2026-33812：Go x/image/font/sfnt OOM

|项目|内容|
|---|---|
|**包**|`golang.org/x/image/font/sfnt`|
|**类型**|OOM（内存耗尽）|
|**触发**|恶意字体文件的 GPOS PairPos 表|
|**影响**|解析不受信任字体的 Go 进程|

**原理**：`parsePairPosFormat2` 从字体文件读取两个 `uint16` 值，其乘积直接传递给 `make`，未检查。两个值均为 65,535 时，乘积 ×2 ≈ **8 GiB**，瞬间 OOM。

额外发现的两个问题：

- `makeCachedPairPosGlyph` / `makeCachedPairPosClass` 未验证索引边界
- `source.varLenView` 未检查整数溢出

### 更广泛的模糊测试 Campaign

|指标|数值|
|---|---|
|**模糊测试的包**|21 个 Go 标准库包|
|**总执行次数**|~8000 万次|
|**每目标时间**|3-30 分钟|
|**产生 CVE 的**|仅 TIFF 和 SFNT|
|**确认为设计预期的**|WebP 和 GIF 维度分配|

**关键**：语法模糊测试引擎生成**结构有效但字段值对抗性**的文件，而非随机字节。

### Windows OEM 零日：Auth Bypass + SSRF → SYSTEM 执行

**四阶段攻击链**：

|阶段|技术|
|---|---|
|**1. 命名管道认证绕过**|WCF 命名管道的认证完全在客户端实现，服务端不验证。通过 `AppDomainManager` 注入绕过|
|**2. SSRF**|WCF 方法接受攻击者控制的 URL，跳过权限验证，以 SYSTEM 身份执行 HEAD+GET 请求|
|**3. 目录注入**|伪造更新包描述符被服务接受为可用更新|
|**4. SYSTEM 执行**|下载→大小验证→SHA256 验证→**Authenticode 签名验证**（通过 BYOVD 绕过）→以 SYSTEM 执行|

验证环境：Windows 11 25H2 (Build 26200)。

### macOS 应用：两个发现

|发现|详情|
|---|---|
|**浏览器历史外泄**|捆绑框架读取浏览器 SQLite 数据库 + macOS 隔离数据库。隔离查询 `SELECT * FROM LSQuarantineEvent` 完全无过滤|
|**生产环境中的调试 RSA 密钥**|配套框架中包含 jwt.io RS256 示例密钥（公开私钥）。结合 `CFPreferencesSetAppValue` 可覆盖 Sparkle 更新框架签名验证，实现恶意更新投递|

---

## TokenBurn 成本对比工具

### 工具功能

|功能|说明|
|---|---|
|**Token 同步**|从每台运行 Claude Code 的机器同步 token 使用数据|
|**聚合分析**|按模型、项目分解消耗|
|**趋势可视化**|每日消耗趋势、每项目分解、每小时活动模式|
|**成本对比**|相同用量在 API 费率 vs 固定订阅下的成本对比|

### 使用模式特征

安全研究的使用模式是**尖峰式的**：一次狩猎会话可能在单次对话中编排 15 步攻击面枚举、反编译函数、交叉引用发现、起草披露 —— 然后模糊测试运行期间什么都不做一天。

### 每发现成本

|指标|数值|
|---|---|
|**Claude Max 订阅**|固定月费|
|**API 等效成本**|~£5000/CVE（仅 API 费用）|
|**总 CVE 数**|4 个（+ 进行中更多）|
|**赏金回报**|超过硬件 + 订阅 + 时间总成本|

---

## 经验教训

|教训|详情|
|---|---|
|**幻觉垃圾桶必须是 Gate 0**|第一版信任自身输出是错误的。有罪推定方法实现近零误报率|
|**始终从低权限上下文验证**|多个早期发现仅限 admin/SYSTEM 触发。标准用户下不可达|
|**记录负面结果**|加固目标记录到数据库，乘法惩罚未来优先级|
|**知识循环产生复利**|第 20 次 Campaign 的每发现成本显著低于第 1 次|

---

## 总结与启示

|维度|启示|
|---|---|
|**LLM 漏洞挖掘**|前沿模型在无护栏环境下可以发现标准库级别的真实零日漏洞|
|**幻觉管理**|"有罪推定" 验证机制是 LLM 安全研究的关键 —— 所有发现默认为幻觉|
|**MCP 工具链**|将研究工作流的每一步包装为 MCP Server，实现 Claude 直接调用|
|**知识循环**|RAG + 负面结果记录 + 已知防御数据库 = 每次 Campaign 更高效|
|**语法模糊测试**|结构有效 + 字段值对抗性 > 随机字节，对文件格式解析器尤其有效|
|**经济可行性**|Claude Max 订阅 + 自建工具链的投资回报为正，赏金覆盖全部成本|
|**低权限验证**|所有发现必须在标准用户上下文中验证，避免虚假阳性|
|**BYOVD 攻击**|即使有 Authenticode 验证，旧版 WHQL 签名驱动仍可加载并提供内核读写原语|

---

## 参考信息

|项目|内容|
|---|---|
|**原文链接**|[https://blog.zsec.uk/bullyingllms](https://blog.zsec.uk/bullyingllms)|
|**分析日期**|2026-08-19|
|**相关 CVE**|CVE-2026-33809（Go x/image/tiff OOM）、CVE-2026-33812（Go x/image/font/sfnt OOM）|
|**相关工具**|Claude Code、MCP、TokenBurn、Ghidra、radare2、Frida、WinAFL|
|**作者相关**|之前 CVE：CVE-2020（NVIDIA）、CVE-2017-3528|
|**进行中**|3x Windows LPE、4x RCE、2x UAF、多个信息泄露|