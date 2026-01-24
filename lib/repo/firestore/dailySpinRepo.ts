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
    // Filtrar campos undefined ya que Firestore no los acepta
    const dataToSave: any = {
      userId: spin.userId,
      dateKey: spin.dateKey,
      score: spin.score,
      tier: spin.tier,
      rewardType: spin.rewardType,
      createdAt: spin.createdAt || new Date().toISOString(),
    };
    
    // Solo incluir email si existe
    if (spin.email) {
      dataToSave.email = spin.email;
    }
    
    // Solo incluir alias si existe
    if (spin.alias) {
      dataToSave.alias = spin.alias;
    }
    
    // Solo incluir rewardMetadata si no es undefined
    if (spin.rewardMetadata !== undefined) {
      dataToSave.rewardMetadata = spin.rewardMetadata;
    }
    
    // Solo incluir ipAddress si existe
    if (spin.ipAddress) {
      dataToSave.ipAddress = spin.ipAddress;
    }
    
    const docRef = await addDoc(collection(db, this.collectionName), dataToSave);
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
    // Query sin orderBy para evitar requerir índice compuesto
    // Ordenaremos en memoria después
    const q = query(
      collection(db, this.collectionName),
      where("dateKey", "==", dateKey)
    );
    const snapshot = await getDocs(q);
    
    const totalPlayers = snapshot.size;

    // Ordenar en memoria por score descendente
    const allEntries = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          userId: data.userId,
          email: data.email || undefined,
          alias: data.alias || undefined,
          score: data.score || 0,
          tier: data.tier || "common",
        };
      })
      .sort((a, b) => b.score - a.score) // Ordenar descendente
      .slice(0, limitCount); // Limitar después de ordenar

    const entries = allEntries.map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));

    return {
      dateKey,
      entries,
      totalPlayers,
    };
  }

  async getUserPosition(userId: string, dateKey: string): Promise<number | null> {
    const userSpin = await this.findByUserAndDate(userId, dateKey);
    if (!userSpin) return null;

    // Obtener todos los spins del día y calcular posición en memoria
    // Esto evita requerir un índice compuesto
    const q = query(
      collection(db, this.collectionName),
      where("dateKey", "==", dateKey)
    );
    const snapshot = await getDocs(q);
    
    // Ordenar por score descendente y encontrar la posición del usuario
    const sortedSpins = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          userId: data.userId,
          score: data.score || 0,
        };
      })
      .sort((a, b) => b.score - a.score);

    const userIndex = sortedSpins.findIndex((spin) => spin.userId === userId);
    return userIndex >= 0 ? userIndex + 1 : null;
  }
}
