import { requestTrace, sendCounts, sendLogs, sendTraces, waitForBackends } from "./telemetry.mjs";

await waitForBackends();

const minute = 60_000;
const start = Math.floor(Date.now() / minute) * minute - 10 * minute;
const at = (minutes, seconds = 0) => start + minutes * minute + seconds * 1000;
const counts = [0, 0, 0, 20, 30, 10, 0, 0].map((timeout, i) => ({
	time: at(i),
	ok: 100 - timeout,
	timeout,
}));

const sampled = [
	{ traceId: "481cb6f66241573f816769e4072355b1", start: at(2, 2), status: 201, version: "v1" },
	{ traceId: "aec37bda1b3f4424971afd93d2a351a2", start: at(3, 2), status: 504, version: "v2" },
	{ traceId: "33b9a645678049089028e45369719ded", start: at(4, 2), status: 504, version: "v2" },
	{ traceId: "17be4d36d4554a91bc2b65345a0e215e", start: at(5, 2), status: 504, version: "v2" },
	{ traceId: "56a81ab850d44e2f8be9959c5b04818e", start: at(6, 2), status: 201, version: "v1" },
];
const events = [
	{ time: at(2, 45), event: "release", action: "deploy", version: "v2" },
	{ time: at(3, 30), event: "page", source: "synthetic incident operator", reason: "gateway errors" },
	{ time: at(5, 45), event: "release", action: "rollback", version: "v1" },
];
const spans = sampled.flatMap(sample => {
	const timedOut = sample.status === 504;
	return requestTrace({
		...sample,
		duration: timedOut ? 750 : 39,
		upstreamDuration: timedOut ? 1100 : 27,
		upstreamStatus: 201,
	});
});
const logs = sampled
	.filter((_, index) => index !== 3)
	.map(sample => ({
		time: sample.start,
		event: "request",
		method: "POST",
		route: "/tasks",
		status: sample.status,
		trace_id: sample.traceId,
		message: sample.status === 504 ? "upstream deadline" : "request completed",
	}));

await Promise.all([sendCounts(counts), sendLogs("incident", [...events, ...logs].sort((a, b) => a.time - b.time)), sendTraces(spans)]);

const search = new URL("http://tempo:3200/api/search");
search.search = new URLSearchParams({
	q: '{ resource.service.name = "task-gateway" && span.http.route = "/tasks" && span.http.response.status_code = 504 }',
	start: String(at(-1) / 1000),
	end: String(at(8) / 1000),
});
for (let attempt = 0; ; attempt++) {
	const response = await fetch(search, { signal: AbortSignal.timeout(5000) });
	if (!response.ok) throw new Error(`Tempo search returned HTTP ${response.status}`);
	const { traces } = await response.json();
	if (traces?.length === 3) break;
	if (attempt === 59) throw new Error("The three timeout traces are not searchable. Clear the stack before reseeding.");
	await new Promise(resolve => setTimeout(resolve, 1000));
}

function iso(time) {
	return new Date(time).toISOString();
}

console.log(JSON.stringify({
	from: iso(at(-1)),
	to: iso(at(8)),
	countedMinutes: { first: iso(at(0)), last: iso(at(7)), stepSeconds: 60 },
	incident: { from: iso(at(3)), toExclusive: iso(at(6)) },
	affectedMinuteTimestamps: [3, 4, 5].map(index => iso(at(index))),
	lastAffectedUnixSeconds: at(5) / 1000,
	sampleTraceIDs: sampled.map(sample => sample.traceId),
}, null, 2));
