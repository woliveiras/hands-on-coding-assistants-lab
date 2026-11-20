export function normalizeRegistration(input: unknown) {
	if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
	const { name, email } = input as Record<string, unknown>;
	if (typeof name !== "string" || typeof email !== "string") return undefined;

	const normalizedName = name.trim();
	const normalizedEmail = email.trim().toLowerCase();
	const validEmail = /^[^@\s]+@[^@.\s]+(?:\.[^@.\s]+)+$/.test(normalizedEmail);
	if (!normalizedName || normalizedName.length > 100 || !validEmail) return undefined;

	return { name: normalizedName, email: normalizedEmail };
}
