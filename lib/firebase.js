import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, doc, updateDoc, getDocs, getDoc, setDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCMSCPiVGRI2doGmXsrcfXo_tux1Od0UHQ",
  authDomain: "maderascjd-86ede.firebaseapp.com",
  projectId: "maderascjd-86ede",
  storageBucket: "maderascjd-86ede.firebasestorage.app",
  messagingSenderId: "1031201083096",
  appId: "1:1031201083096:web:c95a4385b1addc134d11ad",
  measurementId: "G-D9NSY7HTT5"
  };

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const auth = getAuth(app);
export { db, auth };

export async function saveLeadToFirebase(metaLead) {
  // Si el objeto viene de Meta, debe tener los campos dentro de value
  const value = metaLead.value || metaLead;
  const leadId = value.leadgen_id;
  try {
    // Guardar exactamente como llega, más receivedAt y status
    await setDoc(doc(db, "leads", leadId), {
      ...value,
      receivedAt: metaLead.receivedAt || new Date().toISOString(),
      status: metaLead.status || "pending"
    });
    console.log("saveLeadToFirebase: Lead guardado con ID", leadId);
    return leadId;
  } catch (error) {
    console.error("saveLeadToFirebase: Error al guardar lead", error);
    throw error;
  }
}

export async function updateLeadInFirebase(id, updates) {
  const ref = doc(db, "leads", id);
  await updateDoc(ref, updates);
}

// Migración: asigna el campo 'id' a todos los leads existentes
export async function migrateLeadsSetIdField() {
  const snapshot = await getDocs(collection(db, "leads"));
  const updates = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (!data.id || data.id !== docSnap.id) {
      updates.push(updateDoc(doc(db, "leads", docSnap.id), { id: docSnap.id }));
    }
  });
  await Promise.all(updates);
  return updates.length;
}

export async function uploadMockLeads(leads) {
  for (const lead of leads) {
    const docRef = await addDoc(collection(db, "leads"), lead);
    await updateDoc(docRef, { id: docRef.id });
  }
}

export async function uploadMockVendedores(vendedores) {
  for (const vendedor of vendedores) {
    const docRef = await addDoc(collection(db, "vendedores"), vendedor);
    await updateDoc(docRef, { id: docRef.id });
  }
}

// Funciones de autenticación Firebase
export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logoutFirebase() {
  return signOut(auth);
}

export function onAuthStateChangedFirebase(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getLeadById(id) {
  const ref = doc(db, "leads", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id };
} 