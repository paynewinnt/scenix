# 参与 Scenix

[English](./CONTRIBUTING.en.md)

感谢你愿意帮助改进 Scenix。任何人都可以报告问题、提出建议、完善文档、补充测试或提交代码。

## 开始之前

- 先搜索现有 [Issues](https://github.com/paynewinnt/scenix/issues)，避免重复提交。
- 较大的功能或架构调整，请先创建 Issue 说明目标和方案，确认方向后再开始开发。
- 安全漏洞不要公开披露，请按 [安全策略](./SECURITY.md) 私下报告。
- 参与项目即表示你同意遵守 [行为准则](./CODE_OF_CONDUCT.md)。

## 本地开发

环境要求：

- Node.js 18+
- pnpm 9+
- Windows 10/11 或 macOS 13+

从你的 fork 启动开发：

```bash
git clone https://github.com/<your-account>/scenix.git
cd scenix
git remote add upstream https://github.com/paynewinnt/scenix.git
pnpm install
```

提交前至少运行：

```bash
pnpm test:unit
pnpm build
```

`pnpm test:live` 会访问真实浏览器或移动设备，并可能需要模型 API、ADB、Xcode 或 WebDriverAgent。普通 Pull Request 不强制运行 live 测试；如果你的修改影响真实执行链路，请在 PR 中说明已验证的平台和环境。

## 提交流程

1. Fork 仓库并从最新 `master` 创建分支，例如 `feat/report-export`、`fix/queue-race` 或 `docs/setup-guide`。
2. 保持修改小而聚焦，并为行为变化补充或更新测试。
3. 不要提交 `.env`、API Key、数据库、报告、日志、APK 或设备证据。
4. 推送到你的 fork，并向 `paynewinnt/scenix:master` 创建 Pull Request。
5. 填写 PR 模板，说明修改目的、验证方式、兼容性影响及关联 Issue。

推荐使用现有提交风格：`feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:`。

维护者可能会请求调整、补充测试或拆分过大的修改。Pull Request 通过自动检查和评审后，由维护者合并。

## 许可

提交贡献即表示你同意将贡献按项目的 [MIT License](../LICENSE) 授权。你保留自己贡献的版权。
