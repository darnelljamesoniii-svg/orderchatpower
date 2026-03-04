import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let adminApp: App | undefined;
let adminDb: Firestore | undefined;
let adminAuth: Auth | undefined;

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function initAdmin() {
  if (adminDb && adminAuth) return;

  if (getApps().length === 0) {
    adminApp = initializeApp({
      credential: cert({
        projectId: requireEnv('FIREBASE_ADMIN_PROJECT_ID'),
        clientEmail: requireEnv('FIREBASE_ADMIN_CLIENT_EMAIL'),
        privateKey: requireEnv('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
    adminDb = getFirestore(adminApp, 'powerdialer');
    adminDb.settings({ ignoreUndefinedProperties: true });
  } else {
    adminApp = getApps()[0]!;
    adminDb = getFirestore(adminApp, 'powerdialer');
  }
  adminAuth = getAuth(adminApp);
}

export function getAdminDb() {
  initAdmin();
  return adminDb!;
}

export function getAdminAuth() {
  initAdmin();
  return adminAuth!;
}
