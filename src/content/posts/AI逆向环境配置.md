---
title: AI逆向环境配置
author: Zst0ry
pubDatetime: 2026-06-20T00:36:31Z
slug: ai-ni-xiang-huan-jing-pei-zhi
featured: false
draft: false
tags:
  - 实战
  - 逆向
  - AI
  - Agent
  - claudecode
description: 配置AI驱动的逆向环境
---



# Phase 1：基础工具

```bash
sudo apt install -y \
    git \
    curl \
    wget \
    ca-certificates \
    gnupg \
    unzip \
    zip \
    jq \
    tree \
    tmux \
    htop \
    vim \
    nano \
    rsync \
    openssh-client \
    openssh-server
```


```
curl -LsSf https://astral.sh/uv/install.sh | sh
```


---


# Phase 2：逆向基础工具链

## 目标

安装静态分析、调试、二进制分析的基础组件。

---

## 2.1 编译环境

```bash
sudo apt install -y \
    build-essential \
    gcc \
    g++ \
    clang \
    make \
    cmake \
    ninja-build \
    pkg-config
```

---

## 2.2 Binary 工具

```bash
sudo apt install -y \
    binutils \
    elfutils \
    file \
    xxd \
    hexedit \
    patchelf \
    nasm \
    yasm
```

---

## 2.3 Debug 工具

```bash
sudo apt install -y \
    gdb \
    gdb-multiarch \
    libc6-dbg \
    strace \
    ltrace
```

---

## 2.4 网络分析

```bash
sudo apt install -y \
    tcpdump \
    wireshark
```

不要改变系统全局安全策略。

如果 Wireshark 安装过程中询问：

```text
Should non-superusers be able to capture packets?
```

默认建议：

```text
No
```

需要抓包时使用授权方式单独配置。

---

## 2.5 Python 环境
优先使用uv配置

---

# Phase 3：Java + Ghidra

## 目标

安装官方 Ghidra Release。但要先根据ghidra-mcp的readme文档(https://github.com/bethington/ghidra-mcp/blob/dev/README.md)看要怎么装Ghidra

---

## 3.1 安装 JDK 21

先查询：

```bash
apt-cache policy openjdk-21-jdk
```

安装：

```bash
sudo apt install -y openjdk-21-jdk
```

确认：

```bash
java -version

javac -version
```

必须为：

```text
21.x
```

查询：

```bash
readlink -f "$(which java)"
```


安装maven
```bash
sudo apt install -y maven
```

---

## 3.2 安装目录

创建：

```bash
sudo mkdir -p /opt/ghidra

sudo chown "$USER:$USER" /opt/ghidra
```

---

## 3.3 获取官方 Ghidra源码

安装`cn-fast-dl`：一个国内开发的 GitHub 大文件多线程加速下载工具
```
# 全局安装
npm install -g cn-fast-dl
# 使用 cn-dl 命令下载示例
cn-dl https://github.com/xxx/releases/download/v1.0/file.zip
```

**下载Ghidra附件**
```bash
cn-dl https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.3_build/ghidra_12.1.3_PUBLIC_20260817.zip -o ghidra_12.1.3_PUBLIC_20260817.zip
```
**校验哈希**
```bash
# SHA-256: 93a5d11a9ad510622acaaf908c556a7b9b764d338e78a7567f3689bf5081fd54
sha256sum ghidra_12.1.3_PUBLIC_20260817.zip
```

**unzip解压**
```
unzip ghidra_12.1.3_PUBLIC_20260817.zip
mv ghidra_12.1.3_PUBLIC ~/envs/ghidra
```
解压后得到 `ghidra_12.1.3_PUBLIC/` 目录，然后移动到/opt/目录。

**启动**

安装gui
```bash
cd ~/envs/ghidra
./ghidraRun
```
首次启动会较慢，Ghidra 会初始化工作区。

不安装GUI，无头模式，检测一下
```
cd ~/envs/ghidra
./support/analyzeHeadless /tmp/test_project Test
```


# Phase 4：Agent Runtime + Ghidra MCP

## 目标

建立：

```text
AI Agent
   ↓
MCP
   ↓
Ghidra
```

注意：

> NSA 官方 Ghidra 与第三方 Ghidra MCP 是两个不同的软件供应链。

因此 Ghidra MCP 不应未经审计直接安装。

---

## 4.1 安装 uv

推荐 Python MCP 项目使用独立虚拟环境。

安装：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

重新加载：

```bash
source ~/.bashrc
```

检查：

```bash
uv --version
```


```
uv pip install protobuf
```

> 第一条命令如果 `ensure-prereqs` 仍然报 protobuf 失败，直接**跳过它**，其余依赖已经就绪（全是 "Skipping already installed"），protobuf 你已经手动装了，直接允许第2条命令构建。

```bash
# 让 uv 自动管理环境并执行
uv run python -m tools.setup ensure-prereqs --ghidra-path ~/envs/ghidra
uv run python -m tools.setup build
uv run python -m tools.setup deploy --ghidra-path ~/envs/ghidra
```


出现这些回显就说明成功了

```
✅ Plugin archive installed
✅ Bridge wheel built and copied  
✅ User extension installed to ~/.config/ghidra/...
✅ FrontEnd + tool configs patched
✅ Ghidra started
```

## 4.2 手动启动 MCP Server

Ghidra 应该已经打开了，在 GUI 中：

1. 先**创建或打开一个项目**（Ghidra 必须有活跃项目才能启用插件）
2. 菜单栏：**Tools → GhidraMCP → Start MCP Server**
3. 看到 MCP Server 启动提示即可

如果 **Tools 菜单里看不到 GhidraMCP**，可能需要重启 Ghidra 让它加载新扩展：

```
# 先关掉 Ghidra，再重新打开
cd ~/envs/ghidra && ./ghidraRun
```

打开项目后再找 **Tools → GhidraMCP → Start MCP Server**。

---

### 验证 MCP 服务是否就绪

```
curl http://127.0.0.1:8089/check_connection
```

返回正常响应 → **一切就绪，可以配置 MCP 客户端了。**

---

### 配置 MCP 客户端

以 Cursor/Claude 为例，编辑 `~/.cursor/mcp.json`：

```json
{ "mcpServers": { 
    "ghidra": { 
        "command": "uv",
        "args": ["run", "--directory", "/home/deb/envs/ghidra-mcp", "bridge-mcp-ghidra"] 
        } 
    }
}
```

# Phase 5：安装Agent
安装codex
```
npm install -g @openai/codex
```

安装claudecode
```
npm install -g @anthropic-ai/claude-code
```

