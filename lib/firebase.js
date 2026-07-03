import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

if (typeof window !== "undefined" && !firebaseConfig.apiKey) {
  console.warn(
    "Firebase: faltan variables de entorno. Añade NEXT_PUBLIC_FIREBASE_* en .env.local (ver .env.example)"
  );
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logoutFirebase() {
  return signOut(auth);
}

export function onAuthStateChangedFirebase(callback) {
  return onAuthStateChanged(auth, callback);
}

// Subir clientes iniciales a Firestore
export async function uploadInitialClientes(clientes) {
  const snapshot = await getDocs(collection(db, "clientes"));
  if (!snapshot.empty) return; // Ya existen clientes
  for (const cliente of clientes) {
    await addDoc(collection(db, "clientes"), cliente);
  }
}

// Funciones para leads (si no se usan, se pueden eliminar)
export async function updateLeadInFirebase(leadId, data) {
  const { doc, updateDoc } = await import("firebase/firestore");
  const leadRef = doc(db, "leads", leadId);
  return updateDoc(leadRef, data);
}

export async function saveLeadToFirebase(data) {
  return addDoc(collection(db, "leads"), {
    ...data,
    createdAt: serverTimestamp(),
  });
} 