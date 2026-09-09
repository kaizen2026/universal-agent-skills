import { parseDocument } from "yaml";

export function readYamlMapping(source) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors.map(error => error.message).join("; "));
  const value = document.toJS({ maxAliasCount: 20 });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected a YAML mapping");
  return value;
}

export function validateAgentMetadata(frontmatter, metadata, requireDefaultPrompt = false) {
  const errors = [];
  const ui = metadata.interface;
  if (typeof ui?.display_name !== "string" || !ui.display_name.trim() || typeof ui?.short_description !== "string" || !ui.short_description.trim()) {
    errors.push("interface requires nonempty display_name and short_description strings");
  }
  if (metadata.policy !== undefined && (!metadata.policy || typeof metadata.policy !== "object" || Array.isArray(metadata.policy))) {
    errors.push("policy must be a mapping");
  }
  if (frontmatter["disable-model-invocation"] !== undefined && typeof frontmatter["disable-model-invocation"] !== "boolean") {
    errors.push("disable-model-invocation must be a boolean");
  }
  if (metadata.policy?.allow_implicit_invocation !== undefined && typeof metadata.policy.allow_implicit_invocation !== "boolean") {
    errors.push("allow_implicit_invocation must be a boolean");
  }
  if ((frontmatter["disable-model-invocation"] === true) !== (metadata.policy?.allow_implicit_invocation === false)) {
    errors.push("invocation policy disagrees with SKILL.md");
  }
  if (ui?.default_prompt !== undefined && typeof ui.default_prompt !== "string") {
    errors.push("default_prompt must be a string");
  }
  if (requireDefaultPrompt && (typeof ui?.default_prompt !== "string" || !ui.default_prompt.includes(`$${frontmatter.name}`))) {
    errors.push(`default_prompt must explicitly invoke $${frontmatter.name}`);
  }
  return errors;
}
