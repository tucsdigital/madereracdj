"use client";
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { columns } from "../(invoice)/invoice-list/invoice-list-table/components/columns";
import { DataTable } from "../(invoice)/invoice-list/invoice-list-table/components/data-table";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

const PresupuestosPage = () => {
  const [presupuestosData, setPresupuestosData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        console.log("Cargando presupuestos desde Firebase...");
        const presupuestosSnap = await getDocs(collection(db, "presupuestos"));
        const presupuestos = presupuestosSnap.docs.map(doc => ({ 
          ...doc.data(), 
          id: doc.id,
          tipo: "presupuesto" // Asegurar que tenga el tipo correcto
        }));
        console.log("Presupuestos cargados:", presupuestos);
        setPresupuestosData(presupuestos);
      } catch (error) {
        console.error("Error al cargar presupuestos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando presupuestos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Presupuestos</h1>
          <p className="text-gray-600 mt-1">Gestiona todos tus presupuestos</p>
        </div>
        <Button variant="default" onClick={() => window.location.href = '/ventas'}>
          Crear Presupuesto
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Lista de Presupuestos</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable data={presupuestosData} columns={columns} />
        </CardContent>
      </Card>
    </div>
  );
};

export default PresupuestosPage; 