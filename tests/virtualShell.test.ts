import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/initialState";
import { createVirtualFileSystem, evaluateVirtualShell, SHELL_WORKSPACE, type VirtualFileSystem } from "../src/ui/virtualShell";

function shell(initialGame = createInitialState()) {
  let cwd = SHELL_WORKSPACE;
  let fs: VirtualFileSystem = createVirtualFileSystem();
  const history: string[] = [];
  return {
    run(command: string) {
      history.push(command);
      const result = evaluateVirtualShell(command, initialGame, cwd, fs, history);
      cwd = result.cwd;
      fs = result.fs;
      return result;
    },
    get cwd() { return cwd; },
    get fs() { return fs; },
  };
}

describe("simulated terminal shell", () => {
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
    expect(session.run("echo nope && rm notes").error).toContain("operator & is not supported");
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
});
