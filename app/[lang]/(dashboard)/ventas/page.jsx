"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  columnsPresupuestos,
  columnsVentas,
} from "../(invoice)/invoice-list/invoice-list-table/components/columns-enhanced";
import { DataTableEnhanced } from "@/components/ui/data-table-enhanced";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { Loader2, CheckCircle, AlertCircle, Trash2, X, AlertTriangle, Info } from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where,
  limit,
  orderBy,
  startAfter,
  onSnapshot,
} from "firebase/firestore";
import { useRouter, useParams } from "next/navigation";
import { Icon } from "@iconify/react";
import { useAuth } from "@/provider/auth.provider";
import { computeTotals } from "@/lib/pricing";

// FormularioVentaPresupuesto movido a components/ventas/FormularioVentaPresupuesto.jsx

const VentasPage = () => {
  const { user } = useAuth();
  const [ventasData, setVentasData] = useState([]);
  const [presupuestosData, setPresupuestosData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteType, setDeleteType] = useState("");
  const router = useRouter();
  const params = useParams();
  const { lang } = params;

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [ventasSnap, presupuestosSnap] = await Promise.all([
          getDocs(collection(db, "ventas")),
          getDocs(collection(db, "presupuestos")),
        ]);
        setVentasData(ventasSnap.docs.map((d) => ({ ...d.data(), id: d.id })));
        setPresupuestosData(presupuestosSnap.docs.map((d) => ({ ...d.data(), id: d.id })));
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Función para mostrar el diálogo de confirmación
  const showDeleteConfirmation = (id, type, itemName) => {
    setItemToDelete({ id, name: itemName });
    setDeleteType(type);
    setShowDeleteDialog(true);
  };

  // Función para confirmar la eliminación
  const confirmDelete = async () => {
    if (!itemToDelete || !user) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleting(true);
      setDeleteMessage("");

      const response = await fetch('/api/delete-document', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: itemToDelete.id,
          collectionName: deleteType === 'venta' ? 'ventas' : 'presupuestos',
          userId: user.uid,
          userEmail: user.email
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Error al eliminar ${deleteType}`);
      }

      const result = await response.json();
      
      // Actualizar la lista local
      if (deleteType === 'venta') {
        setVentasData(prev => prev.filter(v => v.id !== itemToDelete.id));
      } else {
        setPresupuestosData(prev => prev.filter(p => p.id !== itemToDelete.id));
      }
      
      setDeleteMessage(`✅ ${result.message}`);
      
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setDeleteMessage(""), 3000);

    } catch (error) {
      console.error(`Error al eliminar ${deleteType}:`, error);
      setDeleteMessage(`❌ Error: ${error.message}`);
      
      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setDeleteMessage(""), 5000);
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
      setItemToDelete(null);
    }
  };

  // Event listeners para los botones de borrado
  useEffect(() => {
    const handleDeletePresupuestoEvent = (event) => {
      const presupuesto = presupuestosData.find(p => p.id === event.detail.id);
      if (presupuesto) {
        showDeleteConfirmation(event.detail.id, 'presupuesto', presupuesto.cliente?.nombre || 'Presupuesto');
      }
    };

    const handleDeleteVentaEvent = (event) => {
      const venta = ventasData.find(v => v.id === event.detail.id);
      if (venta) {
        showDeleteConfirmation(event.detail.id, 'venta', venta.cliente?.nombre || 'Venta');
      }
    };

    window.addEventListener('deletePresupuesto', handleDeletePresupuestoEvent);
    window.addEventListener('deleteVenta', handleDeleteVentaEvent);

    return () => {
      window.removeEventListener('deletePresupuesto', handleDeletePresupuestoEvent);
      window.removeEventListener('deleteVenta', handleDeleteVentaEvent);
    };
  }, [presupuestosData, ventasData]);

  return (
    <div className="flex flex-col gap-8 py-8 mx-auto font-sans">
      {/* Mensaje de estado del borrado */}
      {deleteMessage && (
        <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-base font-medium shadow-lg border transition-all duration-500 ${
          deleteMessage.startsWith('✅') 
            ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-800 shadow-green-100" 
            : "bg-gradient-to-r from-red-50 to-rose-50 border-red-200 text-red-800 shadow-red-100"
        }`}>
          {deleteMessage.startsWith('✅') ? (
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          )}
          <span className="font-semibold">{deleteMessage}</span>
        </div>
      )}

          {/* Botones de acción mejorados */}
    <div className="flex justify-between gap-4 mb-8 px-2">
      <div>
          <Button
          variant="default"
          className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 text-base font-semibold rounded-xl shadow-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all duration-300 transform hover:scale-105 hover:shadow-xl"
          onClick={() => router.push(`/${lang}/presupuestos/create`)}
            disabled={deleting}
          >
            <Icon
            icon="heroicons:document-plus"
            className="w-5 h-5"
            />
          <span className="hidden sm:inline">Crear Presupuesto</span>
          <span className="sm:hidden">Presupuesto</span>
          </Button>
        </div>
      <div>
          <Button
            variant="default"
          className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 text-base font-semibold rounded-xl shadow-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 transition-all duration-300 transform hover:scale-105 hover:shadow-xl"
            onClick={() => router.push(`/${lang}/ventas/create`)}
            disabled={deleting}
          >
            <Icon
              icon="heroicons:shopping-cart"
            className="w-5 h-5"
            />
          <span className="hidden sm:inline">Crear Venta</span>
            <span className="sm:hidden">Venta</span>
          </Button>
        </div>
      </div>

          {/* Tablas mejoradas */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-2">
      {/* Tabla de Presupuestos - IZQUIERDA */}
      <Card className="rounded-2xl shadow-2xl border-0 bg-gradient-to-br from-white to-gray-50/50 overflow-hidden">
        <CardHeader className="pb-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-2xl">
          <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <Icon
                icon="heroicons:document-text"
                className="w-7 h-7 text-white"
              />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">Presupuestos</div>
              <div className="text-sm font-medium text-gray-600">Gestión de cotizaciones</div>
            </div>
              {deleting && (
                <div className="flex items-center gap-2 ml-auto">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                </div>
                <span className="text-sm font-medium text-blue-600">Procesando...</span>
                </div>
              )}
            </CardTitle>
          </CardHeader>
        <CardContent className="pt-6 p-0">
          <div className="overflow-hidden rounded-b-2xl">
            <DataTableEnhanced 
              data={presupuestosData} 
              columns={columnsPresupuestos}
              searchPlaceholder="Buscar presupuestos..."
              className="border-0"
              defaultSorting={[{ id: "numeroPedido", desc: true }]}
              onRowClick={(presupuesto) => {
                router.push(`/${lang}/presupuestos/${presupuesto.id}`);
              }}
              compact={true}
            />
          </div>
          </CardContent>
        </Card>

      {/* Tabla de Ventas - DERECHA */}
      <Card className="rounded-2xl shadow-2xl border-0 bg-gradient-to-br from-white to-emerald-50/50 overflow-hidden">
        <CardHeader className="pb-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-t-2xl">
          <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
              <Icon
                icon="heroicons:shopping-cart"
                className="w-7 h-7 text-white"
              />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">Ventas</div>
              <div className="text-sm font-medium text-gray-600">Transacciones realizadas</div>
            </div>
              {deleting && (
                <div className="flex items-center gap-2 ml-auto">
                <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                </div>
                <span className="text-sm font-medium text-emerald-600">Procesando...</span>
                </div>
              )}
            </CardTitle>
          </CardHeader>
        <CardContent className="pt-6 p-0">
          <div className="overflow-hidden rounded-b-2xl">
            <DataTableEnhanced 
              data={ventasData} 
              columns={columnsVentas}
              searchPlaceholder="Buscar ventas..."
              className="border-0"
              defaultSorting={[{ id: "numeroPedido", desc: true }]}
              onRowClick={(venta) => {
                router.push(`/${lang}/ventas/${venta.id}`);
              }}
              compact={true}
            />
          </div>
          </CardContent>
        </Card>
      </div>

      {/* Diálogo de confirmación de eliminación mejorado */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="w-[95vw] max-w-md rounded-2xl border-0 shadow-2xl bg-white">
          <DialogHeader className="text-center pb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Confirmar Eliminación
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              ¿Estás seguro de que quieres eliminar este {deleteType === 'venta' ? 'venta' : 'presupuesto'}?
            </DialogDescription>
          </DialogHeader>

          <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-xl p-4 mb-6 border border-red-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Info className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-red-800">
                  {itemToDelete?.name || 'Elemento'}
                </div>
                <div className="text-sm text-red-700">
                  {deleteType === 'venta' 
                    ? 'Esta acción eliminará la venta y restaurará el stock de productos.'
                    : 'Esta acción eliminará el presupuesto permanentemente.'
                  }
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="w-full sm:w-auto px-6 py-3 rounded-xl border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium"
              disabled={deleting}
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-lg hover:shadow-xl transition-all duration-200 font-medium transform hover:scale-105"
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VentasPage;