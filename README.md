# OpenMeta CLI

[English](#english) | [中文](#中文)

---

## English

### Overview

**OpenMeta CLI** is a TypeScript-based, purely instrumental developer tool for open source contribution assistance.

**Core Mission:** Developer's daily open source growth companion + GitHub consistency guarantee tool.

### Features

- **Intelligent Issue Matching**: Filter and score GitHub issues based on your tech profile
- **Daily Content Generation**: Generate Research Notes or Development Diary from matched issues
- **One-Click Commit**: Push generated content to your private repository with confirmation
- **Autopilot Scheduling**: `openmeta init` can install a daily system scheduler for unattended runs
- **Secure Configuration**: AES-encrypted credential storage
- **100% Local**: No data uploaded, fully compliant and controllable

### Tech Stack

- **Runtime**: Bun 1.0+
- **Language**: TypeScript 6.0+ (strict mode)
- **CLI Framework**: Commander.js
- **GitHub API**: Octokit SDK
- **LLM**: OpenAI-compatible API

### Installation

```bash
# Install globally via bun
bun add -g openmeta-cli

# Or use directly with bun run
bun run ./bin/openmeta.js
```

### Quick Start

1. **Initialize configuration:**
```bash
openmeta init
```

2. **Execute daily workflow manually when needed:**
```bash
openmeta daily
```

3. **Or run the unattended workflow directly:**
```bash
openmeta daily --headless
```

4. **View/modify configuration:**
```bash
openmeta config view
openmeta config set <key> <value>
openmeta config reset
```

5. **Disable persistent automation if needed:**
```bash
openmeta automation disable
```

### Commands

| Command | Description |
|---------|-------------|
| `openmeta init` | Initialize configuration (interactive wizard) |
| `openmeta daily` | Execute daily: fetch issues → generate content → commit |
| `openmeta daily --headless` | Execute unattended using saved automation defaults |
| `openmeta automation status` | Show persistent automation status |
| `openmeta automation enable` | Enable persistent unattended automation |
| `openmeta automation disable` | Disable persistent unattended automation |
| `openmeta config view` | View current configuration |
| `openmeta config set <key> <value>` | Update a config value |
| `openmeta config reset` | Reset to defaults |
| `openmeta -v` | Show version |
| `openmeta -h` | Show help |

### Configuration

Configuration is stored at `~/.config/openmeta/config.json` with encrypted credentials. When automation is enabled, `openmeta init` also installs a local scheduler (`launchd` on macOS, `cron` on Linux) that runs `openmeta daily --headless` every day.

Enabling automation now shows a persistent-mode warning and requires two confirmations. Manually running `openmeta daily --headless` also shows a warning and requires two confirmations unless it is launched by the system scheduler.

### Security

- GitHub PAT and LLM API keys are AES-encrypted
- Manual mode requires confirmation before committing; unattended mode auto-commits by design
- Git operations only on user-specified repository
- No data uploaded to any third-party servers

### License

MIT

---

## 中文

### 概述

**OpenMeta CLI** 是一款基于 TypeScript 开发的、纯工具化的开发者开源贡献辅助 CLI 工具。

**核心定位：** 开发者的每日开源成长助手 + GitHub 全勤保底工具

### 功能特性

- **智能 Issue 匹配**：基于技术画像过滤和评分 GitHub issues
- **每日内容生成**：从匹配的 issues 生成调研笔记或开发日记
- **一键提交**：确认后推送到私有仓库
- **自动化调度**：`openmeta init` 可直接安装本机每日定时任务，支持无人值守运行
- **安全配置**：AES 加密存储凭证
- **100% 本地运行**：不托管任何数据，完全合规可控

### 技术栈

- **运行时**：Bun 1.0+
- **语言**：TypeScript 6.0+（严格模式）
- **CLI 框架**：Commander.js
- **GitHub API**：Octokit SDK
- **大模型**：OpenAI 兼容 API

### 安装

```bash
# 通过 bun 全局安装
bun add -g openmeta-cli

# 或直接使用 bun run
bun run ./bin/openmeta.js
```

### 快速开始

1. **初始化配置：**
```bash
openmeta init
```

2. **需要时手动执行每日流程：**
```bash
openmeta daily
```

3. **或直接执行无人值守模式：**
```bash
openmeta daily --headless
```

4. **查看/修改配置：**
```bash
openmeta config view
openmeta config set <key> <value>
openmeta config reset
```

5. **需要时关闭长期自动化：**
```bash
openmeta automation disable
```

### 命令说明

| 命令 | 说明 |
|------|------|
| `openmeta init` | 初始化配置（交互式向导） |
| `openmeta daily` | 执行每日流程：拉取 issues → 生成内容 → 提交 |
| `openmeta daily --headless` | 使用保存的自动化配置执行无人值守流程 |
| `openmeta automation status` | 查看长期自动化状态 |
| `openmeta automation enable` | 启用长期无人值守自动化 |
| `openmeta automation disable` | 关闭长期无人值守自动化 |
| `openmeta config view` | 查看当前配置 |
| `openmeta config set <key> <value>` | 更新配置项 |
| `openmeta config reset` | 重置为默认值 |
| `openmeta -v` | 显示版本 |
| `openmeta -h` | 显示帮助 |

### 配置说明

配置文件位于 `~/.config/openmeta/config.json`，凭证已 AES 加密。启用自动化后，`openmeta init` 会在本机安装定时任务（macOS 使用 `launchd`，Linux 使用 `cron`），每天执行 `openmeta daily --headless`。

启用自动化时现在会显示“长期运行”风险提示，并要求两次确认；手动执行 `openmeta daily --headless` 时，如果不是系统调度器触发，也会再次提示并要求两次确认。

### 安全说明

- GitHub PAT 和 LLM API Key 均已 AES 加密存储
- 手动模式在提交前需要确认；无人值守模式会按设计自动提交
- Git 操作仅在用户指定的仓库执行
- 不向任何第三方服务器上传数据

### 许可证

MIT
