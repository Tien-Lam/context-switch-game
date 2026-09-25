import { ticketById } from "../content";
import { visibleTickets } from "../game/selectors";
import type { GameState } from "../game/types";

export const SHELL_HOME = "/home/dev";
export const SHELL_WORKSPACE = `${SHELL_HOME}/delivery`;

type Entry = { kind: "dir" } | { kind: "file"; content: string };

export interface VirtualFileSystem {
  entries: Record<string, Entry>;
  deletedSeeds: string[];
}

export interface ShellResult {
  handled: boolean;
  text?: string;
  error?: string;
  cwd: string;
  fs: VirtualFileSystem;
}

const builtins = new Set([
  "pwd", "ls", "cd", "cat", "less", "more", "tree", "find", "grep", "rg", "head", "tail", "wc", "sort", "uniq",
  "mkdir", "rmdir", "touch", "cp", "mv", "rm", "echo", "printf", "history", "whoami", "hostname", "date", "env", "which", "git", "help", "man",
]);
const PIPE = "\u0000|";
const REDIRECT = "\u0000>";
const APPEND = "\u0000>>";

const directory = (): Entry => ({ kind: "dir" });
const file = (content: string): Entry => ({ kind: "file", content });

export function resolveShellPath(cwd: string, input = "."): string {
  const expanded = input === "~" ? SHELL_HOME : input.startsWith("~/") ? `${SHELL_HOME}/${input.slice(2)}` : input;
  const parts = (expanded.startsWith("/") ? expanded : `${cwd}/${expanded}`).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return `/${stack.join("/")}`;
}

export function displayShellPath(path: string) {
  return path === SHELL_HOME ? "~" : path.startsWith(`${SHELL_HOME}/`) ? `~${path.slice(SHELL_HOME.length)}` : path;
}

const parentPath = (path: string) => path === "/" ? "/" : path.slice(0, path.lastIndexOf("/")) || "/";
const baseName = (path: string) => path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
const cloneFs = (fs: VirtualFileSystem): VirtualFileSystem => ({ entries: { ...fs.entries }, deletedSeeds: [...fs.deletedSeeds] });

function putSeed(fs: VirtualFileSystem, path: string, entry: Entry) {
  if (!fs.entries[path] && !fs.deletedSeeds.includes(path)) fs.entries[path] = entry;
}

function ensureSeedParents(fs: VirtualFileSystem, path: string) {
  let parent = parentPath(path);
  while (parent !== "/") {
    putSeed(fs, parent, directory());
    parent = parentPath(parent);
  }
  putSeed(fs, "/", directory());
}

export function createVirtualFileSystem(): VirtualFileSystem {
  const fs: VirtualFileSystem = { entries: {}, deletedSeeds: [] };
  for (const path of ["/", "/home", SHELL_HOME, SHELL_WORKSPACE, `${SHELL_WORKSPACE}/notes`, `${SHELL_WORKSPACE}/tickets`]) fs.entries[path] = directory();
  fs.entries[`${SHELL_WORKSPACE}/README.md`] = file("# Delivery\n\nA fictional repository for the Context Switch shift.\nUse `tickets list` for live ticket state and `reviews list` for review evidence.\nFiles in this terminal are a local sandbox: editing them does not complete scripted tickets.\n");
  fs.entries[`${SHELL_WORKSPACE}/package.json`] = file('{\n  "name": "delivery",\n  "private": true,\n  "scripts": { "test": "scripted-game-checks" }\n}\n');
  return fs;
}

export function syncVirtualFileSystem(previous: VirtualFileSystem, game: GameState): VirtualFileSystem {
  const fs = cloneFs(previous);
  for (const ticket of visibleTickets(game)) {
    const ticketPath = `${SHELL_WORKSPACE}/tickets/${ticket.key}.md`;
    if (fs.entries[parentPath(ticketPath)]?.kind === "dir") putSeed(fs, ticketPath, file(`# ${ticket.key} · ${ticket.title}\n\n${ticket.brief}\n\n${ticket.summary}\n\nFiles: ${ticket.files.join(", ")}\n`));
    for (const relative of ticket.files) {
      const path = resolveShellPath(SHELL_WORKSPACE, relative);
      ensureSeedParents(fs, path);
      if (fs.entries[parentPath(path)]?.kind === "dir") putSeed(fs, path, file(`// ${ticket.key}: ${ticket.title}\n// ${ticket.brief}\n// Fictional source snapshot. Terminal edits are sandbox-only.\n`));
    }
  }
  return fs;
}

