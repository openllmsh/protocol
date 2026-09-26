import { extname } from "node:path";

/** Only launchable Windows files; never prefer an extensionless npm POSIX shim. */
export const executableCandidates = (
  path: string,
  platform: NodeJS.Platform = process.platform,
  pathExt: string = process.env.PATHEXT ?? "",
): string[] => {
  if (platform !== "win32") return [path];
  const supported = [".exe", ".com", ".cmd", ".bat", ".ps1"];
  const extension = extname(path).toLowerCase();
  if (supported.includes(extension)) return [path];
  const extensions = [
    ...new Set([
      ".exe", // Prefer a native launcher when an npm shim also exists.
      ...pathExt
        .split(";")
        .map((e) => e.toLowerCase())
        .filter((e) => supported.includes(e)),
      ...supported,
    ]),
  ];
  return extensions.map((extension) => path + extension);
};

export const executablePathDirs = (
  path: string = process.env.PATH ?? "",
  platform: NodeJS.Platform = process.platform,
): string[] =>
  path
    .split(platform === "win32" ? ";" : ":")
    .map((dir) => dir.replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
