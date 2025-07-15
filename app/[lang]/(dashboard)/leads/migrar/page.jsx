"use client";
import { useState } from "react";
import { migrateLeadsSetIdField, uploadMockLeads, uploadMockVendedores } from "@/lib/firebase";
import { mockLeads } from "@/mock/leads";
import { mockVendedores } from "@/mock/vendedores";

export default function MigrarLeadsPage() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleMigrate = async () => {
    setLoading(true);
    try {
      const count = await migrateLeadsSetIdField();
      setResult(`Leads migrados correctamente: ${count}`);
    } catch (e) {
      setResult(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const handleUpload = async () => {
    setLoading(true);
    setResult(null);
    try {
      console.log("Leads a subir:", mockLeads);
      console.log("Vendedores a subir:", mockVendedores);
      if (!mockLeads.length && !mockVendedores.length) {
        setResult("No hay datos ficticios para subir.");
        setLoading(false);
        return;
      }
      await uploadMockLeads(mockLeads);
      await uploadMockVendedores(mockVendedores);
      setResult("Leads y vendedores ficticios subidos correctamente.");
    } catch (e) {
      setResult(`Error: ${e.message}`);
      console.error("Error al subir datos ficticios:", e);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-xl mx-auto mt-20 p-8 border rounded shadow bg-white text-center">
      <h1 className="text-2xl font-bold mb-4">Migrar Leads (asignar campo id)</h1>
      <p className="mb-6 text-muted-foreground">
        Esta acción actualizará todos los leads existentes en Firestore para que tengan el campo <b>id</b> igual al ID real del documento.<br/>
        <b>¡Ejecuta esto solo una vez!</b>
      </p>
      <button
        className="bg-primary text-white px-6 py-2 rounded disabled:opacity-50 mr-4"
        onClick={handleMigrate}
        disabled={loading}
      >
        {loading ? "Migrando..." : "Ejecutar migración"}
      </button>
      <button
        className="bg-secondary text-black px-6 py-2 rounded disabled:opacity-50"
        onClick={handleUpload}
        disabled={loading}
      >
        {loading ? "Subiendo..." : "Subir datos ficticios"}
      </button>
      {result && <div className="mt-6 text-lg font-semibold">{result}</div>}
    </div>
  );
} 