function tokenize(raw: string): { tokens: string[]; error?: string } {
  const tokens: string[] = [];
  let buffer = "";
  let quote: "'" | '"' | null = null;
  let started = false;
  const flush = () => { if (started) tokens.push(buffer); buffer = ""; started = false; };
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === "\\" && quote !== "'") {
      if (index + 1 >= raw.length) return { tokens: [], error: "unfinished escape" };
      buffer += raw[index + 1];
      index += 1;
      started = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else buffer += character;
      started = true;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; started = true; continue; }
    if (/\s/.test(character)) { flush(); continue; }
    if (character === "|" || character === ">") {
      flush();
      if (character === ">" && raw[index + 1] === ">") { tokens.push(APPEND); index += 1; }
      else tokens.push(character === "|" ? PIPE : REDIRECT);
      continue;
    }
    if (character === ";" || character === "&" || character === "<") return { tokens: [], error: `operator ${character} is not supported in the simulated shell` };
    buffer += character;
    started = true;
  }
  if (quote) return { tokens: [], error: "unclosed quote" };
  flush();
  return { tokens };
}

function children(fs: VirtualFileSystem, path: string): string[] {
  return Object.keys(fs.entries).filter((candidate) => candidate !== path && parentPath(candidate) === path).sort((a, b) => baseName(a).localeCompare(baseName(b)));
}

function readFile(fs: VirtualFileSystem, path: string): string | undefined {
  const entry = fs.entries[path];
  return entry?.kind === "file" ? entry.content : undefined;
}

function writeFile(fs: VirtualFileSystem, path: string, content: string): string | undefined {
  const parent = fs.entries[parentPath(path)];
  if (parent?.kind !== "dir") return `directory not found: ${displayShellPath(parentPath(path))}`;
  if (fs.entries[path]?.kind === "dir") return `is a directory: ${displayShellPath(path)}`;
  fs.entries[path] = file(content.slice(0, 50_000));
  fs.deletedSeeds = fs.deletedSeeds.filter((deleted) => deleted !== path);
  return undefined;
}

function removePath(fs: VirtualFileSystem, path: string) {
  for (const candidate of Object.keys(fs.entries).filter((entry) => entry === path || entry.startsWith(`${path}/`))) {
    delete fs.entries[candidate];
    if (!fs.deletedSeeds.includes(candidate)) fs.deletedSeeds.push(candidate);
  }
}

function copyPath(fs: VirtualFileSystem, source: string, destination: string, recursive: boolean): string | undefined {
  const entry = fs.entries[source];
  if (!entry) return `no such file or directory: ${displayShellPath(source)}`;
  if (entry.kind === "dir" && !recursive) return `omitting directory: ${displayShellPath(source)} (use -r)`;
  if (source === destination || destination.startsWith(`${source}/`)) return "source and destination overlap";
  if (fs.entries[parentPath(destination)]?.kind !== "dir") return `directory not found: ${displayShellPath(parentPath(destination))}`;
  const paths = Object.keys(fs.entries).filter((path) => path === source || path.startsWith(`${source}/`)).sort((a, b) => a.length - b.length);
  for (const path of paths) {
    const nextPath = `${destination}${path.slice(source.length)}`;
    const sourceEntry = fs.entries[path];
    fs.entries[nextPath] = sourceEntry.kind === "dir" ? directory() : file(sourceEntry.content);
    fs.deletedSeeds = fs.deletedSeeds.filter((deleted) => deleted !== nextPath);
  }
  return undefined;
}

