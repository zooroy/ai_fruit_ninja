import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const name = "add-gesture-fruit-ninja";
for (const id of process.argv.slice(2)) {
  const state = JSON.parse(
    execFileSync(
      "openspec",
      ["instructions", "apply", "--change", name, "--json"],
      { encoding: "utf8" },
    ),
  );
  const task = state.tasks.find((t) => t.description.startsWith(id + " "));
  if (!task || task.done) throw Error("Missing or done task " + id);
  const lines = readFileSync(task.sourcePath, "utf8").split("\n");
  if (lines[task.line - 1] !== `- [ ] ${task.description}`)
    throw Error("Task changed");
  lines[task.line - 1] = `- [x] ${task.description}`;
  writeFileSync(task.sourcePath, lines.join("\n"));
  const next = JSON.parse(
    execFileSync(
      "openspec",
      ["instructions", "apply", "--change", name, "--json"],
      { encoding: "utf8" },
    ),
  );
  if (!next.tasks.find((t) => t.id === task.id)?.done)
    throw Error("Not recorded");
  console.log(id, next.progress);
}
