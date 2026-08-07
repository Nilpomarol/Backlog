import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

function getFirebaseApp() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error("Firebase browser configuration is incomplete.");
  }
  return getApps().length ? getApp() : initializeApp(config);
}

export function getFirebaseAuth() {
  const auth = getAuth(getFirebaseApp());
  auth.languageCode = "ca";
  return auth;
}

export function getFirebaseStorage() {
  const app = getFirebaseApp();
  if (!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) throw new Error("Firebase Storage is not configured.");
  return getStorage(app);
}
