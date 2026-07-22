export function createValidationErrorKey(error: string, index: number) {
	return `${index}:${error}`;
}
