import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDf8k_-eArQasYLAT0Yg710w223iRIdUlk",
  authDomain: "maderas-caballero.firebaseapp.com",
  projectId: "maderas-caballero",
  storageBucket: "maderas-caballero.appspot.com",
  messagingSenderId: "788421556425",
  appId: "1:788421556425:web:3ff321f1b5e1ba6f427518",
  measurementId: "G-LCK3PP7QWD"
  };

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