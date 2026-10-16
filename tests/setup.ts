// Execute the actual Rust WASM in unit/integration tests, never a TS substitute.
import { readFileSync } from "node:fs";
import { initSync } from "../src/generated/hyperforest_bridge";
initSync({
  module: readFileSync(
    new URL("../src/generated/hyperforest_bridge_bg.wasm", import.meta.url),
  ),
});
