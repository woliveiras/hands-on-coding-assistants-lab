import assert from "node:assert/strict";
import { test } from "node:test";
import { jsonRequest, startApp } from "./client.ts";
import "../contracts/labels.test.ts";

test("labels count distinct normalized values", async t => {
	const request = await startApp(t);
	const labels = [" Urgent ", "URGENT", ...Array.from({ length: 9 }, (_, i) => `label-${i}`)];
	const response = await request("/tasks/1/labels", jsonRequest("PATCH", { labels }));
	assert.equal(response.status, 200);
	const body = await response.json();
	assert.deepEqual(body, {
		id: "1", title: "Write a spec", labels: ["urgent", ...labels.slice(2)],
	});
});
