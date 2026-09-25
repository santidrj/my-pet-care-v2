---
status: accepted
---

# Service logs on stdout

**Owner & Pet Manager**, **Pet Health Service**, and **Activity Manager** each write service logs as one JSON object per line on stdout, through Fastify’s Pino logger. A service log is how a person or a coding or operations agent reconstructs one call after the fact. Both read the same records. An Owner **registers** a Meal, a Wash, or an Activity; that act is not a service log.

We considered Fastify’s default request logging, Pino’s numeric levels, per-process incrementing ids, OpenTelemetry spans, and logging request bodies. Default request lines use `reqId`, can include the raw URL and headers, and collide across processes. Spans need a collector this backend does not have in v1. Bodies would copy health data and credentials into the log stream.

**Output.** Each service runs at `info` and always writes JSON. It does not write log files or ship logs to a collector. `level` is the label string `info`, `warn`, or `error`. `time` is epoch milliseconds. Fastify’s automatic request logging is off (`disableRequestLogging`). Pretty-printing is a viewer in front of stdout.

**Service log.** The only events are `http.request.completed`, when an inbound HTTP request finishes, and `http.client.completed`, when a synchronous call to another platform service finishes or fails. In-process steps are not service logs. Every service log carries `service`, `correlationId`, `event`, `outcome` (`success` or `failure`), and `durationMs`. It has no `msg`. `service` is `owner-pet-manager`, `pet-health-service`, or `activity-manager`.

**Levels.** `info` when `outcome` is `success`. `warn` when `outcome` is `failure` and `statusCode` is 4xx. `error` when `outcome` is `failure` and `statusCode` is 5xx, or when `statusCode` is absent. These two events are not emitted at `debug` or `trace`. An operator may raise the threshold above `info`; success service logs then disappear.

**Inbound.** `http.request.completed` adds `method`, `route` (the route template), `statusCode`, and each path-parameter id as its own field. On failure it adds `problemType`, the Problem Details `type` from ADR-0010. A capability token, such as an external Share link, is not a path-id field.

**Outbound.** `http.client.completed` adds `target` (`owner-pet-manager`, `pet-health-service`, `activity-manager`, or `community`), `method`, `route` (the route template on the target), and `statusCode`. On failure it adds `problemType`. A call that receives no response is `outcome: failure` at `error`, with `statusCode` and `problemType` absent. `durationMs` is how long the caller waited.

**Errors.** An `error` service log may include Pino’s `err` object (`type`, `message`, `stack`). The message is a stable internal sentence with no request data, ids, or secrets. A `warn` log does not include `err`. When the process is still alive and a request fails with no response, the inbound `http.request.completed` log is that error record.

**Redaction.** A service log does not include names, notes, tokens, `Authorization` headers, password hashes, query strings, request or response bodies, or Problem Details `detail`.

**Correlation.** The service that accepts the inbound call keeps the `request-id` header when its value is a UUID, and otherwise generates a UUID. The log field is `correlationId`. Every outbound call from ADR-0002 sends that same UUID in `request-id`. The callee copies it onto its own service logs. There are no span ids.

**Other lines.** A logger line without `event` is not a service log. Startup, shutdown, and a failure before any request exists carry `service`, `time`, `level`, and `msg`, and do not carry `event`, `correlationId`, or `outcome`. A fatal startup failure may include `err` under the same message rule.

**Consequences.** Humans and agents parse one shape. Fastify’s `reqId` and incrementing ids are not the correlation mechanism. v1 has no log collector and no trace spans.
