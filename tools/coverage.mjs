import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const policyFile = "coverage-policy.json";
const counters = {
	lines: ["LH", "LF"],
	branches: ["BRH", "BRF"],
	functions: ["FNH", "FNF"],
};

function validatePolicy(policy) {
	if (!Array.isArray(policy.include) || policy.include.length === 0 ||
		new Set(policy.include).size !== policy.include.length ||
		policy.include.some(file => typeof file !== "string" || !file.startsWith("src/"))) {
		throw new Error("Coverage needs a list of distinct source files.");
	}
	for (const name of Object.keys(counters)) {
		const { covered, total } = policy.minimum?.[name] ?? {};
		if (!Number.isSafeInteger(covered) || !Number.isSafeInteger(total) || total <= 0 ||
			covered <= 0 || covered > total) {
			throw new Error(`Invalid ${name} coverage minimum.`);
		}
	}
	return policy;
}

function lowerRatio(actual, minimum) {
	return actual.covered * minimum.total < minimum.covered * actual.total;
}

function assertUnweakened(current, base) {
	if (current.include.length !== base.include.length ||
		base.include.some(file => !current.include.includes(file))) {
		throw new Error("Coverage scope differs from the base policy.");
	}
	for (const name of Object.keys(counters)) {
		if (lowerRatio(current.minimum[name], base.minimum[name])) {
			throw new Error(`The ${name} coverage minimum is lower than the base policy.`);
		}
	}
}

function readCoverage(report, include) {
	const records = report.split("end_of_record").map(record =>
		new Map(record.trim().split(/\r?\n/).map(line => line.split(":", 2))));
	const byFile = new Map(records.filter(record => record.has("SF"))
		.map(record => [record.get("SF").replaceAll("\\", "/"), record]));
	const results = {};

	for (const [metric, [hit, found]] of Object.entries(counters)) {
		let covered = 0;
		let total = 0;
		for (const file of include) {
			const record = byFile.get(file);
			if (!record) throw new Error(`Coverage report omitted ${file}.`);
			if (!record.has(hit) || !record.has(found)) {
				throw new Error(`Coverage report omitted ${metric} counters for ${file}.`);
			}
			covered += Number(record.get(hit));
			total += Number(record.get(found));
		}
		if (!Number.isSafeInteger(covered) || !Number.isSafeInteger(total) || total <= 0 ||
			covered < 0 || covered > total) {
			throw new Error(`Coverage report has invalid ${metric} counters.`);
		}
		results[metric] = { covered, total };
	}
	return results;
}

function run() {
	const { values } = parseArgs({
		options: { base: { type: "string" }, report: { type: "boolean" } },
	});
	const policy = validatePolicy(JSON.parse(readFileSync(policyFile, "utf8")));
	if (values.base) {
		if (!/^[a-f0-9]{40}$/.test(values.base)) throw new Error("--base expects a full commit SHA.");
		const baseJson = execFileSync("git", ["show", `${values.base}:${policyFile}`], { encoding: "utf8" });
		assertUnweakened(policy, validatePolicy(JSON.parse(baseJson)));
	}

	const directory = mkdtempSync(join(tmpdir(), "task-api-coverage-"));
	try {
		const report = join(directory, "coverage.lcov");
		const tests = readdirSync("test").filter(file => file.endsWith(".test.ts"));
		const result = spawnSync(process.execPath, [
			"--test",
			"--experimental-test-coverage",
			...policy.include.map(file => `--test-coverage-include=${file}`),
			"--test-reporter=spec",
			"--test-reporter=lcov",
			"--test-reporter-destination=stdout",
			`--test-reporter-destination=${report}`,
			...tests.map(file => `test/${file}`),
			"contracts/registration.test.ts",
		], { stdio: "inherit" });
		if (result.error) throw result.error;
		if (result.status !== 0) return result.status ?? 1;

		const actual = readCoverage(readFileSync(report, "utf8"), policy.include);
		for (const [metric, counts] of Object.entries(actual)) {
			const minimum = policy.minimum[metric];
			console.log(`${metric}: ${counts.covered}/${counts.total} (minimum ${minimum.covered}/${minimum.total})`);
			if (!values.report && lowerRatio(counts, minimum)) {
				console.error(`${metric} coverage is below the minimum.`);
				process.exitCode = 1;
			}
		}
		return process.exitCode ?? 0;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

try {
	process.exitCode = run();
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
