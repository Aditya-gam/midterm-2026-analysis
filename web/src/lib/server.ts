// Build-time data access for Server Components (the site is a static export: this runs during `next build`).
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "public", "data");

export function load<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), "utf8")) as T;
}
