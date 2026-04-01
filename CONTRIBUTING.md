# Contributing to GapFix

Thank you for your interest in contributing! GapFix is a small, focused open-source tool and we welcome improvements of all kinds.

## Ways to Contribute

- **Bug reports** — open an [issue](https://github.com/matrenitski/gapfix.net/issues) with reproduction steps
- **Feature requests** — open an issue describing the use case
- **Code contributions** — fork, branch, and open a pull request
- **Documentation** — improve the README, add wallet guides, fix typos
- **Testing** — test with different wallet types and report your findings

## Development Setup

```bash
git clone https://github.com/matrenitski/gapfix.net.git
cd gapfix.net
npm install
npm run dev      # start dev server at http://localhost:5173
npm run build    # build for production
npm run preview  # preview production build locally
```

## Code Style

- Keep files small and focused (one concern per file).
- Use plain ES modules — no build-time transpilation beyond what Vite handles.
- Prefer the `@scure` / `@noble` cryptography libraries for any new Bitcoin primitives. They are audited and zero-dependency.
- Write comments for non-obvious logic, especially in `bitcoin.js` and `api.js`.

## Pull Request Guidelines

1. **One PR per concern.** Don't mix refactoring with new features.
2. **Test manually** with a real xpub/ypub/zpub before submitting (you can use a known-good test vector or a wallet's watch-only key).
3. **Describe your change** in the PR body — what problem it solves and how.
4. For UI changes, include a screenshot.
5. Target the `main` branch.

## Security Issues

If you find a security vulnerability, please **do not open a public issue**. Email the maintainer privately via GitHub's contact form or create a private security advisory.

## Licensing

By submitting a contribution you agree it will be released under the [MIT License](LICENSE).
