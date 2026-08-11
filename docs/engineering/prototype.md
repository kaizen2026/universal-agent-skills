## What it does

`prototype` builds throwaway code to answer a logic or state-model question that is hard to settle on paper. Visual exploration now delegates to `frontend-design`, where runnable alternatives become evidence for a durable design contract.

## When to reach for it

Type `/prototype`, or the agent reaches for it when the open question is "does this logic or state model feel right?" Reach for [frontend-design](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-design/SKILL.md) when the question is "what should this look like?"

## One branch, one question

The artifact is a single shareable HTML file with free-play controls and guided walkthroughs. It surfaces full relevant state after each action and stays deliberately light on production abstractions, persistence, error handling, and tests.

## The prototype is evidence

Throwaway describes how the code is written, not whether the learned answer survives. Keep the prototype off main as primary-source evidence, capture the verdict in the issue, and fold only the validated decision into production.

## Common questions

**Why did the UI branch move?**

Visual variants need more than a switcher: resolved product prerequisites, screenshots, human preference, accessibility constraints, and an implementation contract. `frontend-design` owns that full loop.

**Can the agent choose the winning answer?**

It can expose behavior and tradeoffs. The human answers whether the model feels right.

## It's working if

- The prototype isolates one logic question.
- A non-developer can drive the hard cases without installing tooling.
- The issue records a verdict and points to the captured artifact.

## Where it fits

This remains a reach-for-it-anytime logic detour from grilling or Wayfinder. Its visual sibling is [frontend-design](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/frontend-design/SKILL.md); [ask-matt](https://github.com/kaizen2026/universal-agent-skills/blob/main/skills/engineering/ask-matt/SKILL.md) routes both.
