import type { FieldProtector } from "@numerology/application";
import type { DatabasePool } from "./pool";

function assertDedicatedTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString);
  if (
    parsed.pathname !== "/numerology_test" ||
    !["127.0.0.1", "localhost"].includes(parsed.hostname)
  ) {
    throw new Error("Test database reset is restricted to local database 'numerology_test'.");
  }
}

export async function resetTestDatabase(
  pool: DatabasePool,
  connectionString: string,
): Promise<void> {
  assertDedicatedTestDatabase(connectionString);
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public AUTHORIZATION numerology");
}

interface SyntheticIdentityOptions {
  readonly now: Date;
  readonly principalId: string;
  readonly subjectId: string;
}

export async function seedSyntheticIdentity(
  pool: DatabasePool,
  protector: FieldProtector,
  options: SyntheticIdentityOptions,
): Promise<void> {
  const email = `synthetic+${options.principalId}@example.invalid`;
  const emailCiphertext = await protector.protect(email, "principal_email");
  const emailLookupHmac = await protector.lookup(email.toLowerCase(), "principal_email");
  const dateOfBirthCiphertext = await protector.protect("1990-08-12", "subject_date_of_birth");
  const purgeAfter = new Date(options.now.getTime() + 30 * 24 * 60 * 60 * 1_000);

  await pool.query(
    `INSERT INTO principals
      (id, email_ciphertext, email_lookup_hmac, email_key_version, locale, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'en-IN', $5, $5)`,
    [
      options.principalId,
      Buffer.from(emailCiphertext.ciphertext),
      Buffer.from(emailLookupHmac),
      emailCiphertext.keyVersion,
      options.now,
    ],
  );
  await pool.query(
    `INSERT INTO subjects
      (id, owner_principal_id, date_of_birth_ciphertext, identity_key_version, created_at, purge_after)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      options.subjectId,
      options.principalId,
      Buffer.from(dateOfBirthCiphertext.ciphertext),
      dateOfBirthCiphertext.keyVersion,
      options.now,
      purgeAfter,
    ],
  );
}
