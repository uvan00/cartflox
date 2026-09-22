/**
 * Validates critical environment variables at startup.
 * Call once in instrumentation.ts or in the root layout.
 * Logs warnings for missing optional vars, throws for mandatory ones.
 */

interface EnvVar {
    key: string;
    required: boolean;
    description: string;
}

const VARS: EnvVar[] = [
    { key: "DATABASE_URL", required: true, description: "PostgreSQL connection string" },
    { key: "BETTER_AUTH_SECRET", required: true, description: "Session signing secret" },
    { key: "NEXTAUTH_URL", required: true, description: "Public base URL of the app" },
    { key: "KEY_VAULTS_SECRET", required: true, description: "Master key encrypting gateway credentials" },
    { key: "SMTP_HOST", required: false, description: "SMTP host for transactional emails" },
    { key: "SMTP_PASS", required: false, description: "SMTP password" },
    { key: "MAIL_FROM", required: false, description: "Sender email address" },
    { key: "CRON_SECRET", required: false, description: "Secret for cron job endpoints" },
    { key: "INTERNAL_SECRET", required: false, description: "Secret for internal API calls" },
];

export function checkEnv(): void {
    const missing: string[] = [];
    const warnings: string[] = [];

    for (const v of VARS) {
        const val = process.env[v.key];
        if (!val || val.trim() === "") {
            if (v.required) {
                missing.push(`  ❌ ${v.key} — ${v.description}`);
            } else {
                warnings.push(`  ⚠️  ${v.key} — ${v.description} (optional)`);
            }
        }
    }

    if (warnings.length > 0) {
        console.warn(`[env-check] Missing optional environment variables:\n${warnings.join("\n")}`);
    }

    if (missing.length > 0) {
        const msg = `[env-check] FATAL: Missing required environment variables:\n${missing.join("\n")}`;
        console.error(msg);
        if (process.env.NODE_ENV === "production") {
            throw new Error(msg);
        }
    }
}
