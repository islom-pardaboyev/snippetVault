import { describe, expect, it } from "vitest";
import {
  KDF_ITERATIONS,
  changeVaultPassphrase,
  createVaultKey,
  deriveKek,
  fromBase64,
  generateRecoveryKey,
  newKdfParams,
  normalizeRecoveryKey,
  openBytes,
  openText,
  randomBytes,
  resetPassphraseWithRecovery,
  sealBytes,
  sealText,
  sha256,
  toBase64,
  unlockVaultKey,
  unlockVaultKeyWithRecovery,
  unwrapBytes,
  wrapBytes,
  DecryptionError,
} from "../crypto";

// A tiny work factor keeps the suite fast; the real default is exercised separately.
const FAST = { iterations: 1_000 };

describe("base64 helpers", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = randomBytes(257);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("handles empty and single-byte input", () => {
    expect(fromBase64(toBase64(new Uint8Array()))).toEqual(new Uint8Array());
    expect(fromBase64(toBase64(new Uint8Array([0, 255, 128])))).toEqual(new Uint8Array([0, 255, 128]));
  });
});

describe("seal / open", () => {
  it("round-trips a string, including unicode", async () => {
    const key = await importKey("passphrase");
    const text = "const x = 'héllo 🌍';\n\u0000binary-ish";
    const sealed = await sealText(key, text);
    expect(sealed.v).toBe(1);
    expect(await openText(key, sealed)).toBe(text);
  });

  it("produces a different IV every time", async () => {
    const key = await importKey("passphrase");
    const a = await sealText(key, "same");
    const b = await sealText(key, "same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("throws DecryptionError for the wrong key", async () => {
    const sealed = await sealText(await importKey("right"), "secret");
    await expect(openText(await importKey("wrong"), sealed)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("detects tampering with the ciphertext", async () => {
    const key = await importKey("passphrase");
    const sealed = await sealText(key, "secret payload");
    const bytes = fromBase64(sealed.ct);
    bytes[0] ^= 0x01;
    const tampered = { ...sealed, ct: toBase64(bytes) };
    await expect(openText(key, tampered)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("rejects a mismatched additional-authenticated-data value", async () => {
    const key = await importKey("passphrase");
    const sealed = await sealText(key, "secret", "item-1");
    expect(await openText(key, sealed, "item-1")).toBe("secret");
    await expect(openText(key, sealed, "item-2")).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe("seal / open bytes", () => {
  // Hosted vault images travel as bytes: sealed here, wrapped in a PNG by `container.ts`,
  // hosted, then read back — so the byte-level primitives need the same guarantees as text.
  it("round-trips arbitrary bytes, including every byte value", async () => {
    const key = await importKey("passphrase");
    const data = randomBytes(40_000);
    const sealed = await sealBytes(key, data);
    expect(await openBytes(key, sealed)).toEqual(data);

    const full = new Uint8Array(256).map((_, i) => i);
    expect(await openBytes(key, await sealBytes(key, full))).toEqual(full);
  });

  it("binds the bytes to the id, so a record can't be swapped in", async () => {
    const key = await importKey("passphrase");
    const sealed = await sealBytes(key, new Uint8Array([9, 9, 9]), "image-a");
    expect(await openBytes(key, sealed, "image-a")).toEqual(new Uint8Array([9, 9, 9]));
    await expect(openBytes(key, sealed, "image-b")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("throws DecryptionError for the wrong key", async () => {
    const sealed = await sealBytes(await importKey("right"), new Uint8Array([1, 2, 3]));
    await expect(openBytes(await importKey("wrong"), sealed)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("hashes bytes the way a hosting round trip needs", async () => {
    const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    // SHA-256 of the empty string (base64) and of "abc" (hex) — the two canonical vectors.
    expect(await sha256(new Uint8Array())).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
    expect(hex(fromBase64(await sha256(new Uint8Array(new TextEncoder().encode("abc"))))))
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256(new Uint8Array([1, 2, 3]))).not.toBe(await sha256(new Uint8Array([1, 2, 4])));
  });
});

describe("wrap / unwrap bytes", () => {
  it("round-trips raw bytes and rejects a wrong key", async () => {
    const key = await importKey("kek");
    const data = randomBytes(64);
    const wrapped = await wrapBytes(key, data);
    expect(await unwrapBytes(key, wrapped)).toEqual(data);
    await expect(unwrapBytes(await importKey("other"), wrapped)).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe("kdf params", () => {
  it("defaults to the OWASP work factor and a 16-byte salt", () => {
    const kdf = newKdfParams();
    expect(kdf.iterations).toBe(KDF_ITERATIONS);
    expect(kdf.algo).toBe("PBKDF2-SHA-256");
    expect(fromBase64(kdf.salt)).toHaveLength(16);
  });

  it("derives a stable key from the same passphrase and salt", async () => {
    const kdf = newKdfParams(FAST.iterations);
    const a = await deriveKek("pw", kdf);
    const b = await deriveKek("pw", kdf);
    const sealed = await sealText(a, "hi");
    expect(await openText(b, sealed)).toBe("hi");
  });
});

describe("vault key lifecycle", () => {
  it("unlocks the same data-encryption key with the same passphrase", async () => {
    const material = await createVaultKey("correct horse", { ...FAST, withRecovery: false });
    const first = await unlockVaultKey("correct horse", material.kdf, material.wrapped_dek);
    const second = await unlockVaultKey("correct horse", material.kdf, material.wrapped_dek);
    const sealed = await sealText(first, "the secret");
    expect(await openText(second, sealed)).toBe("the secret");
    expect(material.recovery_key).toBeNull();
    expect(material.recovery_wrapped_dek).toBeNull();
  });

  it("rejects a wrong passphrase", async () => {
    const material = await createVaultKey("correct horse", { ...FAST, withRecovery: false });
    await expect(unlockVaultKey("wrong horse", material.kdf, material.wrapped_dek)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("returns a recovery key that unlocks the same data key", async () => {
    const material = await createVaultKey("correct horse", FAST);
    expect(material.recovery_key).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/);
    const viaPass = await unlockVaultKey("correct horse", material.kdf, material.wrapped_dek);
    const viaRecovery = await unlockVaultKeyWithRecovery(material.recovery_key!, material.recovery_wrapped_dek!);
    expect(await openText(viaRecovery, await sealText(viaPass, "shared secret"))).toBe("shared secret");
  });

  it("rejects a wrong recovery key", async () => {
    const material = await createVaultKey("correct horse", FAST);
    const wrong = generateRecoveryKey();
    await expect(unlockVaultKeyWithRecovery(wrong, material.recovery_wrapped_dek!)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("changing the passphrase keeps old ciphertext and the recovery key valid", async () => {
    const material = await createVaultKey("old-pass", FAST);
    const key = await unlockVaultKey("old-pass", material.kdf, material.wrapped_dek);
    const sealed = await sealText(key, "written long ago");

    const next = await changeVaultPassphrase("old-pass", material.kdf, material.wrapped_dek, "new-pass", FAST);

    await expect(unlockVaultKey("old-pass", next.kdf, next.wrapped_dek)).rejects.toBeInstanceOf(DecryptionError);
    const reopened = await unlockVaultKey("new-pass", next.kdf, next.wrapped_dek);
    expect(await openText(reopened, sealed)).toBe("written long ago");

    const viaRecovery = await unlockVaultKeyWithRecovery(material.recovery_key!, material.recovery_wrapped_dek!);
    expect(await openText(viaRecovery, sealed)).toBe("written long ago");
  });

  it("resets a forgotten passphrase from the recovery key, keeping old ciphertext readable", async () => {
    const material = await createVaultKey("forgotten", FAST);
    const key = await unlockVaultKey("forgotten", material.kdf, material.wrapped_dek);
    const sealed = await sealText(key, "still here");

    const next = await resetPassphraseWithRecovery(material.recovery_key!, material.recovery_wrapped_dek!, "brand-new-pass", FAST);

    await expect(unlockVaultKey("forgotten", next.kdf, next.wrapped_dek)).rejects.toBeInstanceOf(DecryptionError);
    const reopened = await unlockVaultKey("brand-new-pass", next.kdf, next.wrapped_dek);
    expect(await openText(reopened, sealed)).toBe("still here");
    expect(next.kdf.salt).not.toBe(material.kdf.salt); // a fresh salt, not the old one

    // The recovery key itself is unchanged and still works.
    const again = await unlockVaultKeyWithRecovery(material.recovery_key!, material.recovery_wrapped_dek!);
    expect(await openText(again, sealed)).toBe("still here");
  });

  it("refuses to reset the passphrase with a wrong or malformed recovery key", async () => {
    const material = await createVaultKey("forgotten", FAST);
    await expect(
      resetPassphraseWithRecovery(generateRecoveryKey(), material.recovery_wrapped_dek!, "new-pass-1", FAST),
    ).rejects.toBeInstanceOf(DecryptionError);
    await expect(
      resetPassphraseWithRecovery("nope", material.recovery_wrapped_dek!, "new-pass-1", FAST),
    ).rejects.toThrow(/recovery key/i);
  });

  it("refuses to change the passphrase with the wrong old one", async () => {
    const material = await createVaultKey("old-pass", { ...FAST, withRecovery: false });
    await expect(
      changeVaultPassphrase("not-it", material.kdf, material.wrapped_dek, "new-pass", FAST),
    ).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe("recovery key formatting", () => {
  it("generates a grouped 32-character Crockford key with no ambiguous letters", () => {
    const key = generateRecoveryKey();
    const raw = key.replace(/-/g, "");
    expect(raw).toHaveLength(32);
    expect(raw).not.toMatch(/[ILOU]/);
  });

  it("normalises case, separators and ambiguous characters", () => {
    const canonical = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 Crockford characters
    const messy = "0123 4567-89ab cdef-ghjk mnpq-rstv wxyz";
    expect(normalizeRecoveryKey(messy)).toBe(canonical);
    // I and L fold onto 1; O folds onto 0
    expect(normalizeRecoveryKey("I".repeat(32))).toBe("1".repeat(32));
    expect(normalizeRecoveryKey("L".repeat(32))).toBe("1".repeat(32));
    expect(normalizeRecoveryKey("O".repeat(32))).toBe("0".repeat(32));
  });

  it("rejects characters Crockford leaves out", () => {
    expect(normalizeRecoveryKey("U".repeat(32))).toBeNull();
  });

  it("rejects the wrong length", () => {
    expect(normalizeRecoveryKey("AB")).toBeNull();
    expect(normalizeRecoveryKey("A".repeat(31))).toBeNull();
  });
});

/** Helper: a throwaway key derived from a passphrase (not the vault's DEK). */
async function importKey(passphrase: string): Promise<CryptoKey> {
  const kdf = newKdfParams(FAST.iterations);
  return deriveKek(passphrase, kdf);
}
