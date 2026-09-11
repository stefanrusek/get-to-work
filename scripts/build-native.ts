// preBuild hook: compile the native bridge so build.copy can pick up build/native/libgtw.dylib.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const r = spawnSync("bash", [resolve(root, "scripts/build-native.sh")], { cwd: root, stdio: "inherit" });
if (r.status !== 0) {
	throw new Error(`build-native.sh failed with status ${r.status}`);
}
