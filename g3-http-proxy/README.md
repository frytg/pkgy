# G3 HTTP Forward Proxy Container

This builds the `g3proxy` project from [`bytedance/g3`](https://github.com/bytedance/g3) and provides a standalone docker container image to be used as forward proxy.

## Setup

Setup your local environment by running `just setup`.

Rust & Cargo are also required.

## Build

The [justfile](justfile) contains the build instructions, `cargo build` runs before `docker build`. This is just a personal preference and feels like it uses system resources more efficiently. It also makes it easier to cache required dependencies.

## Run

Build the project yourself or navigate to the GitHub registry page and pull the latest image. From there it can be used like any other container image. The proxy is exposed on port `3128`.

## Test

After running the proxy, you can test it using the following command:

```bash
curl -v -x localhost:3128 https://ipinfo.io
```

Replace localhost with the IP address of the machine running the proxy.
Be mindful that this can be abused. Therefore make sure to configure the proxy with appropriate authentication and access controls.

## Links:

- G3 repository: [`bytedance/g3`](https://github.com/bytedance/g3)
