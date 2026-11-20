import { randomBytes } from "node:crypto";

const tempo = "http://tempo:4318/v1/traces";
const loki = "http://loki:3100/loki/api/v1/push";
const prometheus = "http://prometheus:9090/api/v1/otlp/v1/metrics";

export const nanoseconds = milliseconds => (BigInt(Math.round(milliseconds)) * 1_000_000n).toString();
export const attribute = (key, value) => ({
	key,
	value: typeof value === "number" ? { intValue: String(value) } : { stringValue: value },
});

async function post(url, data) {
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(data),
		signal: AbortSignal.timeout(5000),
	});
	const body = await response.text();
	if (!response.ok) throw new Error(`Telemetry service ${url} returned ${response.status} ${body}`);
	if (body && body !== "{}") {
		const partial = JSON.parse(body).partialSuccess;
		if (partial?.errorMessage) throw new Error(partial.errorMessage);
	}
}

export async function waitForBackends() {
	const urls = [
		"http://tempo:3200/ready",
		"http://loki:3100/ready",
		"http://prometheus:9090/-/ready",
	];
	for (let attempt = 0; attempt < 60; attempt++) {
		const results = await Promise.allSettled(urls.map(async url => {
			const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
			await response.text();
			return response.ok;
		}));
		if (results.every(result => result.status === "fulfilled" && result.value)) return;
		await new Promise(resolve => setTimeout(resolve, 1000));
	}
	throw new Error("Tempo, Loki, or Prometheus did not become ready. Check docker compose logs.");
}

function span({ service, version, traceId, spanId, parentSpanId, start, duration, status, method, route }) {
	return {
		resource: { attributes: [attribute("service.name", service), attribute("service.version", version)] },
		scopeSpans: [{
			scope: { name: "task-api-lab" },
			spans: [{
				traceId,
				spanId,
				...(parentSpanId ? { parentSpanId } : {}),
				name: `${method} ${route}`,
				kind: 2,
				startTimeUnixNano: nanoseconds(start),
				endTimeUnixNano: nanoseconds(start + duration),
				attributes: [
					attribute("http.request.method", method),
					attribute("http.route", route),
					attribute("http.response.status_code", status),
				],
				status: { code: status >= 500 ? 2 : 0 },
			}],
		}],
	};
}

export function requestTrace({
	traceId = randomBytes(16).toString("hex"),
	spanId = randomBytes(8).toString("hex"),
	method = "POST",
	route = "/tasks",
	...request
}) {
	const gateway = span({
		service: "task-gateway",
		traceId, spanId, method, route,
		...request,
	});
	if (request.upstreamDuration === undefined) return [gateway];
	const api = span({
		service: "task-api",
		traceId,
		spanId: randomBytes(8).toString("hex"),
		parentSpanId: spanId,
		method, route,
		version: request.version,
		start: request.upstreamStart ?? request.start + 5,
		duration: request.upstreamDuration,
		status: request.upstreamStatus,
	});
	return [gateway, api];
}

export function sendTraces(resourceSpans) {
	return post(tempo, { resourceSpans });
}

export function sendLogs(exercise, entries) {
	return post(loki, {
		streams: [{
			stream: { service_name: "task-gateway", exercise },
			values: entries.map(({ time, ...entry }) => [nanoseconds(time), JSON.stringify(entry)]),
		}],
	});
}

export function sendCounts(points) {
	const dataPoints = points.flatMap(({ time, ok, timeout }) => [
		{ outcome: "success", count: ok },
		{ outcome: "timeout", count: timeout },
	].map(({ outcome, count }) => ({
		attributes: [attribute("outcome", outcome)],
		timeUnixNano: nanoseconds(time),
		asInt: String(count),
	})));
	return post(prometheus, {
		resourceMetrics: [{
			resource: { attributes: [attribute("service.name", "task-gateway")] },
			scopeMetrics: [{
				scope: { name: "task-api-lab" },
				metrics: [{
					name: "lab_incident_requests",
					description: "Synthetic request count for the incident minute, by outcome",
					gauge: { dataPoints },
				}],
			}],
		}],
	});
}
