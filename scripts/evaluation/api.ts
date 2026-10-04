import * as engine from "../../src/game/engine";
import * as selectors from "../../src/game/selectors";
import { createInitialState } from "../../src/game/initialState";
import { content, modelById, ticketById } from "../../src/content";
import { BALANCE } from "../../src/game/balance";

export const currentApi = { ...engine, ...selectors, createInitialState, content, modelById, ticketById, BALANCE };
export type EvaluationApi = typeof currentApi;

/** Developer CLI can load the same harness against a preserved checkout. */
export async function loadApi(root?: string): Promise<EvaluationApi> {
  if (!root) return currentApi;
  const base = root.replace(/\/$/, "");
  const [rules, queries, initial, data, balance] = await Promise.all([
    import(`${base}/src/game/engine.ts`), import(`${base}/src/game/selectors.ts`),
    import(`${base}/src/game/initialState.ts`), import(`${base}/src/content/index.ts`),
    import(`${base}/src/game/balance.ts`),
  ]);
  return { ...rules, ...queries, ...initial, ...data, ...balance };
}
