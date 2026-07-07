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

## Linux Installers

GitHub releases build Linux packages alongside the Windows installers:

- Fedora, RHEL, and similar systems: install the `.rpm` package.
- Linux Mint, Debian, Ubuntu, and similar systems: install the `.deb` package.
- Portable Linux use: run the `.AppImage`.

The `.deb` and `.rpm` packages are the best choice when you want desktop
integration and `.md` file association support. The AppImage is useful for quick
portable testing, but it usually does not register file associations by itself.

Example Fedora install:

```sh
sudo dnf install ./Markdown.Pad-0.1.1-1.x86_64.rpm
```

Example Linux Mint install:

```sh
sudo apt install ./Markdown.Pad_0.1.1_amd64.deb
```

If your desktop environment does not automatically make Markdown Pad the default
Markdown editor, set it through the file properties UI, or try:

```sh
xdg-mime default app.markdownpad.desktop.desktop text/markdown
```

If that desktop ID is different on your distro, find it with:

```sh
grep -R "Markdown Pad" /usr/share/applications ~/.local/share/applications 2>/dev/null
```

Flatpak is not built yet. The current release path intentionally favors native
RPM and Debian packages first because those are the simplest fit for Fedora and
Linux Mint.

## Release

GitHub Actions runs checks on pushes and pull requests. Tags that start with
`v`, such as `v0.1.1`, run the release workflow and upload built Tauri bundles
to a GitHub Release.
