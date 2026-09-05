export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

export const isNullableString = (value: unknown): value is string | null =>
	value === null || typeof value === 'string';

export const isNullableNumber = (value: unknown): value is number | null =>
	value === null || (typeof value === 'number' && Number.isFinite(value));

export function decode<T>(value: unknown, guard: (value: unknown) => value is T, name: string): T {
	if (!guard(value)) throw new Error(`Invalid backend response for ${name}`);
	return value;
}

export const decodeNull = (value: unknown, name: string): null =>
	decode(value, (item): item is null => item === null, name);
