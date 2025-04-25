# base on top of alpine image
ARG ALPINE_VERSION=latest
FROM alpine:${ALPINE_VERSION}

# label container
LABEL org.opencontainers.image.source="https://github.com/frytg/pkgy/g3-http-proxy"
LABEL org.opencontainers.image.description="HTTP forward proxy"

# install some required packages
RUN apk add --no-cache ca-certificates libgcc c-ares

# copy pre-compiled binary into alpine image
COPY ./g3proxy.yaml /etc/g3proxy.yaml
COPY ./g3/target/release-lto/g3proxy /bin/g3proxy
RUN chmod +x /bin/g3proxy

# set entry
ENTRYPOINT ["/bin/g3proxy"]
CMD ["--config-file", "/etc/g3proxy.yaml"]
