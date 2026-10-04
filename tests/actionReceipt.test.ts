import { describe, expect, it } from "vitest";
import { advanceGame, buyUpgrade, compactSession, reviewTicket, startTicket } from "../src/game/engine";
import { createInitialState } from "../src/game/initialState";
import { actionReceipt } from "../src/ui/actionReceipt";

function ready(ticketId = "telemetry-toggle") {
  const game = createInitialState();
  game.completedTicketIds = ["deployment-banner"];
  game.unlockedSessions = 2;
  return advanceGame(startTicket(game, 0, ticketId, "ballad"), 20);
}

describe("confirmed action receipts", () => {
  it("confirms a paid compact even when context already equals the compact target", () => {
    const before = structuredClone(startTicket(createInitialState(), 0, "deployment-banner", "ballad"));
    before.sessions[0].context = 88;
    before.sessions[0].progress = 0.5;
    const effect = { type: "compact", sessionId: 0 } as const;
    const after = compactSession(before, 0);
    expect(actionReceipt(effect, before, after)).toContain("3 quota charged · progress 42%");
    expect(actionReceipt(effect, before, before)).toBeNull();
  });
  it("reports escaped risk and the owning provider in the invoking tab without duplicating events", () => {
    const before = ready();
    const effect = { type: "review", reviewId: before.reviews[0].id, decision: "approve" } as const;
    const after = reviewTicket(before, effect.reviewId, effect.decision);
    const snapshot = structuredClone(after);
    const receipt = actionReceipt(effect, before, after);
    expect(receipt).toContain("APP-118 shipped · Anthill Code · session 1");
    expect(receipt).toContain("visible risk unresolved");
    expect(receipt).toContain("Recovery: FIX-118");
    expect(receipt).toContain("Trust +");
    expect(after).toEqual(snapshot);
    expect(after.events.filter((event) => event.title === "APP-118 shipped")).toHaveLength(1);
  });

  it("does not confirm a rejected or stale action", () => {
    const before = ready();
    expect(actionReceipt({ type: "review", reviewId: before.reviews[0].id, decision: "approve" }, before, before)).toBeNull();
    expect(actionReceipt({ type: "review", reviewId: "missing", decision: "approve" }, before, before)).toBeNull();
  });

  it("shows revision work instead of inventing a shipment or reward", () => {
    const before = ready();
    const effect = { type: "review", reviewId: before.reviews[0].id, decision: "revise" } as const;
    const after = reviewTicket(before, effect.reviewId, effect.decision);
    expect(actionReceipt(effect, before, after)).toContain("APP-118 changes requested");
    expect(actionReceipt(effect, before, after)).not.toContain("Trust +");
    expect(after.stats.shipped).toBe(before.stats.shipped);
  });

  it("reports failed incident repairs as failures, not shipments", () => {
    const game = createInitialState();
    game.flags.privacyDefaultedOn = true;
    game.completedTicketIds = ["deployment-banner", "telemetry-toggle"];
    const before = structuredClone(advanceGame(startTicket(game, 0, "telemetry-repair", "ballad"), 20));
    before.reviews[0].risk = 0.8;
    const effect = { type: "review", reviewId: before.reviews[0].id, decision: "approve" } as const;
    const after = reviewTicket(before, effect.reviewId, effect.decision);
    expect(actionReceipt(effect, before, after)).toContain("repair failed");
    expect(actionReceipt(effect, before, after)).toContain("FIX-118 ready");
    expect(actionReceipt(effect, before, after)).not.toContain("FIX-118 shipped");
  });

  it("quotes the actual trust cost and dashboard opening command only after purchase", () => {
    const before = createInitialState();
    before.completedTicketIds = ["deployment-banner", "telemetry-toggle", "runtime-upgrade"];
    before.trust = 60;
    const effect = { type: "purchase", upgradeId: "terminal-dashboard" } as const;
    expect(actionReceipt(effect, before, before)).toBeNull();
    const after = buyUpgrade(before, effect.upgradeId);
    expect(actionReceipt(effect, before, after)).toContain("14 trust · balance 46 trust");
    expect(actionReceipt(effect, before, after)).toContain("`dashboard`");
    expect(actionReceipt(effect, before, after)).toContain("current view stays open");
  });
});
