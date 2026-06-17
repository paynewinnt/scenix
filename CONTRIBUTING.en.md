# Contributing to Scenix

[中文说明](./CONTRIBUTING.md)

Thank you for helping improve Scenix. Everyone is welcome to report bugs, propose ideas, improve documentation, add tests, or contribute code.

## Before You Start

- Search existing [Issues](https://github.com/paynewinnt/scenix/issues) to avoid duplicates.
- For large features or architectural changes, open an Issue describing the goal and proposed approach before implementation.
- Do not disclose security vulnerabilities publicly. Follow the [Security Policy](./SECURITY.md).
- By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Local Development

Requirements:

- Node.js 18+
- pnpm 9+
- Windows 10/11 or macOS 13+

Start from your fork:

```bash
git clone https://github.com/<your-account>/scenix.git
cd scenix
git remote add upstream https://github.com/paynewinnt/scenix.git
pnpm install
```

Run at least these checks before submitting:

```bash
pnpm test:unit
pnpm build
```

`pnpm test:live` uses a real browser or mobile device and may require a model API, ADB, Xcode, or WebDriverAgent. Live tests are not required for every Pull Request. If your change affects a live execution path, describe the platforms and environment you verified in the PR.

## Contribution Workflow

1. Fork the repository and create a branch from the latest `master`, such as `feat/report-export`, `fix/queue-race`, or `docs/setup-guide`.
2. Keep the change focused and add or update tests for behavioral changes.
3. Never commit `.env` files, API keys, databases, reports, logs, APKs, or device evidence.
4. Push the branch to your fork and open a Pull Request against `paynewinnt/scenix:master`.
5. Complete the PR template with the purpose, verification, compatibility impact, and related Issues.

The existing commit style is recommended: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, and `chore:`.

Maintainers may request changes, additional tests, or a smaller scope. A maintainer merges the Pull Request after automated checks and review pass.

## License

By contributing, you agree that your contribution is licensed under the project's [MIT License](./LICENSE). You retain copyright in your contribution.
