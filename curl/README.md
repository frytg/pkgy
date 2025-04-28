# Curl Container

This wraps the `curl` project from [`curl/curl`](https://github.com/curl/curl) and provides a standalone docker container image.

## Build

The [justfile](justfile) contains the build process (`just build`).

## Run

Build the project yourself or navigate to the GitHub registry page and pull the latest image. From there it can be used like any other container image.

### Use for Cronjobs

You can use this image for cronjobs in Kubernetes:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
   name: my-cronjob
   namespace: some-name
spec:
   schedule: "17 * * * *"
   concurrencyPolicy: Replace
   successfulJobsHistoryLimit: 10
   failedJobsHistoryLimit: 10
   jobTemplate:
      spec:
         template:
            spec:
               restartPolicy: Never
               containers:
                  - name: cronjobs
                    image: ghcr.io/frytg/pkgy/curl:version-number
                    command: ["/bin/sh", "-c", "curl http://my-service.namespace:8080/some-trigger-path"]
```

(replace `version-number` with the latest version)

## Links:

- curl repository: [`curl/curl`](https://github.com/curl/curl)
- curl alpine package: [`curl`](https://pkgs.alpinelinux.org/package/edge/main/x86_64/curl)
