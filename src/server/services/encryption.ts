import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Key material comes from two env vars:
 *
 * - `GATEWAY_ENCRYPTION_KEY` — the original single key. Ciphertexts written
 *   with it use the legacy 3-part "iv:authTag:ciphertext" envelope, which has
 *   no key id.
 * - `GATEWAY_ENCRYPTION_KEYS` — an ordered keyring for rotation:
 *   "<keyId>:<64-char hex>[,<keyId>:<64-char hex>...]". The FIRST entry is
 *   the active key used for new encryptions (4-part
 *   "keyId:iv:authTag:ciphertext" envelope); every entry can decrypt.
 *
 * To rotate: prepend a new entry to GATEWAY_ENCRYPTION_KEYS and keep the old
 * key in the ring (or as GATEWAY_ENCRYPTION_KEY for legacy envelopes) until
 * all stored values have been re-encrypted. Nothing becomes undecryptable at
 * any point in that procedure.
 */
type Keyring = {
  activeId: string | null;
  keys: Map<string, Buffer>;
  legacyKey: Buffer | null;
};

function parseHexKey(hex: string, label: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${label} must be a 64-char hex string (32 bytes)`);
  }
  return Buffer.from(hex, "hex");
}

function getKeyring(): Keyring {
  const ringSpec = process.env.GATEWAY_ENCRYPTION_KEYS ?? "";
  const legacyHex = process.env.GATEWAY_ENCRYPTION_KEY ?? "";

  const keys = new Map<string, Buffer>();
  let activeId: string | null = null;

  for (const entry of ringSpec.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) {
      throw new Error(
        'GATEWAY_ENCRYPTION_KEYS entries must be "<keyId>:<64-char hex>"',
      );
    }
    const id = trimmed.slice(0, sep);
    keys.set(id, parseHexKey(trimmed.slice(sep + 1), `GATEWAY_ENCRYPTION_KEYS key "${id}"`));
    activeId ??= id;
  }

  const legacyKey = legacyHex
    ? parseHexKey(legacyHex, "GATEWAY_ENCRYPTION_KEY")
    : null;

  if (!activeId && !legacyKey) {
    throw new Error(
      "Set GATEWAY_ENCRYPTION_KEY (64-char hex) or GATEWAY_ENCRYPTION_KEYS",
    );
  }

  return { activeId, keys, legacyKey };
}

function encryptWithKey(key: Buffer, json: string): { iv: Buffer; authTag: Buffer; encrypted: Buffer } {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  return { iv, authTag: cipher.getAuthTag(), encrypted };
}

function decryptWithKey(key: Buffer, iv: Buffer, authTag: Buffer, encrypted: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/**
 * Encrypts an object. With a keyring configured the envelope is
 * "keyId:iv:authTag:ciphertext"; otherwise the legacy "iv:authTag:ciphertext"
 * (all segments base64 except keyId).
 */
export function encryptJson(obj: unknown): string {
  const ring = getKeyring();
  const json = JSON.stringify(obj);

  if (ring.activeId) {
    const key = ring.keys.get(ring.activeId)!;
    const { iv, authTag, encrypted } = encryptWithKey(key, json);
    return [
      ring.activeId,
      iv.toString("base64"),
      authTag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  }

  const { iv, authTag, encrypted } = encryptWithKey(ring.legacyKey!, json);
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

/**
 * Decrypts either envelope format back to a typed object.
 */
export function decryptJson<T>(ciphertext: string): T {
  const ring = getKeyring();
  const parts = ciphertext.split(":");

  let candidates: Buffer[];
  let ivB64: string, authTagB64: string, encryptedB64: string;

  if (parts.length === 4) {
    const keyId = parts[0];
    [, ivB64, authTagB64, encryptedB64] = parts;
    const key = ring.keys.get(keyId);
    if (!key) {
      throw new Error(`Unknown encryption key id "${keyId}" — is it missing from GATEWAY_ENCRYPTION_KEYS?`);
    }
    candidates = [key];
  } else if (parts.length === 3) {
    [ivB64, authTagB64, encryptedB64] = parts;
    // Legacy envelopes carry no key id. Prefer the legacy key; fall back to
    // trying ring keys so GATEWAY_ENCRYPTION_KEY can eventually be retired by
    // moving the old key into the ring. GCM authentication makes a wrong-key
    // attempt fail loudly, never decrypt garbage.
    candidates = [
      ...(ring.legacyKey ? [ring.legacyKey] : []),
      ...ring.keys.values(),
    ];
  } else {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");

  // Require a full 128-bit tag — a truncated tag weakens GCM's authentication.
  if (authTag.length !== 16) throw new Error("Invalid ciphertext format");

  let lastError: unknown = new Error("No decryption key available");
  for (const key of candidates) {
    try {
      return JSON.parse(decryptWithKey(key, iv, authTag, encrypted)) as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Encrypts a plain string (e.g. a contractor's SSN/EIN) to the same
 * envelope used by {@link encryptJson}.
 */
export function encryptString(value: string): string {
  return encryptJson(value);
}

/** Decrypts a string produced by {@link encryptString}. */
export function decryptString(ciphertext: string): string {
  return decryptJson<string>(ciphertext);
}
