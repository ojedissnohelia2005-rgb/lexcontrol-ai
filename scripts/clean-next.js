/* Elimina .next para evitar EINVAL readlink / ENOENT rename (común con OneDrive en Windows). */
const fs = require("fs");
const path = require("path");

const target = path.join(process.cwd(), ".next");
try {
  fs.rmSync(target, { recursive: true, force: true });
  console.log("[clean-next] Eliminado:", target);
} catch (e) {
  console.error("[clean-next]", e);
  process.exit(1);
}
