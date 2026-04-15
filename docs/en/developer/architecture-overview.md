# Architecture Overview

For the latest architecture deep dive, read:

- [System Architecture Overview](../../architecture/overview.md)
- [Rust + WASM Flow](../../architecture/rust-wasm-flow.md)
- [OPFS Guide](../../architecture/opfs-guide.md)

## High-Level Modules

- `web/`: main React application
- `mobile-web/`: remote control interface
- `relay-server/`: session relay layer
- `wasm/`: Rust crates compiled to WebAssembly
- `packages/`: shared libraries (`ui`, `i18n`, `config`, etc.)
