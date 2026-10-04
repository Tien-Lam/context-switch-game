import { describe, expect, it } from "vitest";
import { advanceGame, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import { projectedTicketRisk } from "../src/game/selectors";

describe("completion risk forecast", () => {
  for (const notes of [false, true]) {
    it(`includes known context decay${notes ? " with context notes" : ""}`, () => {
      const state = createInitialState();
      state.completedTicketIds = ["deployment-banner"];
      state.sessions[0].context = 78;
      state.providerQuota.anthill = 60;
      if (notes) state.purchasedUpgradeIds.push("context-notes");
      const forecast = projectedTicketRisk(state, "cache-summary", true, "high", "ballad");
      const ready = advanceGame(startTicket(state, 0, "cache-summary", "ballad", true, "high"), 8);
      expect(forecast.min).toBe(Math.round(ready.reviews[0].risk * 100));
      expect(forecast.max).toBe(forecast.min);
      if (!notes) expect(forecast.min).toBe(23);
    });
  }
});
