import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/initialState";
import { completeShellInput, createVirtualFileSystem, evaluateVirtualShell, SHELL_HOME, SHELL_WORKSPACE, type ShellOptions, type VirtualFileSystem } from "../src/ui/virtualShell";
import { evaluateCommand } from "../src/ui/cli";

function shell(initialGame = createInitialState()) {
  let cwd = SHELL_WORKSPACE;
  let fs: VirtualFileSystem = createVirtualFileSystem();
  let previousCwd: string | undefined;
  const history: string[] = [];
  return {
    run(command: string, options: ShellOptions = {}) {
      history.push(command);
      const result = evaluateVirtualShell(command, initialGame, cwd, fs, history, { previousCwd, ...options });
      cwd = result.cwd;
      fs = result.fs;
      previousCwd = result.previousCwd;
      return result;
    },
    get cwd() { return cwd; },
    get fs() { return fs; },
  };
}

describe("simulated terminal shell", () => {
  it("resolves globs outside the current directory through relative parents", () => {
    const session = shell();
    session.run("cd notes");
    expect(session.run("cat ../tickets/*.md").text).toContain("APP-101");
    expect(session.run("echo ../tickets/*.md").text).toContain("../tickets/APP-101.md");
    expect(session.run("cat /home/dev/delivery/tickets/*.md").text).toContain("APP-101");
    expect(session.run("cat '../tickets/*.md'").error).toContain("no such file");
  });
  it("navigates an authored workspace without touching the host filesystem", () => {
    const session = shell();
    expect(session.run("pwd").text).toBe(SHELL_WORKSPACE);
    expect(session.run("ls").text).toContain("tickets/");
    expect(session.run("ls -la").text).toContain("README.md");
    expect(session.run("cd tickets").cwd).toBe(`${SHELL_WORKSPACE}/tickets`);
    expect(session.run("cat APP-101.md").text).toContain("Rename the deployment banner");
    expect(session.run("cd ..").cwd).toBe(SHELL_WORKSPACE);
    expect(session.run("cat /etc/passwd").error).toContain("no such file");
    expect(session.run("find . -name '*.tsx'").text).toContain("Banner.tsx");
    expect(session.run("rg 'deployment banner' tickets").text).toContain("APP-101.md");
  });

  it("supports quoting, redirection, append, pipes, and common text filters", () => {
    const session = shell();
    expect(session.run("echo 'alpha beta' > notes/work.txt").error).toBeUndefined();
    expect(session.run("printf '%s\\n' gamma >> notes/work.txt").error).toBeUndefined();
    expect(session.run("cat notes/work.txt").text).toBe("alpha beta\ngamma\n");
    expect(session.run("cat notes/work.txt | grep -n beta").text).toBe("1:alpha beta");
    expect(session.run("head -n 1 notes/work.txt").text).toBe("alpha beta");
    expect(session.run("tail -1 notes/work.txt").text).toBe("gamma");
    expect(session.run("wc -l notes/work.txt").text).toBe("2 notes/work.txt");
    expect(session.run("echo '>'").text).toBe(">\n");
    expect(session.run("cat notes/work.txt | sort").text).toBe("alpha beta\ngamma");
  });

  it("creates, copies, moves, and removes sandbox files and directories", () => {
    const session = shell();
    expect(session.run("mkdir -p notes/work/review").error).toBeUndefined();
    expect(session.run("touch notes/work/review/plan.md").error).toBeUndefined();
    expect(session.run("echo ready > notes/work/review/plan.md").error).toBeUndefined();
    expect(session.run("cp -r notes/work notes/copy").error).toBeUndefined();
    expect(session.run("mv notes/copy/review/plan.md notes/copy/done.md").error).toBeUndefined();
    expect(session.run("cat notes/copy/done.md").text).toBe("ready\n");
    expect(session.run("rm -r notes/copy").error).toBeUndefined();
    expect(session.run("ls notes").text).not.toContain("copy/");
    expect(session.run("rm -r .").error).toContain("protected directory");
    expect(session.run("rmdir notes/work").error).toContain("directory not empty");
  });

  it("reports unsupported syntax and keeps game commands for the game parser", () => {
    const session = shell();
    expect(session.run("tickets list").handled).toBe(false);
    expect(session.run("echo nope & rm notes").error).toContain("background execution");
    expect(session.run("echo 'unfinished").error).toContain("unclosed quote");
    expect(session.run("cat README.md | nope").error).toContain("command not found");
    expect(session.run("grep '[broken' README.md").error).toContain("invalid search pattern");
    expect(session.run("help").text).toContain("sandbox, not your computer");
    expect(session.run("history").text).toContain("tickets list");
  });

  it("links simulated git inspection to scripted game state", () => {
    const game = createInitialState();
    game.completedTicketIds = ["deployment-banner"];
    const session = shell(game);
    expect(session.run("git status").text).toContain("Shipped: 1");
    expect(session.run("git log").text).toContain("APP-101");
    expect(session.run("git push").error).toContain("not simulated");
    expect(session.run("date").text).toContain("Shift clock 09:00");
  });

  it("does not silently recreate a deleted scripted directory", () => {
    const session = shell();
    expect(session.run("rm -r tickets").error).toBeUndefined();
    expect(session.run("ls").text).not.toContain("tickets/");
    expect(session.run("cat tickets/APP-101.md").error).toContain("no such file");
  });

  it("chains on success and continues after failures with command-scoped atomicity", () => {
    const session = shell();
    const result = session.run("touch notes/kept; touch notes/rolled-back missing/file && echo skipped; echo continued");
    expect(result.error).toContain("directory not found");
    expect(result.text).toBe("continued\n");
    expect(session.fs.entries[`${SHELL_WORKSPACE}/notes/kept`]).toBeDefined();
    expect(session.fs.entries[`${SHELL_WORKSPACE}/notes/rolled-back`]).toBeUndefined();
    expect(session.run("cd notes && pwd; cd - && pwd").text).toBe(`${SHELL_WORKSPACE}/notes\n${SHELL_WORKSPACE}\n${SHELL_WORKSPACE}`);
    expect(session.run("echo one && echo two;").text).toBe("one\ntwo\n");
    expect(session.run("cat missing && echo skipped && touch notes/skipped; echo end").text).toBe("end\n");
    expect(session.fs.entries[`${SHELL_WORKSPACE}/notes/skipped`]).toBeUndefined();
    expect(session.run("echo alpha | grep absent && touch notes/no-match; echo next").text).toBe("next\n");
    expect(session.fs.entries[`${SHELL_WORKSPACE}/notes/no-match`]).toBeUndefined();
    expect(session.run("echo alpha | grep absent").exitCode).toBe(1);
  });

  it("validates syntax before writes and rejects unsupported operators", () => {
    const session = shell();
    for (const command of ["touch notes/bad; echo ok &&", "touch notes/bad; | cat", "touch notes/bad; echo hi >", "touch notes/bad; > notes/file", "touch notes/bad; echo hi || echo bye", "touch notes/bad; cat << notes/input", "echo $(pwd)", "echo `pwd`", "echo \"$(pwd)\""]) {
      expect(session.run(command).error).toBeDefined();
      expect(session.fs.entries[`${SHELL_WORKSPACE}/notes/bad`]).toBeUndefined();
    }
    expect(session.run("echo '$(pwd) ; && < `pwd`'").text).toBe("$(pwd) ; && < `pwd`\n");
    expect(session.run("echo > notes/one > notes/two").error).toContain("duplicate output");
    expect(session.run("cat < README.md < package.json").error).toContain("duplicate input");
    expect(session.run("echo hi > notes/one | cat").error).toContain("final pipeline");
  });

  it("supports input redirection and rolls back a failing redirected command", () => {
    const session = shell();
    session.run("printf 'beta\\nalpha\\n' > notes/input.txt");
    expect(session.run("sort < notes/input.txt | head -n 1").text).toBe("alpha");
    expect(session.run("< notes/input.txt cat").text).toBe("beta\nalpha\n");
    expect(session.run("cat < notes/input.txt > notes/output.txt").error).toBeUndefined();
    expect(session.run("cat notes/output.txt").text).toBe("beta\nalpha\n");
    expect(session.run("cat < notes").error).toContain("is a directory");
    expect(session.run("touch notes/rollback > missing/out").error).toContain("directory not found");
    expect(session.fs.entries[`${SHELL_WORKSPACE}/notes/rollback`]).toBeUndefined();
    expect(session.run("cd notes > missing/out").cwd).toBe(SHELL_WORKSPACE);
    expect(session.run("cat < missing").error).toContain("no such file");
  });

  it("expands only safe variables and tracks cd - without splitting quoted words", () => {
    const session = shell();
    expect(session.run("cd -").error).toContain("OLDPWD is not set");
    expect(session.run("echo \"$HOME\" '${PWD}' \\$PWD ${PWD}").text).toBe(`${SHELL_HOME} \${PWD} $PWD ${SHELL_WORKSPACE}\n`);
    expect(session.run("echo $SECRET").error).toContain("variable SECRET is not supported");
    expect(session.run("echo ${PWD").error).toContain("unfinished variable");
    expect(session.run("echo $constructor").error).toContain("not supported");
    expect(session.run("cd notes; echo $PWD $OLDPWD; cd -; echo ${OLDPWD}").text).toBe(`${SHELL_WORKSPACE}/notes ${SHELL_WORKSPACE}\n${SHELL_WORKSPACE}\n${SHELL_WORKSPACE}/notes\n`);
    expect(session.run("cd ~").cwd).toBe(SHELL_HOME);
    expect(session.run("cd '$HOME'").error).toContain("not a directory");
    expect(session.run("cd '~/delivery'").error).toContain("not a directory");
    expect(session.run("cd ~/delivery").cwd).toBe(SHELL_WORKSPACE);
    session.run("mkdir 'notes/with space'; cd 'notes/with space'");
    expect(session.run("printf '%s' \"$PWD\"").text).toBe(`${SHELL_WORKSPACE}/notes/with space`);
  });

  it("expands deterministic segment globs and leaves quoted, escaped, hidden, and unmatched patterns literal", () => {
    const session = shell();
    session.run("echo a > notes/a.txt; echo b > notes/b.txt; touch notes/.hidden.txt");
    expect(session.run("echo notes/?.txt").text).toBe("notes/a.txt notes/b.txt\n");
    expect(session.run("cat notes/*.txt").text).toBe("a\n\nb\n");
    expect(session.run("echo 'notes/*.txt' notes/\\*.txt notes/missing*.txt").text).toBe("notes/*.txt notes/*.txt notes/missing*.txt\n");
    expect(session.run("echo notes/.*.txt").text).toBe("notes/.hidden.txt\n");
    expect(session.run("echo ~/delivery/notes/?.txt").text).toBe(`${SHELL_WORKSPACE}/notes/a.txt ${SHELL_WORKSPACE}/notes/b.txt\n`);
    expect(session.run("cd notes; echo ../notes/?.txt").text).toBe("a.txt b.txt\n");
    session.run("cd ..");
    expect(session.run("echo failed > notes/*.txt").error).toContain("ambiguous output");
    expect(session.run("cat < notes/*.txt").error).toContain("ambiguous input");
  });

  it("pipes game inspection without invoking mutation callbacks or changing ticket state", () => {
    const game = createInitialState();
    const before = JSON.stringify(game);
    const session = shell(game);
    const calls: string[] = [];
    const options: ShellOptions = { evaluateGameCommand: (raw) => {
      calls.push(raw);
      const result = evaluateCommand(raw, game, undefined, true);
      expect(result.effect).toBeUndefined();
      return result.messages.some((message) => message.kind === "error") ? { error: result.messages.map((message) => message.text).join("\n") } : { text: result.messages.map((message) => message.text).join("\n") };
    } };
    expect(session.run("tickets list | grep APP", options).text).toContain("APP-101");
    expect(session.run("tickets list | rg APP", options).text).toContain("APP-101");
    expect(session.run("tickets read APP-101 | wc -l", options).text).toMatch(/^\d+$/);
    expect(session.run("events 2 > notes/events", options).error).toBeUndefined();
    const callCount = calls.length;
    for (const command of ["agents run APP-101 | cat", "reviews approve APP-101 | cat", "upgrades buy terminal-dashboard | cat", "tickets list | agents compact 1", "touch notes/bad | cat", "cat README.md | rm notes/input"]) expect(session.run(command, options).error).toBeDefined();
    expect(calls).toHaveLength(callCount);
    expect(session.fs.entries[`${SHELL_WORKSPACE}/notes/bad`]).toBeUndefined();
    expect(JSON.stringify(game)).toBe(before);
    expect(session.run("tickets list", options).handled).toBe(false);
    expect(session.run("tickets list | cat").error).toContain("unavailable");
    expect(session.run("tickets list | cat", { evaluateGameCommand: () => { throw new Error("broken"); } }).error).toContain("inspection failed");
  });

  it("completes commands, paths, quotes, and chained commands without changing the filesystem", () => {
    const session = shell();
    session.run("touch 'notes/space file.txt'; mkdir notes/folder");
    const before = JSON.stringify(session.fs);
    const complete = (input: string) => completeShellInput(input, session.cwd, session.fs);
    expect(complete("pw").input).toBe("pwd ");
    expect(complete("cat RE").input).toBe("cat README.md ");
    expect(complete("cat notes/sp").input).toBe("cat notes/space\\ file.txt ");
    expect(complete("cat 'notes/sp").input).toBe("cat 'notes/space file.txt' ");
    expect(complete("cd notes/fo").input).toBe("cd notes/folder/");
    expect(complete("cat ~/delivery/RE").input).toBe("cat ~/delivery/README.md ");
    expect(complete("echo x && pw").input).toBe("echo x && pwd ");
    expect(complete("echo x | gr").input).toBe("echo x | grep ");
    expect(complete("cat < RE").input).toBe("cat < README.md ");
    expect(complete("cat notes/nope").matches).toEqual([]);
    expect(complete("r").matches).toContain("rm");
    expect(completeShellInput("pw rest", session.cwd, session.fs, { cursor: 2 }).input).toBe("pwd rest");
    expect(JSON.stringify(session.fs)).toBe(before);
  });
});
