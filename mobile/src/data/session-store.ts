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

async function readKey(name: string) {
  const stored = await SecureStore.getItemAsync(keyName(name), keychain);
  return stored ? AESEncryptionKey.import(stored, "base64") : null;
}

async function seal(name: string, value: string) {
  let key = await readKey(name);
  if (!key) {
    key = await AESEncryptionKey.generate();
    await SecureStore.setItemAsync(keyName(name), await key.encoded("base64"), keychain);
  }
  const sealed = await aesEncryptAsync(new TextEncoder().encode(value), key);
  localStorage.setItem(sealedName(name), await sealed.combined("base64"));
}

async function open(name: string, sealed: string) {
  const key = await readKey(name);
  if (key) {
    try {
      return new TextDecoder().decode(await aesDecryptAsync(AESSealedData.fromCombined(sealed), key));
    } catch {
      // Sealed with a key this device no longer has, or damaged.
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
  await seal(name, plain);
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
