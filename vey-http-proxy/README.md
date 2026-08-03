# VEY HTTP Forward Proxy Container

This builds `vey-proxy` from [`VEY-OSS/vey`](https://github.com/VEY-OSS/vey) and provides a standalone docker container image to be used as a forward proxy.

VEY is the continuation of G3 by the original author. This package previously lived under `g3-http-proxy` and targeted [`bytedance/g3`](https://github.com/bytedance/g3); see the [G3 → VEY migration notes](https://github.com/VEY-OSS/vey/blob/main/doc/migrate_from_g3_to_vey.md).

[![Containerize VEY HTTP Proxy](https://github.com/frytg/pkgy/actions/workflows/build-vey-http-proxy.yml/badge.svg?branch=main)](https://github.com/frytg/pkgy/actions/workflows/build-vey-http-proxy.yml)

## Setup

Setup your local environment by running `just setup`.

Rust & Cargo are also required (VEY needs Rust 1.91+).

## Build

The [justfile](justfile) contains the build instructions, `cargo build` runs before `docker build`. This is just a personal preference and feels like it uses system resources more efficiently. It also makes it easier to cache required dependencies.

```bash
just build            # default: vey-proxy 1.13.9
just build 1.13.9     # pin a specific vey-proxy-v* tag (no prefix)
```

## Run

Build the project yourself or navigate to the GitHub registry page and pull the latest image. From there it can be used like any other container image. The proxy is exposed on port `3128`.

[See all recent versions here.](https://github.com/frytg/pkgy/pkgs/container/pkgy%2Fvey-http-proxy/versions)

## Test

After running the proxy, you can test it using the following command:

```bash
curl -v -x localhost:3128 https://ipinfo.io
```

## Links

- VEY repository: [`VEY-OSS/vey`](https://github.com/VEY-OSS/vey)
- vey-proxy docs: [vey.readthedocs.io/projects/proxy](https://vey.readthedocs.io/projects/proxy/en/latest/)
- Migration from G3: [migrate_from_g3_to_vey.md](https://github.com/VEY-OSS/vey/blob/main/doc/migrate_from_g3_to_vey.md)
