LABEL org.opencontainers.image.source=https://github.com/frytg/pkgy/g3-http-proxy
LABEL org.opencontainers.image.description="Containerized G3 forward proxy"

# copy binary into alpine image
ARG ALPINE_VERSION=latest
FROM alpine:${ALPINE_VERSION}
COPY --chown=root:root --chmod=755 ./g3/target/release-lto/g3proxy /usr/bin/g3proxy
ENTRYPOINT ["/usr/bin/g3proxy"]
