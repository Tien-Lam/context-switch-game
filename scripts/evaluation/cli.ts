import { loadApi } from "./api";
import { baselineConfigs, runReplay, type ReplayConfig } from "./runner";
import { cacheCounterfactuals, cacheFixture } from "./fixtures";
import { compactionExperiment } from "./compaction";
import { createComparisonPair } from "./compare";
import { verifyBaseline } from "./baseline";

const argv = Bun.argv.slice(2);
const command = argv[0] ?? "suite";
const option = (name: string) => { const index = argv.indexOf(`--${name}`); return index < 0 ? undefined : argv[index + 1]; };
const api = await loadApi(option("engine-root"));
const buildId = option("build") ?? "working-tree (unversioned)";
const readJson = async (path: string) => await Bun.file(path).json();
let output: unknown;
if (command === "suite") {
  const configs = option("config") ? await readJson(option("config")!) as ReplayConfig[] : [...baselineConfigs];
  if (argv.includes("--legacy-low")) configs.push({ id: "planned/low", policy: "planned", reasoning: "low" });
  const replays = configs.map(config => runReplay(config, { api, buildId }));
  if (argv.includes("--verify-baseline")) verifyBaseline(replays);
  output = replays;
} else if (command === "replay") {
  const config = option("config") ? await readJson(option("config")!) as ReplayConfig : baselineConfigs.find(value => value.id === (option("policy") ?? "revise"));
  if (!config) throw new Error("Unknown --policy; provide a documented suite id or --config path.");
  const initialState = option("state") ? await readJson(option("state")!) : undefined;
  output = runReplay(config, { api, buildId, initialState });
} else if (command === "state") {
  const phase = option("phase") ?? "review";
  if (phase !== "active" && phase !== "review") throw new Error("state --phase must be active or review.");
  const context = Number(option("context") ?? 100), quota = Number(option("quota") ?? 60);
  if (!Number.isFinite(context) || context < 0 || context > 100 || !Number.isFinite(quota) || quota < 0 || quota > 60) throw new Error("state context must be 0–100 and quota 0–60.");
  output = cacheFixture({ phase, context, quota, helperOccupied: argv.includes("--helper-occupied") }, api);
} else if (command === "fixtures") output = cacheCounterfactuals(api);
else if (command === "compaction") output = compactionExperiment(api);
else if (command === "pair") {
  if (!option("left") || !option("right") || !option("mapping-out")) throw new Error("pair requires --left, --right and separate --mapping-out.");
  if (option("out") === option("mapping-out")) throw new Error("Critic input and private mapping must use different output paths.");
  const pair = createComparisonPair(await readJson(option("left")!), await readJson(option("right")!), option("order") === "reverse" ? "reverse" : "forward", argv.includes("--diagnostic-control"));
  await Bun.write(option("mapping-out")!, JSON.stringify(pair.privateMapping, null, 2) + "\n");
  output = pair.criticInput;
} else throw new Error("Commands: suite, replay, state, fixtures, compaction, pair.");
const json = JSON.stringify(output, null, 2) + "\n";
if (option("out")) await Bun.write(option("out")!, json);
else process.stdout.write(json);
