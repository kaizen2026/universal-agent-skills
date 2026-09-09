import assert from "node:assert/strict";
import { test } from "node:test";
import { readYamlMapping, validateAgentMetadata } from "../scripts/lib/skill-metadata.mjs";

const frontmatter = { name: "example", description: "A useful skill" };
const metadata = { interface: { display_name: "Example", short_description: "A useful example skill", default_prompt: "Use $example for this task." } };

test("YAML reader preserves folded descriptions, comments, booleans, and nested metadata", () => {
  const value = readYamlMapping('name: example\ndescription: >-\n  First line\n  second line\ndisable-model-invocation: true # explicit\nmetadata:\n  version: "1"\n');
  assert.equal(value.description, "First line second line");
  assert.equal(value["disable-model-invocation"], true);
  assert.deepEqual(value.metadata, { version: "1" });
});

test("YAML reader rejects duplicate keys, malformed structures, and non-mappings", () => {
  for (const source of ["name: one\nname: two", "name: [", "- list", "null", "word", "x: *missing"]) {
    assert.throws(() => readYamlMapping(source));
  }
});

test("invocation defaults match across hosts and explicit-only policy must agree", () => {
  assert.deepEqual(validateAgentMetadata(frontmatter, metadata, true), []);
  assert.deepEqual(validateAgentMetadata({ ...frontmatter, "disable-model-invocation": true }, { ...metadata, policy: { allow_implicit_invocation: false } }, true), []);
  assert.match(validateAgentMetadata({ ...frontmatter, "disable-model-invocation": true }, metadata).join("\n"), /disagrees/);
  assert.match(validateAgentMetadata(frontmatter, { ...metadata, policy: { allow_implicit_invocation: false } }).join("\n"), /disagrees/);
});

test("wrong YAML types cannot silently disable invocation or crash default-prompt validation", () => {
  const errors = validateAgentMetadata({ ...frontmatter, "disable-model-invocation": "false" }, {
    interface: { display_name: "", short_description: 42, default_prompt: ["$example"] },
    policy: { allow_implicit_invocation: "true" },
  }, true);
  assert.equal(errors.length, 5);
  assert.match(validateAgentMetadata(frontmatter, { ...metadata, policy: [] }).join("\n"), /mapping/);
  assert.match(validateAgentMetadata(frontmatter, { interface: { ...metadata.interface, default_prompt: "Use something else" } }, true).join("\n"), /explicitly invoke/);
});
