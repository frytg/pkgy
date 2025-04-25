# base on top of alpine image
# https://hub.docker.com/_/alpine/
# https://github.com/alpinelinux/docker-alpine
ARG ALPINE_VERSION=3.21
FROM alpine:${ALPINE_VERSION}

# label container
LABEL org.opencontainers.image.source="https://github.com/frytg/pkgy/g3-http-proxy"
LABEL org.opencontainers.image.description="HTTP forward proxy"

# install some required packages
RUN apk add --no-cache ca-certificates libgcc c-ares

# copy pre-compiled binary into alpine image
COPY ./g3proxy.yml /etc/g3proxy.yml
COPY ./g3proxy /usr/bin/g3proxy

# set entry
ENTRYPOINT ["/usr/bin/g3proxy"]
CMD ["--config-file", "/etc/g3proxy.yml"]
