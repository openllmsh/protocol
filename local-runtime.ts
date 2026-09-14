/** OS primitives shared by the daemon and its independently compiled CLI. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export const executableName = (name: string, platform = process.platform): string =>
  platform === "win32" ? `${name}.exe` : name;

export const windowsWorkerPath = (state: string): string | null => {
  const override = process.env.OPENLLM_WINDOWS_WORKER_PATH;
  return [
    ...(override && isAbsolute(override) ? [override] : []),
    join(state, "bin", "openllm-windows-worker.exe"),
    join(dirname(process.execPath), "openllm-windows-worker.exe"),
  ].find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
};

export const processStartCommand = (pid: number, state: string): string[] => {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("invalid process id");
  if (process.platform !== "win32") return ["ps", "-o", "lstart=", "-p", String(pid)];
  const worker = windowsWorkerPath(state);
  if (worker === null) throw new Error("Windows runtime worker is not installed");
  return [worker, "--identity", String(pid)];
};

/** undefined is unavailable/unknown; null is a confirmed absent process. */
export const processStartIdentity = (pid: number, state: string): string | null | undefined => {
  try {
    const [bin, ...args] = processStartCommand(pid, state);
    const result = spawnSync(bin!, args, { encoding: "utf8", timeout: 1500, windowsHide: true });
    if (result.error) return undefined;
    if (result.status !== 0) {
      return process.platform === "win32" && result.status !== 3 ? undefined : null;
    }
    const value = result.stdout.trim();
    return value || null;
  } catch { return undefined; }
};

/** Apply an owner-only Windows ACL to a newly created session directory. */
export const secureSessionDirectory = (path: string, state: string): void => {
  if (process.platform !== "win32") return;
  const worker = windowsWorkerPath(state);
  if (worker === null) throw new Error("Windows runtime worker is not installed");
  const result = spawnSync(worker, ["--secure-directory", path], { timeout: 3000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error("Cannot secure Windows session directory");
};

/** Windows uses an ACL-protected capability file for a loopback WebSocket. */
export const localSessionEndpoint = (path: string, state: string): string => {
  if (process.platform !== "win32") return `ws+unix://${path}`;
  const worker = windowsWorkerPath(state);
  if (worker === null) throw new Error("Windows runtime worker is not installed");
  const result = spawnSync(worker, ["--check-directory", dirname(path)], { timeout: 3000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error("Unsafe Windows session directory");
  if (statSync(path).size > 1024) throw new Error("Invalid Windows session endpoint");
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535 ||
      typeof value.token !== "string" || !/^[a-f0-9]{64}$/.test(value.token))
    throw new Error("Invalid Windows session endpoint");
  return `ws://127.0.0.1:${value.port}/${value.token}`;
};

export const localSessionEndpointPresent = (path: string): boolean => {
  try { const s = statSync(path); return process.platform === "win32" ? s.isFile() : s.isSocket(); }
  catch { return false; }
};

/** Bun compiled argv[1] is a virtual $bunfs path, never a source entrypoint. */
export const sourceEntrypoint = (arg: string | undefined): string | null =>
  arg && !arg.includes("$bunfs") && /\.[cm]?[jt]s$/.test(arg) && existsSync(arg) ? arg : null;
