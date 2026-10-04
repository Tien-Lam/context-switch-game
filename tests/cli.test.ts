import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/initialState";
import { advanceGame, buyUpgrade, reviewTicket, startTicket } from "../src/game/engine";
import { agentSuggestions, commandSuggestions, evaluateAgentMessage, evaluateCommand } from "../src/ui/cli";

describe("operator CLI", () => {
  function cacheReview(modelId = "ballad") {
    const initial = createInitialState();
    initial.completedTicketIds = ["deployment-banner"];
    initial.unlockedSessions = 2;
    return structuredClone(advanceGame(startTicket(initial, 0, "cache-summary", modelId), 10));
  }

  it("preserves prior bypass scope on non-specific natural revisions and suggests approval once checked", () => {
    const state = cacheReview();
    const checked = advanceGame(reviewTicket(state, state.reviews[0].id, "revise", { remedy: "bypass" }), 2);
    for (const request of ["Please revise the cache", "Please revise this cache review", "Revise PERF-204 with the same cache scope"]) {
      expect(evaluateAgentMessage(request, checked).effect).toEqual({ type: "review", reviewId: checked.reviews[0].id, decision: "revise" });
    }
    expect(agentSuggestions("anthill", checked)).toContain("Approve PERF-204");
    expect(commandSuggestions("anthill", checked)).toContain("reviews approve PERF-204");
  });

  it("never uses a prohibited workflow through a provider default", () => {
    for (const modelId of ["ballad", "spark"]) {
      const state = cacheReview(modelId);
      for (const request of ["Restore invalidation but not probes", "Restore invalidation without probes", "Restore invalidation with no probes", "Restore invalidation rather than probes", "Restore invalidation but do not use probes", "Restore invalidation never use probes", "Restore invalidation avoid probes"]) {
        const effect = evaluateAgentMessage(request, state).effect;
        if (effect) expect(effect).toMatchObject({ type: "review", options: { remedy: "restore", workflow: "ledger" } });
      }
      expect(evaluateAgentMessage("Use probes, not probes", state).effect).toBeUndefined();
      for (const request of ["Bypass the cache but not bypass the cache", "Restore invalidation but not restore invalidation", "Use ledger but not restore invalidation"]) expect(evaluateAgentMessage(request, state).effect).toBeUndefined();
      expect(evaluateAgentMessage("Restore invalidation with no ledger", state).effect).toMatchObject({ options: { remedy: "restore", workflow: "probes" } });
    }
  });

  it("accepts cache remedies and workflow overrides through exact terminal commands", () => {
    const state = cacheReview();
    for (const [command, options] of [
      ["reviews revise PERF-204 --remedy restore --workflow ledger", { remedy: "restore", workflow: "ledger" }],
      ["reviews revise PERF-204 --remedy=restore --workflow=probes", { remedy: "restore", workflow: "probes" }],
      ["reviews revise PERF-204 --workflow probes", { remedy: "restore", workflow: "probes" }],
      ["reviews revise PERF-204 --remedy bypass", { remedy: "bypass" }],
    ] as const) {
      expect(evaluateCommand(command, state, undefined, true).effect, command).toEqual({ type: "review", reviewId: state.reviews[0].id, decision: "revise", options });
    }
    const bypass = evaluateCommand("reviews revise PERF-204 --remedy bypass", state, undefined, true).messages[0].text;
    expect(bypass).toContain("1.5s work");
    expect(bypass).toContain("dashboard speed deferred");
    expect(bypass).toContain("7-trust reward, optional PERF-205");
  });

  it("accepts natural cache scope and workflow requests without exact syntax", () => {
    const state = cacheReview();
    for (const [request, options] of [
      ["Restore invalidation for PERF-204", { remedy: "restore" }],
      ["Could you restore invalidation for PERF-204?", { remedy: "restore" }],
      ["Bypass the cache for now", { remedy: "bypass" }],
      ["Please remove cache for now", { remedy: "bypass" }],
      ["Use isolated probes for PERF-204", { remedy: "restore", workflow: "probes" }],
      ["Use a contract ledger", { remedy: "restore", workflow: "ledger" }],
      ["Please revise PERF-204 with isolated probes", { remedy: "restore", workflow: "probes" }],
    ] as const) {
      expect(evaluateAgentMessage(request, state).effect, request).toEqual({ type: "review", reviewId: state.reviews[0].id, decision: "revise", options });
    }
    expect(evaluateCommand("Restore invalidation for PERF-204", state, undefined, true).messages[0].kind).toBe("error");
  });

  it("keeps cache inquiries and negated choices read-only", () => {
    const state = cacheReview();
    const before = JSON.stringify(state);
    for (const request of ["Should we bypass the cache?", "What would this take?", "How much does a contract ledger cost?", "Tell me about isolated probes", "Don't bypass the cache", "Please do not restore invalidation", "Avoid using probes for PERF-204", "I do not want you to remove the cache"]) {
      expect(evaluateAgentMessage(request, state).effect, request).toBeUndefined();
    }
    expect(evaluateAgentMessage("What would this take?", state).messages[0].text).toContain("scope choices");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("uses the chosen cache remedy or workflow rather than its rejected alternative", () => {
    const state = cacheReview();
    for (const [request, options] of [
      ["Restore invalidation rather than bypass the cache", { remedy: "restore" }],
      ["Bypass the cache instead of restoring invalidation", { remedy: "bypass" }],
      ["Use ledger, not probes", { remedy: "restore", workflow: "ledger" }],
      ["Use the ledger rather than probes", { remedy: "restore", workflow: "ledger" }],
      ["Use probes instead of the ledger", { remedy: "restore", workflow: "probes" }],
      ["Please revise PERF-204 using ledger, not probes", { remedy: "restore", workflow: "ledger" }],
      ["Use ledger; do not use probes", { remedy: "restore", workflow: "ledger" }],
    ] as const) {
      expect(evaluateAgentMessage(request, state).effect, request).toMatchObject({ type: "review", decision: "revise", options });
    }
  });

  it("leaves uncertain cache decisions and explanatory questions unchanged", () => {
    const state = cacheReview();
    const before = JSON.stringify(state);
    for (const request of ["Restore invalidation or bypass the cache", "Use probes or ledger", "Please revise PERF-204 using probes or ledger", "Bypass the cache? I am only asking what this costs", "Restore invalidation? No, just explain it", "Bypass the cache?", "Use ledger?", "Please explain whether we should restore invalidation"]) {
      expect(evaluateAgentMessage(request, state).effect, request).toBeUndefined();
    }
    expect(evaluateAgentMessage("Restore invalidation or bypass the cache", state).messages[0].text).toContain("No cache revision started");
    expect(evaluateAgentMessage("Bypass the cache? I am only asking what this costs", state).messages[0].text).toContain("scope choices");
    expect(JSON.stringify(state)).toBe(before);
    const checked = advanceGame(reviewTicket(state, state.reviews[0].id, "revise", { remedy: "bypass" }), 2);
    const bypassed = reviewTicket(checked, checked.reviews[0].id, "approve");
    expect(evaluateAgentMessage("Restore invalidation? No, just explain it", bypassed).effect).toBeUndefined();
  });

  it("rejects invalid, conflicting and unrelated cache revision flags", () => {
    const state = cacheReview();
    for (const command of ["reviews revise PERF-204 --remedy magic", "reviews revise PERF-204 --workflow fast", "reviews revise PERF-204 --remedy bypass --workflow ledger", "reviews revise PERF-204 --remedy", "reviews revise PERF-204 --workflow", "reviews revise PERF-204 --remedy=", "reviews revise PERF-204 --remdy restore", "reviews revise PERF-204 --remedy restore --remedy bypass", "reviews approve PERF-204 --remedy bypass"]) {
      const result = evaluateCommand(command, state, undefined, true);
      expect(result.effect, command).toBeUndefined();
      expect(result.messages[0].kind, command).toBe("error");
    }
    const normal = advanceGame(startTicket(createInitialState(), 0, "deployment-banner", "ballad"), 5);
    expect(evaluateCommand("reviews revise APP-101 --remedy bypass", normal, undefined, true).effect).toBeUndefined();
    expect(evaluateAgentMessage("Restore invalidation for APP-101", normal).effect).toBeUndefined();
    expect(evaluateCommand("reviews revise APP-101", normal, undefined, true).effect).toEqual({ type: "review", reviewId: normal.reviews[0].id, decision: "revise" });
  });

  it("describes provider workflow habits and their current resource implications", () => {
    const anthill = cacheReview();
    expect(evaluateCommand("reviews revise PERF-204", anthill).messages[0].text).toContain("restore / ledger · 5s work · 3 upfront quota");
    const forge = cacheReview("spark");
    const context = { providerId: "openmind", modelId: "spark" };
    expect(evaluateCommand("reviews revise PERF-204", forge, context).messages[0].text).toContain("restore / probes · 3s work · 0 upfront quota · supporting session 2");
    forge.sessions[1].status = "working";
    forge.sessions[1].ticketId = "telemetry-toggle";
    forge.sessions[1].modelId = "ballad";
    expect(evaluateCommand("reviews revise PERF-204", forge, context).messages[0].text).toContain("restore / ledger");
    expect(evaluateCommand("reviews revise PERF-204", forge, context).messages[0].text).toContain("No free supporting slot");
    expect(evaluateCommand("reviews revise PERF-204 --workflow probes", forge, context).effect).toBeUndefined();
    anthill.providerQuota.anthill = 2;
    expect(evaluateCommand("reviews revise PERF-204 --workflow ledger", anthill).effect).toBeUndefined();
  });

  it("shows the actual cache remedy evidence after the revision finishes", () => {
    for (const remedy of ["restore", "bypass"] as const) {
      const state = cacheReview();
      const ready = advanceGame(reviewTicket(state, state.reviews[0].id, "revise", { remedy }), 10);
      const text = evaluateCommand("reviews read PERF-204", ready).messages[0].text;
      expect(text).toContain("PASS:");
      if (remedy === "bypass") {
        expect(text.toLowerCase()).toContain("direct");
        expect(text.toLowerCase()).toContain("slower");
        expect(text).not.toContain("Every committed customer mutation invalidates");
      } else expect(text.toLowerCase()).toContain("ledger");
    }
  });

  it("offers scoped remedy suggestions at the cache review without approving for the player", () => {
    const state = cacheReview();
    expect(agentSuggestions("anthill", state)).toContain("Restore invalidation for PERF-204");
    expect(agentSuggestions("anthill", state)).toContain("Bypass the cache for now");
    expect(commandSuggestions("anthill", state)).toContain("reviews revise PERF-204 --remedy bypass");
    expect(commandSuggestions("anthill", state)).not.toContain("reviews approve PERF-204");
    expect(evaluateCommand("reviews read PERF-204", state).messages[0].text).toContain("I prefer a write-boundary ledger");
    expect(evaluateCommand("reviews read PERF-204", cacheReview("spark")).messages[0].text).toContain("I prefer isolated probes");
  });

  it("reads the selected review from its suggested changed prompt with multiple pending reviews", () => {
    const state = advanceGame(startTicket(cacheReview(), 1, "telemetry-toggle", "ballad"), 10);
    expect(state.reviews).toHaveLength(2);
    expect(agentSuggestions("anthill", state)).toContain("What changed in PERF-204?");
    for (const key of ["PERF-204", "APP-118"]) {
      const result = evaluateAgentMessage(`What changed in ${key}?`, state);
      expect(result.effect).toBeUndefined();
      expect(result.messages[0].text).toContain(`REVIEW ${key}`);
    }
  });

  it("names supporting sessions and refuses to assign or compact their probe work", () => {
    const state = cacheReview();
    const supporting = reviewTicket(state, state.reviews[0].id, "revise", { remedy: "restore", workflow: "probes" });
    expect(evaluateCommand("agents list", supporting).messages[0].text).toContain("isolated probes for session 1");
    expect(evaluateCommand("agents run APP-118 --session 2", supporting).effect).toBeUndefined();
    expect(evaluateCommand("/compact 2", supporting).effect).toBeUndefined();
    expect(evaluateCommand("agents compact 2", supporting).effect).toBeUndefined();
    expect(evaluateCommand("agents list", advanceGame(supporting, 1.5)).messages[0].text).toContain("isolated probes for session 1 · 50%");
  });

  it("marks optional tickets in terminal lists and details", () => {
    const state = cacheReview();
    const checked = advanceGame(reviewTicket(state, state.reviews[0].id, "revise", { remedy: "bypass" }), 2);
    const bypassed = reviewTicket(checked, checked.reviews[0].id, "approve");
    expect(evaluateCommand("tickets list", bypassed).messages[0].text).toContain("Restore the dashboard speedup [optional]");
    expect(evaluateCommand("tickets read PERF-205", bypassed).messages[0].text).toContain("optional follow-up; not required to finish");
    expect(evaluateCommand("tickets read APP-101", bypassed).messages[0].text).not.toContain("release     optional");
  });

  it("explains paid planning and reasoning at selection and assignment", () => {
    const initial = createInitialState();
    expect(evaluateCommand("/permissions plan", initial).messages[0].text).toContain("5 upfront provider quota");
    const context = { providerId: "openmind", modelId: "spark", permissionMode: "plan" as const, reasoning: "high" as const };
    expect(evaluateCommand("/reasoning high", initial, context).messages[0].text).toContain("4 extra upfront quota");
    const assigned = evaluateAgentMessage("Please take the next ticket", initial, context).messages[0].text;
    expect(assigned).toContain("5 upfront quota");
    expect(assigned).toContain("4 extra upfront quota");
  });

  it("mentions branch contention only when the assignment will overlap without isolation", () => {
    const initial = createInitialState();
    initial.completedTicketIds = ["deployment-banner"];
    initial.unlockedSessions = 2;
    const running = startTicket(initial, 0, "telemetry-toggle", "ballad");
    expect(evaluateCommand("agents run PERF-204", running).messages[0].text).toContain("contention adds review risk");
    const isolated = structuredClone(running);
    isolated.purchasedUpgradeIds.push("worktree-isolation");
    expect(evaluateCommand("agents run PERF-204", isolated).messages[0].text).not.toContain("contention");
    expect(evaluateCommand("agents run APP-101", createInitialState()).messages[0].text).not.toContain("contention");
  });

  it("gives an actionable recovery path for sandbox-file requests in Agent mode", () => {
    for (const request of ["cat playtest.txt", "Please read playtest.txt", "ls"]) {
      const result = evaluateAgentMessage(request, createInitialState());
      expect(result.effect).toBeUndefined();
      expect(result.messages[0].text).toContain("switch surfaces");
      expect(result.messages[0].text).toContain("in your own words");
    }
  });
  it("identifies the owning slot when another terminal requests a revision", () => {
    const state = advanceGame(startTicket(createInitialState(), 0, "deployment-banner", "ballad"), 5);
    const context = { providerId: "openmind", modelId: "spark", sessionId: null };
    expect(evaluateCommand("reviews revise APP-101", state, context, true).messages[0].text).toContain("revision runs in session 1");
    expect(evaluateAgentMessage("Please revise APP-101", state, context).messages[0].text).toContain("Revision runs in session 1");
  });
  it("shows the actual terminal directory in both provider status tools", () => {
    for (const providerId of ["anthill", "openmind"]) {
      const result = evaluateCommand("/status", createInitialState(), { providerId, cwd: "~/delivery/notes" });
      expect(result.messages[0].text).toContain("~/delivery/notes");
      expect(result.messages[0].text).not.toMatch(/(?:directory|project)\s+~\/delivery\n/);
    }
  });
  it("reads authored tickets through a terminal tool", () => {
    const result = evaluateCommand("tickets read APP-101", createInitialState());
    expect(result.messages[0].text).toContain("Rename the deployment banner");
    expect(result.messages[0].text).toContain("ui/Banner.tsx");
  });

  it("explains review decisions with evidence and concrete tradeoffs", () => {
    const state = createInitialState();
    state.reviews.push({ id: "review-1", ticketId: "telemetry-toggle", sessionId: 0, risk: 0.34, createdAt: 4 });
    const result = evaluateCommand("reviews read APP-118", state);

    expect(result.messages[0].text).toContain("review risk score 34/100");
    expect(result.messages[0].text).toContain("risk source");
    expect(result.messages[0].text).toContain("no migration fixture was added");
    expect(result.messages[0].text).toContain("approve will ship the warning as a known defect");
    expect(result.messages[0].text).toContain("resolve finding; another agent pass");
    expect(result.messages[0].text).toContain("-3 trust");
  });

  it("shows accumulated consequences before the finale decision", () => {
    const state = createInitialState();
    state.flags.privacyDefaultedOn = true;
    state.flags.raceAccepted = true;
    state.sessions[0] = { ...state.sessions[0], status: "awaiting-review", ticketId: "investor-demo", modelId: "ballad", progress: 1 };
    state.reviews.push({ id: "final-review", ticketId: "investor-demo", sessionId: 0, risk: 0.5, createdAt: 40 });

    const result = evaluateCommand("reviews read SHIP-1", state);

    expect(result.messages[0].text).toContain("privacy open · cache clean");
    expect(result.messages[0].text).toContain("runtime clean · exports racy");
    expect(result.messages[0].text).toContain("health 82 · debt 4 · trust 30");
  });

  it("shows only concrete provider limits in usage output", () => {
    const result = evaluateCommand("/usage", createInitialState());
    expect(result.messages[0].text).toContain("Anthill Code");
    expect(result.messages[0].text.toLowerCase()).not.toContain("attention");
  });

  it("turns an agent command into a deterministic game action", () => {
    const result = evaluateCommand("agents run APP-101 --model couplet --brief", createInitialState());
    expect(result.messages[0].text).toContain("review ~3s");
    expect(result.effect).toEqual({
      type: "assign",
      sessionId: 0,
      ticketId: "deployment-banner",
      modelId: "couplet",
      improveBrief: true,
      reasoning: "medium",
    });
  });

  it("keeps models bound to their provider CLI", () => {
    const state = createInitialState();
    const forge = { providerId: "openmind", modelId: "spark", permissionMode: "workspace-write" as const, reasoning: "medium" as const };
    expect(evaluateCommand("/model spark", state, forge).effect).toEqual({ type: "model", modelId: "spark" });
    expect(evaluateCommand("/model ballad", state, forge).messages[0].kind).toBe("error");
  });

  it("uses Forge reasoning and plan permission in ticket assignments", () => {
    const result = evaluateCommand("work on APP-101", createInitialState(), {
      providerId: "openmind", modelId: "spark", permissionMode: "plan", reasoning: "high",
    });
    expect(result.effect).toMatchObject({ type: "assign", improveBrief: true, reasoning: "high" });
  });

  it("accepts natural-language work prompts in each provider session", () => {
    const state = createInitialState();
    const result = evaluateCommand("please implement APP-101", state, { providerId: "openmind", modelId: "spark" });
    expect(result.effect).toEqual({
      type: "assign",
      sessionId: 0,
      ticketId: "deployment-banner",
      modelId: "spark",
      improveBrief: false,
      reasoning: "medium",
    });
  });

  it("lets an agent take work without an exact ticket key or command form", () => {
    const state = createInitialState();
    for (const prompt of ["Could you take care of the deployment banner?", "Please handle rename the deployment banner", "Please rename the deployment banner", "Let's do the next ticket", "Ship APP-101"]) {
      expect(evaluateAgentMessage(prompt, state).effect, prompt).toMatchObject({ type: "assign", ticketId: "deployment-banner" });
    }
    expect(evaluateAgentMessage("What should I work on next?", state).effect).toBeUndefined();
    expect(evaluateAgentMessage("What should I work on next?", state).messages[0].text).toContain("APP-101");
    expect(evaluateAgentMessage("Tell me about the deployment banner", state).messages[0].text).toContain("Change the staging banner copy");
    state.completedTicketIds.push("deployment-banner");
    expect(evaluateAgentMessage("Could you cache the dashboard summary?", state).effect).toMatchObject({ type: "assign", ticketId: "cache-summary" });
  });

  it("keeps exact syntax in the terminal while accepting natural requests in agent chat", () => {
    const state = createInitialState();
    expect(evaluateCommand("Could you handle the banner?", state, undefined, true).messages[0].kind).toBe("error");
    expect(evaluateCommand("agents run APP-101", state, undefined, true).effect).toMatchObject({ type: "assign", ticketId: "deployment-banner" });
    expect(evaluateAgentMessage("Could you handle the banner?", state).effect).toMatchObject({ type: "assign", ticketId: "deployment-banner" });
    expect(evaluateAgentMessage("tickets list", state).messages[0].text).toContain("APP-101");
    expect(evaluateAgentMessage("/help", state).messages[0].text).toContain("ordinary language");
    expect(evaluateCommand("help", state, undefined, true).messages[0].text).toContain("agents run <KEY>");
    expect(agentSuggestions("anthill", state)).toContain("What should I work on next?");
  });

  it("answers review questions and understands natural review decisions", () => {
    const state = createInitialState();
    state.sessions[0] = { ...state.sessions[0], status: "awaiting-review", ticketId: "deployment-banner", modelId: "ballad" };
    state.reviews.push({ id: "review-1", ticketId: "deployment-banner", sessionId: 0, risk: 0.12, createdAt: 4 });
    const inquiry = evaluateAgentMessage("Is this safe to approve?", state);
    expect(inquiry.effect).toBeUndefined();
    expect(inquiry.messages[0].text).toContain("REVIEW APP-101");
    expect(evaluateAgentMessage("Please revise this review", state).effect).toEqual({ type: "review", reviewId: "review-1", decision: "revise" });
    expect(evaluateAgentMessage("Approve it", state).effect).toEqual({ type: "review", reviewId: "review-1", decision: "approve" });
    expect(evaluateAgentMessage("Ship APP-101", state).effect).toEqual({ type: "review", reviewId: "review-1", decision: "approve" });
  });

  it("accepts a natural incident containment request", () => {
    const state = createInitialState();
    state.incidentResponse = "active";
    expect(evaluateAgentMessage("Please rate limit the gateway", state).effect).toEqual({ type: "mitigate", action: "rate-limit" });
    expect(evaluateAgentMessage("How can we contain this incident?", state).effect).toBeUndefined();
  });

  it("suggests the next ready ticket instead of a shipped opening ticket", () => {
    const state = createInitialState();
    state.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary", "runtime-upgrade", "webhook-backoff", "parallel-reports", "quota-display", "stale-customer-data", "investor-demo"];
    const result = evaluateCommand("can you help me?", state);

    expect(result.messages[0].text).toContain("next ready ticket is QA-401");
    expect(result.messages[0].text).not.toContain("APP-101");
  });

  it("does not assign work when natural-language intent is negated", () => {
    const state = createInitialState();
    for (const prompt of ["don't work on APP-101", "don’t start APP-101", "do not implement APP-101", "never assign APP-101", "I do not want you to work on APP-101", "I do not want you working on APP-101", "Please avoid working on APP-101", "Do not do work on APP-101", "I would rather not work on APP-101", "Please hold off on APP-101", "Do not begin work on APP-101", "Please refrain from working on APP-101", "Delay work on APP-101", "Wait to start APP-101", "I cannot work on APP-101 yet", "I am not ready to start APP-101", "We should postpone work on APP-101"]) {
      const result = evaluateCommand(prompt, state);
      expect(result.effect).toBeUndefined();
      expect(result.messages[0].text, prompt).toContain("No work started");
    }
    const ambiguous = evaluateCommand("APP-101 looks risky", state);
    expect(ambiguous.effect).toBeUndefined();
    expect(ambiguous.messages[0].text).toContain("APP-101 · Rename the deployment banner");
  });

  it("shows baseline and projected risk when listing tickets", () => {
    const result = evaluateCommand("tickets list", createInitialState());
    expect(result.messages[0].text).toContain("BASE/EST");
    expect(result.messages[0].text).toContain("Risk is ticket baseline / estimate for the selected model");
    expect(evaluateCommand("tickets read APP-101", createInitialState()).messages[0].text).toContain("% base ·");
  });

  it("projects ticket risk using the selected reasoning level and names its assumptions", () => {
    const state = createInitialState();
    const low = evaluateCommand("tickets read APP-101", state, { providerId: "openmind", modelId: "spark", reasoning: "low" }).messages[0].text;
    const high = evaluateCommand("tickets read APP-101", state, { providerId: "openmind", modelId: "spark", reasoning: "high" }).messages[0].text;

    expect(low).toContain("30-30% estimated with selected Spark and low reasoning");
    expect(high).toContain("14-14% estimated with selected Spark and high reasoning");
  });

  it("includes purchased risk-reduction upgrades in review evidence", () => {
    const state = createInitialState();
    state.purchasedUpgradeIds.push("repo-playbook", "fast-checks");
    const assigned = evaluateCommand("work on APP-101", state);
    const effect = assigned.effect;
    if (!effect || effect.type !== "assign") throw new Error("expected ticket assignment");
    let running = startTicket(state, effect.sessionId, effect.ticketId, effect.modelId, effect.improveBrief, effect.reasoning);
    running = advanceGame(running, 5);
    const evidence = evaluateCommand("reviews read APP-101", running).messages[0].text;

    expect(evidence).toContain("repository playbook −7");
    expect(evidence).toContain("fast checks −8");
  });

  it("keeps review risk explanations fixed to the moment of scoring", () => {
    const state = createInitialState();
    state.completedTicketIds = ["deployment-banner", "telemetry-toggle"];
    const assigned = evaluateCommand("work on PLAT-77", state);
    const effect = assigned.effect;
    if (!effect || effect.type !== "assign") throw new Error("expected ticket assignment");
    let running = startTicket(state, effect.sessionId, effect.ticketId, "ballad");
    running = advanceGame(running, 15);
    const riskBefore = running.reviews[0].risk;
    const before = evaluateCommand("reviews read PLAT-77", running).messages[0].text;
    running = buyUpgrade(running, "fast-checks");
    const after = evaluateCommand("reviews read PLAT-77", running).messages[0].text;

    expect(before).not.toContain("fast checks −8");
    expect(after).not.toContain("fast checks −8");
    expect(after).toContain(`review risk score ${Math.round(riskBefore * 100)}/100`);
  });

  it("never starts work from natural-language review or inspection intent", () => {
    const state = createInitialState();
    for (const prompt of ["please review APP-101", "inspect APP-101 before we start", "show me the diff for APP-101"]) {
      const result = evaluateCommand(prompt, state);
      expect(result.effect).toBeUndefined();
      expect(result.messages[0].text).toContain("no pending review");
    }
  });

  it("keeps review-ready work visible in status and context output", () => {
    const state = createInitialState();
    state.sessions[0] = {
      ...state.sessions[0],
      status: "awaiting-review",
      ticketId: "deployment-banner",
      modelId: "ballad",
      progress: 1,
      context: 73,
    };
    state.reviews.push({ id: "review-1", ticketId: "deployment-banner", sessionId: 0, risk: 0.12, createdAt: 4 });

    const status = evaluateCommand("/status", state).messages[0].text;
    expect(status).toContain("current task       APP-101 · 100%");
    expect(status).toContain("task state         awaiting-review");
    expect(status).toContain("trust / health");
    expect(status).toContain("repository debt");
    const context = evaluateCommand("/context", state).messages[0].text;
    expect(context).toContain("free              73%");
    expect(context).toContain("awaits review");
  });

  it("formats event timestamps from elapsed seconds", () => {
    const state = createInitialState();
    state.events.unshift({ id: "later", at: 125, tone: "info", title: "Two minutes in", message: "Still Monday." });
    expect(evaluateCommand("events 1", state).messages[0].text).toContain("09:02");
  });

  it("offers import and explains model and upgrade tradeoffs", () => {
    const state = createInitialState();
    expect(evaluateCommand("save import", state).effect).toEqual({ type: "import" });
    const models = evaluateCommand("/model", state).messages[0].text;
    expect(models).toContain("QUOTA/S");
    expect(models).toContain("RISK");
    expect(models).toContain("Fast and frugal");
    const upgrades = evaluateCommand("upgrades list", state).messages[0].text;
    expect(upgrades).toContain("Clear conventions reduce ambiguity in every brief.");
  });

  it("changes command suggestions with available work and reviews", () => {
    const state = createInitialState();
    expect(commandSuggestions("anthill", state)).toContain("agents run APP-101");
    state.sessions[0] = { ...state.sessions[0], status: "awaiting-review", ticketId: "deployment-banner", modelId: "ballad", progress: 1 };
    state.reviews.push({ id: "review-1", ticketId: "deployment-banner", sessionId: 0, risk: 0.12, createdAt: 4 });
    expect(commandSuggestions("anthill", state)).toContain("reviews read APP-101");
    expect(commandSuggestions("anthill", state)).not.toContain("agents run APP-101");
    expect(commandSuggestions("anthill", state)).not.toContain("reviews approve APP-101");
    state.sessions[1] = { ...state.sessions[1], status: "awaiting-review", ticketId: "cache-summary", modelId: "spark", progress: 1 };
    state.reviews.push({ id: "review-2", ticketId: "cache-summary", sessionId: 1, risk: 0.4, createdAt: 4 });
    expect(commandSuggestions("openmind", state)).toContain("reviews read PERF-204");
    expect(commandSuggestions("openmind", state)).not.toContain("reviews read APP-101");
  });

  it("unlocks multiplexer abilities through progression", () => {
    const initial = evaluateCommand("tab new", createInitialState());
    expect(initial.messages[0].kind).toBe("error");

    const progressed = createInitialState();
    progressed.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary"];
    expect(evaluateCommand("tab new ops", progressed).effect?.type).toBe("tab-new");
    expect(evaluateCommand("watch agents", progressed).effect).toEqual({ type: "open-view", mode: "agents" });
  });

  it("keeps the graphical dashboard behind its upgrade", () => {
    const state = createInitialState();
    state.completedTicketIds = ["deployment-banner", "telemetry-toggle", "cache-summary"];
    expect(evaluateCommand("dashboard", state).messages[0].kind).toBe("error");
    state.purchasedUpgradeIds.push("terminal-dashboard");
    expect(evaluateCommand("dashboard", state).effect).toEqual({ type: "open-view", mode: "dashboard" });
  });
});
