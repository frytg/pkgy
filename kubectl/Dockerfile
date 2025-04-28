# base on top of alpine image
# https://hub.docker.com/_/alpine/
# https://github.com/alpinelinux/docker-alpine
ARG ALPINE_VERSION
FROM alpine:${ALPINE_VERSION}

# label container
LABEL org.opencontainers.image.source="https://github.com/frytg/pkgy"
LABEL org.opencontainers.image.description="Kubectl alpine image"

# install some required packages
RUN apk add --no-cache kubectl
RUN kubectl version --client=true
