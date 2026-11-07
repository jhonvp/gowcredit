# Load tests (Artillery)

`make test-load` runs `health.yml` against the API in Docker. Thresholds (p95 < 200 ms, p99 < 500 ms,
0 failed users) make the run fail when they're missed.

As endpoints land, add one YAML per flow (`upload.yml`, `case-status.yml`). The cascade itself is
async (SQS worker), so the load tests measure the API's ingest and read paths. Worker throughput is
measured by the eval harness.
