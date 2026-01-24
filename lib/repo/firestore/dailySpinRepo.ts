/**
 * Implementación Firestore del repositorio de DailySpin
 * Puede reemplazarse por Postgres/Supabase cambiando solo esta implementación
 */

import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, addDoc, setDoc } from "firebase/firestore";
import { IDailySpinRepository, DailySpin, DailyLeaderboard } from "../interfaces";
import { getCurrentDateKey } from "@/lib/daily/dateKey";

export class FirestoreDailySpinRepository implements IDailySpinRepository {
  private collectionName = "dailySpins";

  async create(spin: DailySpin): Promise<DailySpin> {
    const docRef = await addDoc(collection(db, this.collectionName), {
      ...spin,
      createdAt: new Date().toISOString(),
    });
    return { ...spin, id: docRef.id };
  }

  async findByUserAndDate(userId: string, dateKey: string): Promise<DailySpin | null> {
    const q = query(
      collection(db, this.collectionName),
      where("userId", "==", userId),
      where("dateKey", "==", dateKey),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as DailySpin;
  }

  async getLeaderboard(dateKey: string, limitCount: number = 10): Promise<DailyLeaderboard> {
    const q = query(
      collection(db, this.collectionName),
      where("dateKey", "==", dateKey),
      orderBy("score", "desc"),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    
    // Obtener total de jugadores
    const totalQuery = query(
      collection(db, this.collectionName),
      where("dateKey", "==", dateKey)
    );
    const totalSnapshot = await getDocs(totalQuery);
    const totalPlayers = totalSnapshot.size;

    const entries = snapshot.docs.map((doc, index) => {
      const data = doc.data();
      return {
        userId: data.userId,
        score: data.score,
        position: index + 1,
        tier: data.tier,
      };
    });

    return {
      dateKey,
      entries,
      totalPlayers,
    };
  }

  async getUserPosition(userId: string, dateKey: string): Promise<number | null> {
    const userSpin = await this.findByUserAndDate(userId, dateKey);
    if (!userSpin) return null;

    // Contar cuántos tienen score mayor
    const q = query(
      collection(db, this.collectionName),
      where("dateKey", "==", dateKey),
      where("score", ">", userSpin.score)
    );
    const snapshot = await getDocs(q);
    return snapshot.size + 1;
  }
}
