import assert from "node:assert/strict";
import { test } from "node:test";
import { jsonRequest, startApp } from "./client.ts";

test("the server reports its status", async t => {
	const request = await startApp(t);
	const response = await request("/health");
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { status: "ok" });
});

test("a new task appears in the list", async t => {
	const request = await startApp(t);
	const created = await request("/tasks", jsonRequest("POST", { title: "  Review the diff  " }));
	assert.equal(created.status, 201);
	const task = await created.json();
	assert.deepEqual(task, { id: "2", title: "Review the diff" });
	const list = await request("/tasks");
	assert.equal(list.status, 200);
	assert.deepEqual((await list.json()).at(-1), task);
});

test("a blank task title returns an error and leaves the list intact", async t => {
	const request = await startApp(t);
	const response = await request("/tasks", jsonRequest("POST", { title: " " }));
	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), { error: "invalid_task" });
	assert.deepEqual(await (await request("/tasks")).json(), [{ id: "1", title: "Write a spec" }]);
});

test("a task title of 120 characters is accepted", async t => {
	const request = await startApp(t);
	const title = "a".repeat(120);
	const response = await request("/tasks", jsonRequest("POST", { title }));
	assert.equal(response.status, 201);
	assert.equal((await response.json()).title, title);
});

test("an overlong title leaves the task list intact", async t => {
	const request = await startApp(t);
	const before = await (await request("/tasks")).json();
	const response = await request("/tasks", jsonRequest("POST", { title: "a".repeat(121) }));
	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), { error: "invalid_task" });
	assert.deepEqual(await (await request("/tasks")).json(), before);
});

test("an oversized JSON body leaves the task list intact", async t => {
	const request = await startApp(t);
	const before = await (await request("/tasks")).json();
	const response = await request("/tasks", jsonRequest("POST", { title: "a", extra: "x".repeat(4096) }));
	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), { error: "invalid_task" });
	assert.deepEqual(await (await request("/tasks")).json(), before);
});
