# G3 Forward Proxy Container

This builds the `g3proxy` project from [`bytedance/g3`](https://github.com/bytedance/g3) and provides a standalone docker container image to be used as forward proxy.

## Setup

Setup your local environment by running `just setup`.

Rust & Cargo are also required.

## Build

The [justfile](justfile) contains the build instructions, `cargo build` runs before `docker build`. This is just a personal preference and feels like it uses system resources more efficiently. It also makes it easier to cache required dependencies.

## Links:

- G3 repository: [`bytedance/g3`](https://github.com/bytedance/g3)
