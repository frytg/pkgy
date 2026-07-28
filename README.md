# pkgy

ˈpækədʒi – collection of recipes and self-/ pre-compiled packages or recipes for it (work in progress).

The main version of this repo lives on [tangled.org/frytg.digital/pkgy](https://tangled.org/frytg.digital/pkgy) with a mirror on [github.com/frytg/pkgy](https://github.com/frytg/pkgy).

## Why?

The reason for this repository is to provide a collection of recipes and self-/pre-compiled packages for various programming languages and tools.

They were primarily created for my personal and professional use, but can be used by anyone who has similar needs.

Either run the build scripts yourself or use the packages from GitHub registry. They are all built using GitHub Actions (see [_Working with the Container registry_](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

## Packages

See all published packages here: [github.com/users/frytg/packages?repo_name=pkgy](https://github.com/users/frytg/packages?repo_name=pkgy)

- [`g3-http-proxy`](./g3-http-proxy/) - standalone container image with http forward proxy
- [`universal-activitymap`](./universal-activitymap/) - hono server rendering activity charts (github, ...) as SVGs

### curl and kubectl

The `curl` and `kubectl` images were removed from this repository. For ad-hoc container images with these tools (and others), use [nixery.dev](https://nixery.dev/) instead — it builds images on demand from Nix packages:

```sh
docker run --rm nixery.dev/curl curl --version
docker run --rm nixery.dev/kubectl kubectl version --client
```

For interactive shells, include the `shell` meta-package:

```sh
docker run -it --rm nixery.dev/shell/curl bash
docker run -it --rm nixery.dev/shell/kubectl bash
```

In Kubernetes:

```yaml
image: nixery.dev/curl
# or
image: nixery.dev/kubectl
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

This applies to these files only, not the packages or tools used in the recipes, which are licensed under their respective licenses.
