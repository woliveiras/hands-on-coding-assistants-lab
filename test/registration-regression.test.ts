import assert from "node:assert/strict";
import { test } from "node:test";
import { jsonRequest, startApp } from "./client.ts";

test("a rejected registration leaves ID 1 available", async t => {
	const request = await startApp(t);
	const rejected = await request("/registrations", jsonRequest("POST", {
		name: 42,
		email: "ada@example.test",
	}));
	assert.equal(rejected.status, 400);
	assert.deepEqual(await rejected.json(), { error: "invalid_registration" });

	const accepted = await request("/registrations", jsonRequest("POST", {
		name: "Ada",
		email: "ada@example.test",
	}));
	assert.equal(accepted.status, 201);
	assert.deepEqual(await accepted.json(), { id: "1", name: "Ada", email: "ada@example.test" });
});

test("registration rejects malformed JSON", async t => {
	const request = await startApp(t);
	const response = await request("/registrations", { method: "POST", body: "{" });
	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), { error: "invalid_registration" });
});