const shellHelp = [
  "SIMULATED TERMINAL · ~/delivery",
  "  anthill | forge          launch a fictional coding agent",
  "  pwd | ls [-la] | cd      navigate the virtual workspace",
  "  cat | less | head | tail | grep | rg | find | tree | wc | sort | uniq",
  "  mkdir [-p] | touch | cp [-r] | mv | rm [-r] | rmdir",
  "  echo | printf            print text; > and >> write virtual files",
  "  cat FILE | grep text     pipe output between shell commands",
  "  git status|log|diff      inspect simulated game work",
  "  history | whoami | hostname | date | env | which",
  "  tickets | agents | reviews | upgrades | events | mux  game tools",
  "  clear                   clear this terminal's output",
  "",
  "This is a sandbox, not your computer or a real repository. File edits do not complete tickets.",
].join("\n");

function gitOutput(args: string[], game: GameState): string | { error: string } {
  const subcommand = args[0] ?? "status";
  if (subcommand === "status") {
    const active = game.sessions.filter((session) => session.status !== "idle" && session.ticketId).map((session) => `${ticketById.get(session.ticketId!)?.key} ${session.status}`);
    return `On branch main\nScripted work: ${active.length ? active.join(", ") : "none"}\nPending reviews: ${game.reviews.length}\nShipped: ${game.completedTicketIds.length}\n\nSandbox file edits do not change ticket or review state.`;
  }
  if (subcommand === "log") {
    const shipped = [...game.completedTicketIds].reverse().slice(0, 12);
    return shipped.length ? shipped.map((id, index) => `${String(shipped.length - index).padStart(3, "0")} ${ticketById.get(id)?.key ?? id} ${ticketById.get(id)?.title ?? "shipped"}`).join("\n") : "No scripted commits yet.";
  }
  if (subcommand === "diff") {
    if (!game.reviews.length) return "No pending scripted review diff. Sandbox file edits are separate.";
    return game.reviews.map((review) => {
      const ticket = ticketById.get(review.ticketId);
      return ticket ? `${ticket.key} · ${ticket.title}\n${ticket.files.map((path) => `  M ${path}`).join("\n")}\n${ticket.evidence.summary}\n${ticket.evidence.signal}` : "";
    }).filter(Boolean).join("\n\n");
  }
  if (subcommand === "branch") return "* main";
  return { error: `git ${subcommand} is not simulated; use git status|log|diff|branch` };
}

