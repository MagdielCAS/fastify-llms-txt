export function formatHeading(text: string, level = 1): string {
	return `${"#".repeat(level)} ${text}`;
}

export function formatCodeBlock(code: string, language = ""): string {
	return `\`\`\`${language}\n${code}\n\`\`\``;
}

export function formatList(items: string[], indentLevel = 0): string {
	const indent = "  ".repeat(indentLevel);
	return items.map((item) => `${indent}- ${item}`).join("\n");
}

export function formatBold(text: string): string {
	return `**${text}**`;
}
