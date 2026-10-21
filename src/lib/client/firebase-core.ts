/**
 * Firebase App + Auth singletons for the browser (no Firestore here, so modules that only need auth –
 * api.ts, session.tsx – do not pull the Firestore SDK into the initial bundle; see firebase.ts for the db).
 *
 * Config comes from NEXT_PUBLIC_FIREBASE_* (literal `process.env.X` reads so Next.js inlines them).
 * With NEXT_PUBLIC_USE_EMULATORS === "true" the Auth emulator (http://127.0.0.1:9099) is connected exactly once,
 * even across Fast Refresh module reloads (flag kept on globalThis).
 */
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
export const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";
export const FIRESTORE_EMULATOR_HOST = "127.0.0.1";
export const FIRESTORE_EMULATOR_PORT = 8080;

interface EmulatorFlags {
  auth: boolean;
  firestore: boolean;
}

type GlobalWithFlags = typeof globalThis & { __nshmFirebaseEmulators?: EmulatorFlags };

/** Process-wide record of which emulators were already connected (survives HMR). */
export function emulatorFlags(): EmulatorFlags {
  const g = globalThis as GlobalWithFlags;
  g.__nshmFirebaseEmulators ??= { auth: false, firestore: false };
  return g.__nshmFirebaseEmulators;
}

export function assertBrowser(fn: string): void {
  if (typeof window === "undefined") {
    throw new Error(`${fn}() is browser-only. Call it from an effect or event handler of a client component.`);
  }
}

function firebaseOptions(): FirebaseOptions {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (USE_EMULATORS) {
    // The emulators accept any key; keep local setups working with a sparse .env.local.
    return {
      apiKey: apiKey || "demo-api-key",
      authDomain: authDomain || "localhost",
      projectId: projectId || "demo-nshm-nennep",
      ...(appId ? { appId } : {}),
    };
  }
  if (!apiKey || !projectId || !authDomain) {
    throw new Error("Missing NEXT_PUBLIC_FIREBASE_API_KEY / _AUTH_DOMAIN / _PROJECT_ID (see .env.example).");
  }
  return { apiKey, authDomain, projectId, ...(appId ? { appId } : {}) };
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

export function getClientApp(): FirebaseApp {
  assertBrowser("getClientApp");
  app ??= getApps().length > 0 ? getApp() : initializeApp(firebaseOptions());
  return app;
}

export function getClientAuth(): Auth {
  assertBrowser("getClientAuth");
  if (!auth) {
    const a = getAuth(getClientApp());
    const flags = emulatorFlags();
    if (USE_EMULATORS && !flags.auth) {
      if (!a.emulatorConfig) connectAuthEmulator(a, AUTH_EMULATOR_URL, { disableWarnings: true });
      flags.auth = true;
    }
    a.languageCode = "vi";
    auth = a;
  }
  return auth;
}

/** Which optional social sign-in buttons are enabled (NEXT_PUBLIC_AUTH_GOOGLE / NEXT_PUBLIC_AUTH_MICROSOFT). */
export function enabledAuthProviders(): { google: boolean; microsoft: boolean } {
  return {
    google: process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true",
    microsoft: process.env.NEXT_PUBLIC_AUTH_MICROSOFT === "true",
  };
}
