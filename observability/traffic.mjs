import { setTimeout } from "node:timers/promises";

const [mode, count = "45"] = process.argv.slice(2);
if (!["healthy", "degraded"].includes(mode) || !/^[1-9][0-9]?$/.test(count)) {
	console.error("Usage: node observability/traffic.mjs healthy|degraded [request count, 1–99]");
	process.exit(1);
}

const gateway = "http://127.0.0.1:3400";
const config = await fetch(`${gateway}/control/mode`, {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify({ mode }),
});
if (!config.ok) throw new Error(`Gateway control returned HTTP ${config.status}`);
await config.text();

const statuses = {};
for (let i = 0; i < Number(count); i++) {
	const time = Date.now();
	const response = await fetch(`${gateway}/tasks`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ title: "Observe the Task API" }),
	});
	await response.text();
	statuses[response.status] = (statuses[response.status] ?? 0) + 1;
	await setTimeout(Math.max(0, 1000 - (Date.now() - time)));
}
console.log(JSON.stringify({ mode, statuses }));
