# Kubectl Container

This wraps the `kubectl` CLI and provides a standalone docker container image.

[![Containerize kubectl](https://github.com/frytg/pkgy/actions/workflows/build-kubectl.yml/badge.svg?branch=main)](https://github.com/frytg/pkgy/actions/workflows/build-kubectl.yml)

## Build

The [justfile](justfile) contains the build process (`just build`).

## Run

Build the project yourself or navigate to the GitHub registry page and pull the latest image. From there it can be used like any other container image.

### Use for Cronjobs

You can use this image for cronjobs in Kubernetes:

```yaml
# Set ServiceAccount, Role, RoleBinding
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: my-cronjob
  namespace: some-name
spec:
  schedule: '17 3 * * *'
  concurrencyPolicy: Replace
  successfulJobsHistoryLimit: 10
  failedJobsHistoryLimit: 10
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: some-sa
          restartPolicy: OnFailure
          containers:
            - name: cronjobs
              image: ghcr.io/frytg/pkgy/kubectl:version-number
              command: ['/bin/sh', '-c', 'kubectl rollout restart deployment/my-deployment -n my-namespace']
```

(replace `version-number` with the latest version)

## Links

- CLI docs: [kubernetes.io/docs/reference/kubectl](https://kubernetes.io/docs/reference/kubectl/)
- Alpine package: [`kubectl`](https://pkgs.alpinelinux.org/package/edge/community/x86_64/kubectl)
