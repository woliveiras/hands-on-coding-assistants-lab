import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { createApp } from "../src/app.ts";
import { requestTrace, sendLogs, sendTraces } from "./telemetry.mjs";

const app = createApp().listen(0, "127.0.0.1");
await once(app, "listening");
const appUrl = `http://127.0.0.1:${app.address().port}`;

const counts = { "2xx": 0, "4xx": 0, "5xx": 0 };
const latencyBuckets = [0.01, 0.05, 0.1, 0.25, 1];
const latencyCounts = [0, 0, 0, 0, 0];
const notifications = [];
let latencySum = 0;
let mode = "healthy";
let requestsInMode = 0;

function send(response, status, body) {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(body));
}

async function readJson(request) {
	let body = "";
	for await (const chunk of request) {
		body += chunk;
		if (body.length > 131072) throw new Error("Control request too large");
	}
	return JSON.parse(body);
}

function metrics() {
	const count = Object.values(counts).reduce((total, value) => total + value, 0);
	return [
		"# TYPE lab_task_gateway_requests_total counter",
		...Object.entries(counts).map(([status, count]) => `lab_task_gateway_requests_total{status_class="${status}"} ${count}`),
		"# TYPE lab_task_gateway_request_duration_seconds histogram",
		...latencyBuckets.map((limit, index) => `lab_task_gateway_request_duration_seconds_bucket{le="${limit}"} ${latencyCounts[index]}`),
		`lab_task_gateway_request_duration_seconds_bucket{le="+Inf"} ${count}`,
		`lab_task_gateway_request_duration_seconds_sum ${latencySum}`,
		`lab_task_gateway_request_duration_seconds_count ${count}`,
		"",
	].join("\n");
}

async function handleTask(request, response, target, route) {
	const start = Date.now();
	const timer = performance.now();
	const traceId = randomBytes(16).toString("hex");
	const method = request.method;
	const parts = [];
	let bodyBytes = 0;
	let status, result, upstreamDuration, upstreamStatus, upstreamStart;
	for await (const part of request) {
		bodyBytes += part.length;
		if (bodyBytes <= 4096) parts.push(part);
	}

	requestsInMode++;
	const injectTimeout = mode === "degraded" && requestsInMode % 5 < 2;
	if (injectTimeout) {
		await new Promise(resolve => setTimeout(resolve, 750));
		status = 504;
		result = { error: "simulated_upstream_deadline" };
	} else if (bodyBytes > 4096) {
		status = 400;
		result = { error: "invalid_task" };
	} else {
		const upstreamTimer = performance.now();
		upstreamStart = start + upstreamTimer - timer;
		try {
			const upstream = await fetch(`${appUrl}${target.pathname}${target.search}`, {
				method,
				headers: { "content-type": "application/json" },
				body: method === "GET" ? undefined : Buffer.concat(parts),
				signal: AbortSignal.timeout(2000),
			});
			status = upstream.status;
			upstreamStatus = status;
			result = await upstream.json();
		} catch {
			status = 502;
			result = { error: "upstream_unavailable" };
		}
		upstreamDuration = performance.now() - upstreamTimer;
	}
	const duration = performance.now() - timer;
	counts[`${Math.floor(status / 100)}xx`]++;
	latencySum += duration / 1000;
	for (const [index, limit] of latencyBuckets.entries()) {
		if (duration / 1000 <= limit) latencyCounts[index]++;
	}

	send(response, status, result);

	const traces = requestTrace({
		traceId, method, route, start, duration, status, version: mode,
		...(upstreamStatus ? { upstreamDuration, upstreamStatus, upstreamStart } : {}),
	});
	const log = {
		time: start,
		event: "request",
		method,
		route,
		status,
		duration_ms: Math.round(duration),
		trace_id: traceId,
	};
	void Promise.all([sendTraces(traces), sendLogs("live", [log])]).catch(error => console.error(error.message));
}

createServer(async (request, response) => {
	const target = new URL(request.url, "http://localhost");
	const path = target.pathname;
	try {
		if (path === "/metrics" && request.method === "GET") {
			response.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
			response.end(metrics());
			return;
		}
		if (path === "/control/mode" && request.method === "POST") {
			const update = await readJson(request);
			if (update.mode !== "healthy" && update.mode !== "degraded") {
				send(response, 400, { error: "invalid_mode" });
				return;
			}
			mode = update.mode;
			requestsInMode = 0;
			send(response, 200, { mode });
			return;
		}
		if (path === "/notifications" && request.method === "POST") {
			const payload = await readJson(request);
			notifications.push({
				receivedAt: new Date().toISOString(),
				status: payload.status,
				alerts: (payload.alerts ?? []).map(alert => ({
					name: alert.labels?.alertname,
					status: alert.status,
					startsAt: alert.startsAt,
					endsAt: alert.endsAt,
				})),
			});
			if (notifications.length > 100) notifications.shift();
			send(response, 200, { received: true });
			return;
		}
		if (path === "/notifications" && request.method === "GET") {
			send(response, 200, notifications);
			return;
		}
		if (path === "/tasks" && (request.method === "GET" || request.method === "POST")) {
			await handleTask(request, response, target, "/tasks");
			return;
		}
		if (/^\/tasks\/[^/]+\/labels$/.test(path) && request.method === "PATCH") {
			await handleTask(request, response, target, "/tasks/:id/labels");
			return;
		}
		send(response, 404, { error: "not_found" });
	} catch {
		send(response, 400, { error: "invalid_request" });
	}
}).listen(4000, "0.0.0.0");
