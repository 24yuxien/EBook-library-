import { execFileSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required: tests must run against a dedicated Postgres database.");
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  execFileSync("npx", ["prisma", "migrate", "reset", "--force", "--skip-generate"], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: "inherit",
  });
}
