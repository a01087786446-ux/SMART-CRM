
import "server-only";

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type GoogleTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string;
  token_type?: string | null;
};

const tokenPath = path.join(
  process.cwd(),
  ".smart-crm-private",
  "google-token.enc"
);

function encryptionKey(): Buffer {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || "";

  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY 설정을 확인하세요.");
  }

  return Buffer.from(value, "hex");
}

export async function saveGoogleTokens(tokens: GoogleTokens) {
  const previous = await loadGoogleTokens();

  const merged = {
    ...previous,
    ...tokens,
    refresh_token:
      tokens.refresh_token || previous?.refresh_token || null,
  };

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(merged), "utf8"),
    cipher.final(),
  ]);

  const payload = Buffer.concat([
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]);

  await mkdir(path.dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, payload, { mode: 0o600 });
}

export async function loadGoogleTokens(): Promise<GoogleTokens | null> {
  let payload: Buffer;

  try {
    payload = await readFile(tokenPath);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    iv
  );

  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as GoogleTokens;
}
