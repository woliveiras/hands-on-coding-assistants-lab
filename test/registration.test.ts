import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeRegistration } from "../src/registration.ts";

test("registration normalization trims fields and folds email case", () => {
	assert.deepEqual(normalizeRegistration({ name: " Ada ", email: " ADA@Example.test " }), {
		name: "Ada",
		email: "ada@example.test",
	});
});

test("registration accepts a name of exactly 100 characters", () => {
	const email = "ada@example.test";
	const name = "a".repeat(100);
	assert.deepEqual(normalizeRegistration({ name: ` ${name} `, email }), { name, email });
	assert.equal(normalizeRegistration({ name: name + "a", email }), undefined);
});

test("registration rejects invalid shape, name, and email", () => {
	for (const input of [
		undefined,
		null,
		[],
		{ name: 42, email: "ada@example.test" },
		{ name: "Ada", email: null },
		{ name: " ", email: "ada@example.test" },
		{ name: "Ada", email: "ada@example" },
	]) {
		assert.equal(normalizeRegistration(input), undefined);
	}
});
