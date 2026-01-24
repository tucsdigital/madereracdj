/**
 * Implementación Firestore del repositorio de RewardClaim
 */

import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, limit, addDoc, updateDoc } from "firebase/firestore";
import { IRewardClaimRepository, RewardClaim } from "../interfaces";

export class FirestoreRewardClaimRepository implements IRewardClaimRepository {
  private collectionName = "rewardClaims";

  async create(claim: RewardClaim): Promise<RewardClaim> {
    // Filtrar campos undefined ya que Firestore no los acepta
    const dataToSave: any = {
      userId: claim.userId,
      dailySpinId: claim.dailySpinId,
      dateKey: claim.dateKey,
      rewardType: claim.rewardType,
      status: claim.status,
      createdAt: claim.createdAt || new Date().toISOString(),
    };
    
    // Solo incluir campos opcionales si no son undefined
    if (claim.rewardMetadata !== undefined) {
      dataToSave.rewardMetadata = claim.rewardMetadata;
    }
    
    if (claim.contentBlocks !== undefined) {
      dataToSave.contentBlocks = claim.contentBlocks;
    }
    
    if (claim.approvalStatus !== undefined) {
      dataToSave.approvalStatus = claim.approvalStatus;
    }
    
    if (claim.approvedAt !== undefined) {
      dataToSave.approvedAt = claim.approvedAt;
    }
    
    if (claim.expiresAt !== undefined) {
      dataToSave.expiresAt = claim.expiresAt;
    }
    
    const docRef = await addDoc(collection(db, this.collectionName), dataToSave);
    return { ...claim, id: docRef.id };
  }

  async findByUserAndDate(userId: string, dateKey: string): Promise<RewardClaim | null> {
    const q = query(
      collection(db, this.collectionName),
      where("userId", "==", userId),
      where("dateKey", "==", dateKey),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as RewardClaim;
  }

  async findByDailySpinId(spinId: string): Promise<RewardClaim | null> {
    const q = query(
      collection(db, this.collectionName),
      where("dailySpinId", "==", spinId),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as RewardClaim;
  }

  async update(id: string, updates: Partial<RewardClaim>): Promise<RewardClaim> {
    const docRef = doc(db, this.collectionName, id);
    
    // Filtrar campos undefined antes de actualizar
    const updatesToSave: any = {};
    Object.keys(updates).forEach((key) => {
      const value = (updates as any)[key];
      if (value !== undefined) {
        updatesToSave[key] = value;
      }
    });
    
    await updateDoc(docRef, updatesToSave);
    const updated = await getDoc(docRef);
    return { id: updated.id, ...updated.data() } as RewardClaim;
  }

  async getActiveSpotlight(dateKey: string): Promise<RewardClaim | null> {
    // Buscar primero por "claimed", si no hay, buscar por "used"
    // Esto evita problemas con or() que requiere índices compuestos
    let q = query(
      collection(db, this.collectionName),
      where("dateKey", "==", dateKey),
      where("rewardType", "==", "spotlight"),
      where("approvalStatus", "==", "approved"),
      where("status", "==", "claimed"),
      limit(1)
    );
    let snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      // Si no hay "claimed", buscar "used"
      q = query(
        collection(db, this.collectionName),
        where("dateKey", "==", dateKey),
        where("rewardType", "==", "spotlight"),
        where("approvalStatus", "==", "approved"),
        where("status", "==", "used"),
        limit(1)
      );
      snapshot = await getDocs(q);
    }
    
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as RewardClaim;
  }
}
