import type { ReplayResult } from "./runner";

export interface CriticFinding {
  presentationOrder: ["Amber" | "Cobalt", "Amber" | "Cobalt"];
  evidence: "replay judgment" | "live browser experience";
  preference: "Amber" | "Cobalt" | "tie" | "insufficient evidence";
  namedPreference: string;
  supportingMoments: { variant: "Amber" | "Cobalt"; actionSequence?: number; eventAt?: number; observation: string }[];
  regressions: string[];
  disagreement: string[];
  limitations: string[];
}

/** Output the private mapping to a separate coordinator file, never into critic input. */
export function createComparisonPair(left: ReplayResult, right: ReplayResult, order: "forward" | "reverse" = "forward", diagnosticControl = false) {
  if (JSON.stringify(left.initialState) !== JSON.stringify(right.initialState)) throw new Error("Comparison requires matched starting states.");
  if (left.contentSignature !== right.contentSignature) throw new Error("Comparison requires matched ticket identities, prerequisites, durations and model identities.");
  const policySignature = (result: ReplayResult) => {
    const { id: _id, initialDelaySeconds, ...policy } = result.config;
    return JSON.stringify({ ...policy, ...(diagnosticControl ? {} : { initialDelaySeconds: initialDelaySeconds ?? 0 }) });
  };
  if (policySignature(left) !== policySignature(right)) throw new Error("Comparison requires matched policies and action/time budgets.");
  const neutral = (result: ReplayResult, label: "Amber" | "Cobalt") => {
    const { buildId: _buildId, contentSignature: _signature, config, ...evidence } = result;
    const { id: _id, initialDelaySeconds: _delay, ...policy } = config;
    return { label, declaredPolicy: policy, ...evidence };
  };
  const variants = [neutral(left, "Amber"), neutral(right, "Cobalt")];
  return {
    criticInput: {
      evidence: "replay judgment; source-informed heuristic choices, not browser or human play",
      instructions: "Compare the experiences under the fast CLI orchestration taste brief. Cite exact action sequences or event times. Permit tie or insufficient evidence; record regressions and disagreement. Metrics are structural evidence, not a fun score. You must not have implemented either change or already know the mapping/rationale.",
      presentationOrder: order === "forward" ? ["Amber", "Cobalt"] : ["Cobalt", "Amber"],
      variants: order === "forward" ? variants : variants.reverse(),
      findingSchema: { preference: ["Amber", "Cobalt", "tie", "insufficient evidence"], namedPreference: "string", supportingMoments: [{ variant: "Amber or Cobalt", actionSequence: "number", observation: "string" }], regressions: [], disagreement: [], limitations: [] },
    },
    privateMapping: { Amber: left.buildId, Cobalt: right.buildId, configIds: [left.config.id, right.config.id], diagnosticControl },
  };
}
