// Helpers for {{variable}} placeholders in saved prompts.
// A prompt like "Write a cold email to {{company}} about {{product}}" exposes two
// variables; we ask the user to fill them, then substitute before sending to the agent.

// Match {{ name }} — names are word chars, dots and hyphens (e.g. first_name, company.name).
const VAR_PATTERN = "\\{\\{\\s*([\\w.-]+)\\s*\\}\\}";

/** Unique variable names found in a prompt, in first-seen order. */
export function parseVars(content: string): string[] {
  const re = new RegExp(VAR_PATTERN, "g");
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

/** Replace every {{var}} with its value (missing/empty → empty string). */
export function fillVars(content: string, values: Record<string, string>): string {
  return content.replace(
    new RegExp(VAR_PATTERN, "g"),
    (_, name: string) => values[name] ?? "",
  );
}
