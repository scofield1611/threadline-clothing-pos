// Fails fast at boot with a clear message if required configuration is
// missing, instead of letting the first request that needs JWT_SECRET or
// a DB connection fail with a confusing runtime error.
export function assertRequiredEnv() {
  const problems = [];

  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL is not set");
  }

  if (!process.env.JWT_SECRET) {
    problems.push("JWT_SECRET is not set");
  } else if (process.env.JWT_SECRET.length < 16) {
    problems.push("JWT_SECRET is too short (use at least 16 characters, ideally a long random string)");
  }

  if (process.env.NODE_ENV === "production" && !process.env.CLIENT_ORIGIN) {
    // CORS with credentials cannot use a wildcard origin, so in production
    // this MUST be set to the real frontend origin or every browser
    // request will be rejected by CORS regardless of the API working fine.
    problems.push("CLIENT_ORIGIN is not set — required in production because CORS credentials cannot use a wildcard origin");
  }

  if (problems.length > 0) {
    console.error("\nThreadLine API cannot start — missing/invalid configuration:\n");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("\nCheck your .env file against .env.example and try again.\n");
    process.exit(1);
  }
}
