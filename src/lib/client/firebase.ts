/**
 * Browser Firebase singletons: `getClientApp()`, `getClientAuth()`, `getClientDb()`.
 *
 * - Browser-only: each getter throws when called during SSR – call them from effects/event handlers.
 * - NEXT_PUBLIC_USE_EMULATORS === "true" → Auth emulator http://127.0.0.1:9099 and Firestore emulator
 *   127.0.0.1:8080, each connected exactly once.
 * - Firestore is used by the browser ONLY to listen to `meta/versions` (see firestore.rules);
 *   all business data goes through `api` (src/lib/client/api.ts).
 */
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import {
  assertBrowser,
  emulatorFlags,
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  getClientApp,
  USE_EMULATORS,
} from "./firebase-core";

export { getClientApp, getClientAuth, enabledAuthProviders, USE_EMULATORS } from "./firebase-core";

let db: Firestore | undefined;

export function getClientDb(): Firestore {
  assertBrowser("getClientDb");
  if (!db) {
    const d = getFirestore(getClientApp());
    const flags = emulatorFlags();
    if (USE_EMULATORS && !flags.firestore) {
      connectFirestoreEmulator(d, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
      flags.firestore = true;
    }
    db = d;
  }
  return db;
}