function runBuiltin(command: string, args: string[], stdin: string | undefined, cwd: string, fs: VirtualFileSystem, game: GameState, history: string[]): { text?: string; error?: string; cwd?: string } {
  const paths = args.filter((arg) => !arg.startsWith("-"));
  const pathAt = (input?: string) => resolveShellPath(cwd, input);
  if (command === "help" || command === "man") return { text: shellHelp };
  if (command === "pwd") return { text: cwd };
  if (command === "whoami") return { text: "dev" };
  if (command === "hostname") return { text: "delivery.local" };
  if (command === "date") return { text: `Shift clock ${String(9 + Math.floor(game.gameTime / 3600)).padStart(2, "0")}:${String(Math.floor(game.gameTime / 60) % 60).padStart(2, "0")}` };
  if (command === "env") return { text: `HOME=${SHELL_HOME}\nPWD=${cwd}\nSHELL=/bin/context-sh\nPROJECT=${SHELL_WORKSPACE}` };
  if (command === "which") return { text: args.map((name) => builtins.has(name) || ["anthill", "forge", "tickets", "agents", "reviews", "upgrades", "events", "mux", "clear"].includes(name) ? `/bin/${name}` : `${name} not found`).join("\n") };
  if (command === "history") return { text: history.map((line, index) => `${String(index + 1).padStart(3)}  ${line}`).join("\n") };
  if (command === "git") { const result = gitOutput(args, game); return typeof result === "string" ? { text: result } : result; }
  if (command === "cd") {
    const next = pathAt(args[0] ?? "~");
    return fs.entries[next]?.kind === "dir" ? { cwd: next } : { error: `not a directory: ${displayShellPath(next)}` };
  }
  if (command === "ls") {
    const target = pathAt(paths[0]);
    const entry = fs.entries[target];
    if (!entry) return { error: `no such file or directory: ${displayShellPath(target)}` };
    const items = entry.kind === "dir" ? children(fs, target) : [target];
    const long = args.some((arg) => arg.startsWith("-") && arg.includes("l"));
    const listed = items.map((path) => `${long ? `${fs.entries[path].kind === "dir" ? "d" : "-"}rw-r--r-- dev  ${fs.entries[path].kind === "file" ? fs.entries[path].content.length.toString().padStart(5) : "    0"}  ` : ""}${baseName(path)}${fs.entries[path].kind === "dir" ? "/" : ""}`);
    if (args.some((arg) => arg.startsWith("-") && arg.includes("a")) && entry.kind === "dir") listed.unshift("./", "../");
    return { text: listed.join("\n") };
  }
  if (command === "tree") {
    const target = pathAt(paths[0]);
    if (!fs.entries[target]) return { error: `no such file or directory: ${displayShellPath(target)}` };
    const lines = [displayShellPath(target)];
    const walk = (path: string, prefix: string, depth: number) => {
      if (depth > 8 || lines.length > 200) return;
      const nodes = children(fs, path);
      nodes.forEach((node, index) => {
        const last = index === nodes.length - 1;
        lines.push(`${prefix}${last ? "└── " : "├── "}${baseName(node)}${fs.entries[node].kind === "dir" ? "/" : ""}`);
        if (fs.entries[node].kind === "dir") walk(node, `${prefix}${last ? "    " : "│   "}`, depth + 1);
      });
    };
    if (fs.entries[target].kind === "dir") walk(target, "", 0);
    return { text: lines.join("\n") };
  }
  if (command === "find") {
    const target = pathAt(paths[0] ?? ".");
    if (!fs.entries[target]) return { error: `no such file or directory: ${displayShellPath(target)}` };
    const nameIndex = args.indexOf("-name");
    const pattern = nameIndex >= 0 ? args[nameIndex + 1] : undefined;
    if (nameIndex >= 0 && !pattern) return { error: "usage: find [PATH] [-name PATTERN]" };
    const matcher = pattern ? new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`) : null;
    return { text: Object.keys(fs.entries).filter((path) => (path === target || path.startsWith(`${target}/`)) && (!matcher || matcher.test(baseName(path)))).sort().slice(0, 200).map(displayShellPath).join("\n") };
  }
  if (command === "cat" || command === "less" || command === "more") {
    if (!paths.length) return stdin !== undefined ? { text: stdin } : { error: `usage: ${command} <FILE>` };
    const contents: string[] = [];
    for (const input of paths) {
      const path = pathAt(input);
      const value = readFile(fs, path);
      if (value === undefined) return { error: fs.entries[path]?.kind === "dir" ? `is a directory: ${displayShellPath(path)}` : `no such file: ${displayShellPath(path)}` };
      contents.push(value);
    }
    return { text: contents.join("\n") };
  }
  if (command === "echo") return { text: args.filter((arg) => arg !== "-n").join(" ") + (args.includes("-n") ? "" : "\n") };
  if (command === "printf") {
    if (!args.length) return { error: "usage: printf <FORMAT> [ARG...]" };
    let argument = 1;
    const formatted = args[0].replace(/%[%sd]/g, (match) => match === "%%" ? "%" : args[argument++] ?? "");
    return { text: formatted.replace(/\\n/g, "\n").replace(/\\t/g, "\t") };
  }
  if (command === "mkdir") {
    if (!paths.length) return { error: "usage: mkdir [-p] <DIRECTORY>" };
    for (const input of paths) {
      const path = pathAt(input);
      const segments = path.split("/").filter(Boolean);
      let current = "";
      for (let index = 0; index < segments.length; index += 1) {
        current += `/${segments[index]}`;
        const existing = fs.entries[current];
        if (existing && existing.kind !== "dir") return { error: `not a directory: ${displayShellPath(current)}` };
        if (!existing && index < segments.length - 1 && !args.includes("-p")) return { error: `parent directory missing: ${displayShellPath(current)}` };
        if (!existing) fs.entries[current] = directory();
      }
    }
    return {};
  }
  if (command === "touch") {
    if (!paths.length) return { error: "usage: touch <FILE>" };
    for (const input of paths) {
      const path = pathAt(input);
      const failure = writeFile(fs, path, readFile(fs, path) ?? "");
      if (failure) return { error: failure };
    }
    return {};
  }
  if (command === "rm" || command === "rmdir") {
    if (!paths.length) return { error: `usage: ${command} ${command === "rm" ? "[-r] " : ""}<PATH>` };
    for (const input of paths) {
      const path = pathAt(input);
      const entry = fs.entries[path];
      if (!entry) { if (args.some((arg) => arg.includes("f"))) continue; return { error: `no such file or directory: ${displayShellPath(path)}` }; }
      if (path === "/" || path === SHELL_HOME || path === SHELL_WORKSPACE || cwd === path || cwd.startsWith(`${path}/`)) return { error: `cannot remove active or protected directory: ${displayShellPath(path)}` };
      if (entry.kind === "dir" && children(fs, path).length && (command === "rmdir" || !args.some((arg) => arg.startsWith("-") && arg.includes("r")))) return { error: `directory not empty: ${displayShellPath(path)} (use rm -r)` };
      removePath(fs, path);
    }
    return {};
  }
  if (command === "cp" || command === "mv") {
    if (paths.length !== 2) return { error: `usage: ${command} ${command === "cp" ? "[-r] " : ""}<SOURCE> <DESTINATION>` };
    const source = pathAt(paths[0]);
    const requested = pathAt(paths[1]);
    const destination = fs.entries[requested]?.kind === "dir" ? `${requested}/${baseName(source)}` : requested;
    if (source === SHELL_WORKSPACE || source === SHELL_HOME || source === "/") return { error: "cannot move or copy a protected root" };
    if (command === "mv" && (cwd === source || cwd.startsWith(`${source}/`))) return { error: "cannot move the active directory" };
    const failure = copyPath(fs, source, destination, command === "mv" || args.some((arg) => arg.startsWith("-") && arg.includes("r")));
    if (failure) return { error: failure };
    if (command === "mv") removePath(fs, source);
    return {};
  }
  if (command === "grep" || command === "rg") {
    const flags = [...args.filter((arg) => arg.startsWith("-")), ...(command === "rg" ? ["-rn"] : [])];
    const values = args.filter((arg) => !arg.startsWith("-"));
    const pattern = values[0];
    if (!pattern) return { error: "usage: grep [-inr] <PATTERN> [FILE]" };
    const insensitive = flags.some((flag) => flag.includes("i"));
    const numbered = flags.some((flag) => flag.includes("n"));
    const recursive = flags.some((flag) => flag.includes("r"));
    let matcher: RegExp;
    try { matcher = new RegExp(flags.some((flag) => flag.includes("F")) ? pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : pattern, insensitive ? "i" : ""); }
    catch { return { error: `invalid search pattern: ${pattern}` }; }
    const targetPaths = values.slice(1).map(pathAt);
    if (!targetPaths.length && recursive) targetPaths.push(cwd);
    const sources = targetPaths.length ? targetPaths.flatMap((path) => fs.entries[path]?.kind === "dir" && recursive ? Object.keys(fs.entries).filter((candidate) => candidate.startsWith(`${path}/`) && fs.entries[candidate].kind === "file") : [path]) : [];
    if (sources.some((path) => readFile(fs, path) === undefined)) return { error: "grep: file not found or is a directory" };
    const documents = sources.length ? sources.map((path) => ({ path, content: readFile(fs, path)! })) : [{ path: "", content: stdin ?? "" }];
    const matches: string[] = [];
    for (const document of documents) document.content.split("\n").forEach((line, index) => {
      if (matcher.test(line)) matches.push(`${sources.length > 1 || recursive ? `${displayShellPath(document.path)}:` : ""}${numbered ? `${index + 1}:` : ""}${line}`);
    });
    return { text: matches.slice(0, 200).join("\n") };
  }
  if (["head", "tail", "wc", "sort", "uniq"].includes(command)) {
    const countIndex = args.indexOf("-n");
    const dataPaths = countIndex >= 0 ? paths.filter((arg) => arg !== args[countIndex + 1]) : paths;
    const value = dataPaths.length ? readFile(fs, pathAt(dataPaths[0])) : stdin;
    if (value === undefined) return { error: dataPaths.length ? `no such file: ${displayShellPath(pathAt(dataPaths[0]))}` : `usage: ${command} <FILE> or pipe input` };
    const lines = value.replace(/\n$/, "").split("\n");
    if (command === "head" || command === "tail") {
      const count = Number(args.includes("-n") ? args[args.indexOf("-n") + 1] : args.find((arg) => /^-\d+$/.test(arg))?.slice(1) ?? 10);
      if (!Number.isInteger(count) || count < 0) return { error: `invalid line count: ${count}` };
      return { text: (command === "head" ? lines.slice(0, count) : lines.slice(-count)).join("\n") };
    }
    if (command === "sort") return { text: lines.sort().join("\n") };
    if (command === "uniq") return { text: lines.filter((line, index) => index === 0 || line !== lines[index - 1]).join("\n") };
    const lineCount = value ? value.split("\n").length - (value.endsWith("\n") ? 1 : 0) : 0;
    const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
    const byteCount = new TextEncoder().encode(value).length;
    return { text: `${args.includes("-l") ? lineCount : args.includes("-w") ? wordCount : args.includes("-c") ? byteCount : `${lineCount} ${wordCount} ${byteCount}`}${paths.length ? ` ${paths[0]}` : ""}` };
  }
  return { error: `command not found: ${command}` };
}

export function evaluateVirtualShell(raw: string, game: GameState, cwd: string, previousFs: VirtualFileSystem, history: string[]): ShellResult {
  const parsed = tokenize(raw);
  const fs = syncVirtualFileSystem(previousFs, game);
  if (parsed.error) return { handled: true, error: parsed.error, cwd, fs };
  const tokens = parsed.tokens;
  const first = tokens[0]?.toLowerCase();
  if (!first || !builtins.has(first)) return { handled: false, cwd, fs };
  const stages: string[][] = [[]];
  let redirect: { path: string; append: boolean } | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === PIPE) { if (!stages.at(-1)?.length) return { handled: true, error: "empty pipeline stage", cwd, fs }; stages.push([]); continue; }
    if (token === REDIRECT || token === APPEND) {
      if (redirect || index !== tokens.length - 2) return { handled: true, error: "redirection must be the final operation", cwd, fs };
      redirect = { path: tokens[index + 1], append: token === APPEND };
      break;
    }
    stages.at(-1)!.push(token);
  }
  if (stages.some((stage) => !stage.length)) return { handled: true, error: "empty pipeline stage", cwd, fs };
  let text = "";
  let nextCwd = cwd;
  for (const [index, stage] of stages.entries()) {
    const command = stage[0].toLowerCase();
    if (!builtins.has(command)) return { handled: true, error: `command not found: ${command}`, cwd, fs };
    if (index > 0 && ["cd", "mkdir", "rmdir", "touch", "cp", "mv", "rm"].includes(command)) return { handled: true, error: `${command} cannot read pipeline input`, cwd, fs };
    const result = runBuiltin(command, stage.slice(1), index > 0 ? text : undefined, nextCwd, fs, game, history);
    if (result.error) return { handled: true, error: result.error, cwd, fs: previousFs };
    text = result.text ?? "";
    nextCwd = result.cwd ?? nextCwd;
  }
  if (redirect) {
    const destination = resolveShellPath(nextCwd, redirect.path);
    const failure = writeFile(fs, destination, `${redirect.append ? readFile(fs, destination) ?? "" : ""}${text}`);
    if (failure) return { handled: true, error: failure, cwd, fs: previousFs };
    text = "";
  }
  return { handled: true, text: text.slice(0, 20_000), cwd: nextCwd, fs };
}
