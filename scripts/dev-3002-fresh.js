/**
 * Limpia .next, intenta liberar el puerto 3002 (EADDRINUSE) y arranca Next en 3002.
 * kill-port puede fallar si el puerto ya está libre; en ese caso se ignora.
 */
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
fs.rmSync(path.join(root, ".next"), { recursive: true, force: true });
console.log("[dev:3002:fresh] Carpeta .next eliminada.");

const killCli = path.join(root, "node_modules", "kill-port", "cli.js");
try {
  execSync(`${JSON.stringify(process.execPath)} ${JSON.stringify(killCli)} 3002`, {
    stdio: "inherit",
    cwd: root,
    shell: true
  });
} catch {
  console.log("[dev:3002:fresh] Puerto 3002 ya libre (o kill-port no aplicó).");
}

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", "-p", "3002"], {
  stdio: "inherit",
  cwd: root
});
child.on("exit", (code) => process.exit(code ?? 0));
