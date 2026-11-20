import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { normalizeRegistration } from "./registration.ts";

type Task = { id: string; title: string; labels: string[] };
type Registration = { id: string; name: string; email: string };

function send(response: ServerResponse, status: number, data: unknown) {
	response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	response.end(JSON.stringify(data));
}

async function readObject(request: IncomingMessage) {
	const chunks: Buffer[] = [];
	let bytes = 0;
	for await (const chunk of request.iterator({ destroyOnReturn: false })) {
		bytes += chunk.length;
		if (bytes > 4096) {
			request.resume();
			return undefined;
		}
		chunks.push(chunk);
	}
	try {
		const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		if (data && typeof data === "object" && !Array.isArray(data)) {
			return data as Record<string, unknown>;
		}
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
	}
	return undefined;
}

function normalizeLabels(input: unknown) {
	if (!Array.isArray(input)) return undefined;
	const normalized = new Set<string>();

	for (const value of input) {
		if (typeof value !== "string") return undefined;
		const label = value.trim();
		if (!label || label.length > 50) return undefined;
		normalized.add(label.toLowerCase());
	}

	return normalized.size <= 10 ? Array.from(normalized) : undefined;
}

export function createApp() {
	const tasks: Task[] = [{ id: "1", title: "Write a spec", labels: [] }];
	const registrations: Registration[] = [];

	return createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? "/", "http://localhost");
			const { method } = request;

			if (method === "GET" && url.pathname === "/health") {
				return send(response, 200, { status: "ok" });
			}
			if (method === "GET" && url.pathname === "/tasks") {
				const filter = url.searchParams.get("label");
				if (filter === null) return send(response, 200, tasks);
				const label = filter.trim().toLowerCase();
				return send(response, 200, tasks.filter(task => task.labels.includes(label)));
			}
			if (method === "POST" && url.pathname === "/tasks") {
				const data = await readObject(request);
				const title = typeof data?.title === "string" ? data.title.trim() : "";
				if (!title || title.length > 120) return send(response, 400, { error: "invalid_task" });
				const task = { id: String(tasks.length + 1), title, labels: [] };
				tasks.push(task);
				return send(response, 201, task);
			}
			if (method === "PATCH") {
				const match = /^\/tasks\/([^/]+)\/labels$/.exec(url.pathname);
				if (match) {
					const data = await readObject(request);
					const labels = normalizeLabels(data?.labels);
					if (!labels) return send(response, 400, { error: "invalid_labels" });

					const task = tasks.find(task => task.id === match[1]);
					if (!task) return send(response, 404, { error: "not_found" });
					task.labels = labels;
					return send(response, 200, task);
				}
			}
			if (method === "POST" && url.pathname === "/registrations") {
				const input = normalizeRegistration(await readObject(request));
				if (!input) return send(response, 400, { error: "invalid_registration" });

				const registration = { id: String(registrations.length + 1), ...input };
				registrations.push(registration);
				return send(response, 201, registration);
			}
			return send(response, 404, { error: "not_found" });
		} catch {
			return send(response, 500, { error: "unexpected_error" });
		}
	});
}
