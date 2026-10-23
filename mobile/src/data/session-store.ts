import "expo-sqlite/localStorage/install";
import type { SupportedStorage } from "@supabase/supabase-js";
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

// Where Supabase Auth keeps the session, refresh token included. The app's own
// storage goes into device backups and a session can outgrow what the
// Keychain reliably holds, so each item is sealed with AES-GCM in app storage
// and only its key lives in the Keychain (the Keystore on Android). The key
// stays on this device: a phone restored from a backup asks to sign in again.
// After first unlock, so a launch in the background can still read it.
const keychain = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

const keyName = (name: string) => `${name}.key`;
const sealedName = (name: string) => `${name}.sealed`;

// Before the first unlock after a restart the Keychain can't be read at all.
// That isn't the same as having no key, so nothing is replaced or deleted then.
type StoredKey = { kind: "found"; key: AESEncryptionKey } | { kind: "missing" } | { kind: "locked" };

async function readKey(name: string): Promise<StoredKey> {
  let stored: string | null;
  try {
    stored = await SecureStore.getItemAsync(keyName(name), keychain);
  } catch {
    return { kind: "locked" };
  }
  if (!stored) return { kind: "missing" };
  try {
    return { kind: "found", key: await AESEncryptionKey.import(stored, "base64") };
  } catch {
    // A damaged key opens nothing, so it is replaced like a missing one.
    return { kind: "missing" };
  }
}

async function keyToSeal(name: string) {
  const stored = await readKey(name);
  switch (stored.kind) {
    case "found":
      return stored.key;
    case "missing": {
      const key = await AESEncryptionKey.generate();
      await SecureStore.setItemAsync(keyName(name), await key.encoded("base64"), keychain);
      return key;
    }
    case "locked":
      throw new Error("The Keychain can't be read until the phone has been unlocked.");
  }
}

async function seal(name: string, value: string) {
  const sealed = await aesEncryptAsync(new TextEncoder().encode(value), await keyToSeal(name));
  localStorage.setItem(sealedName(name), await sealed.combined("base64"));
}

async function open(name: string, sealed: string) {
  const stored = await readKey(name);
  switch (stored.kind) {
    case "locked":
      // Signed out for this launch only; the session opens once the phone is unlocked.
      return null;
    case "missing":
      // A phone restored from a backup: nothing can open this copy again.
      break;
    case "found":
      try {
        return new TextDecoder().decode(await aesDecryptAsync(AESSealedData.fromCombined(sealed), stored.key));
      } catch {
        // Damaged, or sealed with a key that was since replaced.
      }
  }
  localStorage.removeItem(sealedName(name));
  return null;
}

// Earlier builds kept the session in plain app storage under its own name.
// Moving it keeps those members signed in.
async function migrate(name: string) {
  const plain = localStorage.getItem(name);
  if (plain === null) return null;
  try {
    await seal(name, plain);
  } catch {
    // The Keychain is locked: the plain copy stays until the next read.
    return plain;
  }
  localStorage.removeItem(name);
  return plain;
}

// Supabase Auth takes no lock in React Native, and two writes racing for a
// first key would seal the session with one key and keep the other.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>) {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

export const sessionStore: SupportedStorage = {
  getItem: (name) =>
    serial(() => {
      const sealed = localStorage.getItem(sealedName(name));
      return sealed === null ? migrate(name) : open(name, sealed);
    }),
  setItem: (name, value) => serial(() => seal(name, value)),
  removeItem: (name) =>
    serial(async () => {
      localStorage.removeItem(sealedName(name));
      localStorage.removeItem(name);
      await SecureStore.deleteItemAsync(keyName(name), keychain);
    }),
};
