import { apply } from "../src/domainClient";
import type { State } from "../src/model";

export function sampleWorkspace(now: number): State {
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(
    state,
    { type: "create", id: "project", title: "A meaningful project" },
    now,
  );
  // A representative test workspace; the application starts empty.
  state = apply(
    state,
    { type: "pedantic", treeId: "project", enabled: false },
    now,
  );
  for (const [id, parentId, title] of [
    ["discover", "project", "Discover"],
    ["create", "project", "Create"],
    ["share", "project", "Share"],
    ["read", "discover", "Read & wonder"],
    ["ask", "discover", "Ask good questions"],
    ["sketch", "create", "Sketch an idea"],
    ["build", "create", "Make it real"],
    ["tell", "share", "Tell the story"],
  ] as const)
    state = apply(state, { type: "add", id, parentId, title }, now);
  return state;
}
