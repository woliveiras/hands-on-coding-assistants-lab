# Investigate a Task API incident

Run these commands from the root of your fork. Docker Compose starts Grafana,
Tempo, Loki, Prometheus, and a small Task API gateway. All traffic and incident
data in this exercise are fictional.

```sh
docker compose -f observability/compose.yml up -d
docker compose -f observability/compose.yml exec -T simulator node incident.mjs
```

The seed waits for the data sources and prints a UTC `from` and `to`. The dates
are relative to when you run it. The events, amounts, and spacing are the same
on each fresh run. Keep the printed window with your notes.

Open [Task API Incident Replay](http://127.0.0.1:3300/d/task-api-incident/task-api-incident-replay)
and set the absolute range to the printed window. The local instance opens as a
Viewer. You can run queries in Explore and inspect provisioned dashboards.
Saving a dashboard requires a different role.

- In **Explore → Tempo**, select the TraceQL query type and search for
  `{ resource.service.name = "task-gateway" && span.http.route = "/tasks" && span.http.response.status_code = 504 }`.
  Open a matching trace and check the gateway and Task API spans separately.
- In **Explore → Loki**, use
  `{service_name="task-gateway",exercise="incident"} | json | trace_id="TRACE_ID"`
  with one of the IDs from Tempo. Record whether the log exists before drawing
  a conclusion about it. The log detail view links back to Tempo when a trace ID
  is present.
- Compare the same trace window with the request counts and the rollout events
  on the incident dashboard. For a precise affected-minute total, run
  `sum(sum_over_time(lab_incident_requests[3m] @ LAST_AFFECTED_UNIX_SECONDS))`
  as an instant query in Prometheus. Replace the placeholder with the seed's
  `lastAffectedUnixSeconds`. For the numerator, add
  `{outcome="timeout"}` after the metric name.

Only Grafana is reachable from the host in this configuration, on
`127.0.0.1:3300`. Docker access belongs to the person running the setup. Give
OpenCode the saved queries and synthetic excerpts it needs for the postmortem.

To clear the replay or prepare the alert exercise, remove the stack and its
project-local volumes.

```sh
docker compose -f observability/compose.yml down -v
```

## Exercise the alert with live traffic

Use the alert configuration after completing the postmortem exercise. It opens
a separate local exercise with the same data sources and enables alerting.
Start from a clean Compose run so Grafana can create its operator account.

```sh
docker compose -f observability/compose.yml -f observability/compose.alerts.yml up -d
```

Sign in at [Grafana](http://127.0.0.1:3300) with username and password
`lab-operator`. These credentials belong to this loopback-only exercise.
Open [Task API Live Telemetry](http://127.0.0.1:3300/d/task-api-live/task-api-live-telemetry)
and the **Task gateway error ratio** alert rule.

Run these traffic phases in order. Each sends one request a second for about
45 seconds. The healthy phases return `201`. The middle phase injects `504`
for two of every five requests at the local gateway.

```sh
node observability/traffic.mjs healthy
node observability/traffic.mjs degraded
curl -fsS http://127.0.0.1:3400/notifications
node observability/traffic.mjs healthy
curl -fsS http://127.0.0.1:3400/notifications
```

Compare the gateway's measured ratio with the 20% threshold. The alert uses a
30-second rate window, evaluates every ten seconds, and waits ten seconds
above the threshold. The local webhook records the `firing` notification and
then `resolved` after recovery. A delivered test notification alone cannot show
that the metric crossed the rule's threshold.

The gateway times responses, counts 2xx, 4xx and 5xx by status class, and records
the route, method, status, duration, and trace ID. Search for a recent error in
Tempo and in Loki with `exercise="live"`. Replay with a fictional marker in a
title and verify the raw log and span attributes are limited to those fields.

```sh
docker compose -f observability/compose.yml -f observability/compose.alerts.yml down -v
```

## References

- Grafana Labs. [Query tracing data](https://grafana.com/docs/grafana/latest/datasources/tempo/query-editor/).
  Grafana Tempo data-source documentation.
- Grafana Labs. [Use configuration files to provision alerting resources](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/).
  Grafana Alerting documentation.
- OpenTelemetry. [Semantic conventions for HTTP spans](https://opentelemetry.io/docs/specs/semconv/http/http-spans/).
  OpenTelemetry specification.
