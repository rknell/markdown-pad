# Markdown Pad

Markdown Pad is a lightweight desktop Markdown editor built with Tauri 2, Rust,
TypeScript, Vite, and Milkdown.

It is intended to be quick to open, modest on memory, and useful for everyday
Markdown editing on Windows. The app stores normal `.md` files, supports a
WYSIWYG editing surface, file open/save flows, recent files, native menus,
formatting toolbar buttons, find, and clean print output through the system
print dialog.

## AI Authorship

This project was made entirely by AI at the request of its original user. It is
published as-is under the MIT license with no warranty or liability.

Pull requests are welcome. If you want to add features, improve Linux support,
polish printing, improve editor behavior, or tighten packaging, please open an
issue or submit a PR.

## Development

Requirements:

- Node.js
- Rust stable
- Tauri platform prerequisites for your OS

Install dependencies:

```sh
npm install
```

Run checks:

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Run locally:

```sh
npm run tauri:dev
```

Build release bundles:

```sh
npm run tauri:build
```

## Release

GitHub Actions runs checks on pushes and pull requests. Tags that start with
`v`, such as `v0.1.0`, run the release workflow and upload built Tauri bundles
to a GitHub Release.
