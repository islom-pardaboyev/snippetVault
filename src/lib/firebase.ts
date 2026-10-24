import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// These values identify the project; access is enforced by Auth + firestore.rules.
const firebaseConfig = {
  apiKey: "AIzaSyABnraSixEILOfrkW_9jzwsNtnRIsoU0S8",
  authDomain: "snippetvault-ed43b.firebaseapp.com",
  projectId: "snippetvault-ed43b",
  storageBucket: "snippetvault-ed43b.firebasestorage.app",
  messagingSenderId: "255328206534",
  appId: "1:255328206534:web:2e3924f26f6041076a21c7",
  measurementId: "G-YSJCCMLV9P",
};

export const projectId = firebaseConfig.projectId;
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline-first: snippets are cached in IndexedDB and writes queue while offline.
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
}
export const db = createDb();
