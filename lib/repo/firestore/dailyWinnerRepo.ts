/**
 * Implementación Firestore del repositorio de DailyWinner
 */

import { db } from "@/lib/firebase";
import { collection, doc, getDoc, addDoc, updateDoc } from "firebase/firestore";
import { IDailyWinnerRepository, DailyWinner } from "../interfaces";

export class FirestoreDailyWinnerRepository implements IDailyWinnerRepository {
  private collectionName = "dailyWinners";

  async create(winner: DailyWinner): Promise<DailyWinner> {
    const docRef = await addDoc(collection(db, this.collectionName), {
      ...winner,
      computedAt: new Date().toISOString(),
    });
    return { ...winner, id: docRef.id };
  }

  async findByDate(dateKey: string): Promise<DailyWinner | null> {
    const docRef = doc(db, this.collectionName, dateKey);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as DailyWinner;
  }

  async update(id: string, updates: Partial<DailyWinner>): Promise<DailyWinner> {
    const docRef = doc(db, this.collectionName, id);
    await updateDoc(docRef, updates);
    const updated = await getDoc(docRef);
    return { id: updated.id, ...updated.data() } as DailyWinner;
  }
}
