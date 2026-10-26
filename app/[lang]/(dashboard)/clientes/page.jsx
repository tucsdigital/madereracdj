"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity as ActivityIcon,
  ArrowUpRight,
  CalendarDays,
  Eye,
  FileText,
  MapPin,
  Phone,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  User,
  X,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, deleteDoc, documentId, getDocs, updateDoc, doc, limit, orderBy, or, query, startAfter, where } from "firebase/firestore";
import FormularioClienteObras from "@/components/obras/FormularioClienteObras";
import GoogleAddressInput from "@/components/ui/google-address-input";
import {
  addClienteToIdentityIndex,
  createClienteIdentityIndex,
  getClienteCuit,
  getClienteDni,
  getClienteIdentityQueryValues,
  getUniqueClienteIdentityQueryValues,
  matchesClienteSearch,
  registroMatchesCliente,
  scanMatchingCursorPage,
  normalizeClienteText,
} from "@/lib/clientes-search";

const formatActivityDate = (item) => {
  const value = item?.fecha || item?.fechaCreacion;
  if (!value) return "Fecha sin informar";
  const date = typeof value?.toDate === "function"
    ? value.toDate()
    : value instanceof Date
      ? value
      : new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const formatActivityTotal = (value) => {
  const raw = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!raw) return "—";
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount)
    ? amount.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 })
    : "—";
};

const CLIENTE_RECORD_BATCH_SIZE = 100;

const clienteRecordFilters = (cliente, identityIndex) => {
  // Tres variantes por documento limitan el OR a 23 disyunciones como máximo
  // (incluidos ID estable y referencias por snapshot), debajo del tope de 30.
  const values = getUniqueClienteIdentityQueryValues(cliente, identityIndex);
  const allCuitValues = [...new Set([...values.cuit, ...values.dni])];
  const filters = [
    where("clienteId", "==", String(cliente.id)),
    where("cliente.id", "==", String(cliente.id)),
  ];
  if (values.all.length) filters.push(where("clienteId", "in", values.all));
  if (values.dni.length) filters.push(where("cliente.dni", "in", values.dni));
  if (allCuitValues.length) filters.push(where("cliente.cuit", "in", allCuitValues));
  if (values.cuil.length) filters.push(where("cliente.cuil", "in", values.cuil));
  return filters;
};

const ClientesPage = () => {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [busquedaActiva, setBusquedaActiva] = useState("");
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [searchScanned, setSearchScanned] = useState(0);
  const [clienteCounts, setClienteCounts] = useState({});
  const [countsLoading, setCountsLoading] = useState(false);
  const [countsError, setCountsError] = useState("");
  const [clienteAEliminar, setClienteAEliminar] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("datos");
  const [activity, setActivity] = useState({
    ventas: { items: [], pageIndex: 0, hasNext: false, loading: false, error: "" },
    presupuestos: { items: [], pageIndex: 0, hasNext: false, loading: false, error: "" },
  });
  const [editCliente, setEditCliente] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const activityRequestRef = useRef(0);
  const activityPageRequestRef = useRef({ ventas: 0, presupuestos: 0 });
  const activityCursorHistoryRef = useRef({ ventas: [null], presupuestos: [null] });
  const activityLoadedClientRef = useRef("");
  const clienteCursorHistoryRef = useRef([null]);
  const pageRequestRef = useRef(0);
  const countsRequestRef = useRef(0);
  const identityIndexRef = useRef(null);
  const identityIndexPromiseRef = useRef(null);
  const identityIndexPromiseKeyRef = useRef("");
  const lang = typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "";
  const ACTIVITY_PAGE_SIZE = 10;
  const SCAN_BATCH_SIZE = 100;

  // Utilidades de validación en tiempo real
  const onlyDigits = (s) => (s || "").replace(/\D/g, "");
  const dniFor = getClienteDni;
  const cuitFor = getClienteCuit;
  const isValidEmail = (email) => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidPhone = (phone) => {
    const d = onlyDigits(phone);
    return d.length === 0 || d.length >= 8; // al menos 8 dígitos
  };
  const isValidCuit = (cuit) => {
    const d = onlyDigits(cuit);
    return d.length === 0 || d.length === 11; // CUIT de 11 dígitos
  };
  const isValidDni = (dni) => {
    const d = onlyDigits(dni);
    return d.length === 0 || (d.length >= 7 && d.length <= 9);
  };

  const fetchCollectionBatch = useCallback(async (collectionName, cursor, batchSize) => {
    const constraints = [orderBy(documentId())];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(batchSize));
    const snap = await getDocs(query(collection(db, collectionName), ...constraints));
    return snap.docs.map((snapshot) => ({
      value: { ...snapshot.data(), id: snapshot.id },
      cursor: snapshot,
    }));
  }, []);

  const loadClientesPage = useCallback(async ({ search, page, cursor, size }) => {
    const requestId = ++pageRequestRef.current;
    setLoading(true);
    setLoadError("");
    setSearchScanned(0);
    try {
      if (search) {
        const result = await scanMatchingCursorPage({
          fetchBatch: (nextCursor, batchSize) => fetchCollectionBatch("clientes", nextCursor, batchSize),
          matches: (cliente) => matchesClienteSearch(cliente, search),
          cursor,
          pageSize: size,
          batchSize: SCAN_BATCH_SIZE,
          shouldContinue: () => pageRequestRef.current === requestId,
          onBatch: (count) => {
            if (pageRequestRef.current === requestId) setSearchScanned(count);
          },
        });
        if (requestId !== pageRequestRef.current || result.cancelled) return;

        setClienteCounts({});
        setCountsLoading(true);
        setCountsError("");
        setClientes(result.items);
        setHasNextPage(result.hasNext);
        setPageIndex(page);
        clienteCursorHistoryRef.current[page] = cursor || null;
        if (result.hasNext) clienteCursorHistoryRef.current[page + 1] = result.nextCursor;
        else clienteCursorHistoryRef.current.length = page + 1;
      } else {
        const constraints = [orderBy(documentId())];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(size + 1));
        const snap = await getDocs(query(collection(db, "clientes"), ...constraints));
        if (requestId !== pageRequestRef.current) return;

        const visibleDocs = snap.docs.slice(0, size);
        const hasMore = snap.docs.length > size;
        setClienteCounts({});
        setCountsLoading(true);
        setCountsError("");
        setClientes(visibleDocs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id })));
        setHasNextPage(hasMore);
        setPageIndex(page);
        clienteCursorHistoryRef.current[page] = cursor || null;
        if (hasMore) clienteCursorHistoryRef.current[page + 1] = visibleDocs[visibleDocs.length - 1];
        else clienteCursorHistoryRef.current.length = page + 1;
      }
    } catch (error) {
      if (requestId === pageRequestRef.current) {
        setLoadError(error?.message || "No se pudieron cargar los clientes.");
      }
    } finally {
      if (requestId === pageRequestRef.current) setLoading(false);
    }
  }, [fetchCollectionBatch]);

  useEffect(() => {
    const timeoutId = setTimeout(() => setBusquedaActiva(normalizeClienteText(filtro)), 250);
    return () => clearTimeout(timeoutId);
  }, [filtro]);

  useEffect(() => {
    clienteCursorHistoryRef.current = [null];
    setPageIndex(0);
    void loadClientesPage({ search: busquedaActiva, page: 0, cursor: null, size: pageSize });
  }, [busquedaActiva, pageSize, reloadKey, loadClientesPage]);

  const loadClienteIdentityIndex = useCallback(async (targetClientes) => {
    const key = targetClientes.map((cliente) => String(cliente.id)).sort().join("|");
    if (identityIndexRef.current?.key === key) return identityIndexRef.current.index;
    if (identityIndexPromiseRef.current && identityIndexPromiseKeyRef.current === key) {
      return identityIndexPromiseRef.current;
    }

    const promise = (async () => {
      const index = createClienteIdentityIndex();
      for (const cliente of targetClientes) addClienteToIdentityIndex(index, cliente);

      // Solo consultamos documentos que comparten los identificadores de los
      // clientes visibles. `limit(100)` alcanza para detectar duplicados y
      // evita recorrer la colección completa para validar unicidad histórica.
      const candidateValues = [...new Set(targetClientes.flatMap((cliente) =>
        getClienteIdentityQueryValues(cliente).all,
      ))];
      const lookups = [];
      for (const field of ["dni", "cuit", "cuil"]) {
        for (let offset = 0; offset < candidateValues.length; offset += 30) {
          const values = candidateValues.slice(offset, offset + 30);
          if (!values.length) continue;
          lookups.push(getDocs(query(
            collection(db, "clientes"),
            where(field, "in", values),
          )));
        }
      }
      const snapshots = await Promise.all(lookups);
      for (const snapshot of snapshots) {
        for (const clienteSnap of snapshot.docs) {
          addClienteToIdentityIndex(index, { ...clienteSnap.data(), id: clienteSnap.id });
        }
      }
      return index;
    })();

    identityIndexPromiseKeyRef.current = key;
    identityIndexPromiseRef.current = promise;
    try {
      const index = await promise;
      if (identityIndexPromiseRef.current === promise) {
        identityIndexRef.current = { key, index };
        identityIndexPromiseRef.current = null;
        identityIndexPromiseKeyRef.current = "";
      }
      return index;
    } finally {
      if (identityIndexPromiseRef.current === promise) {
        identityIndexPromiseRef.current = null;
        identityIndexPromiseKeyRef.current = "";
      }
    }
  }, []);

  const fetchClienteRecordBatch = useCallback(async (collectionName, cliente, identityIndex, cursor, batchSize) => {
    const filters = clienteRecordFilters(cliente, identityIndex);
    const constraints = [or(...filters), orderBy(documentId())];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(batchSize));
    const snapshot = await getDocs(query(collection(db, collectionName), ...constraints));
    return snapshot.docs.map((recordSnap) => ({
      value: { ...recordSnap.data(), id: recordSnap.id },
      cursor: recordSnap,
    }));
  }, []);

  const loadClienteCounts = useCallback(async (targetClientes, shouldContinue) => {
    const identityIndex = await loadClienteIdentityIndex(targetClientes);
    if (!shouldContinue()) return null;

    const counts = Object.fromEntries(targetClientes.map((cliente) => [
      cliente.id,
      { presupuestos: 0, ventas: 0, obras: 0 },
    ]));
    const tasks = targetClientes.flatMap((cliente) => [
      { cliente, collectionName: "ventas", countAs: "ventas" },
      { cliente, collectionName: "presupuestos", countAs: "presupuestos" },
      { cliente, collectionName: "obras", countAs: "obras" },
    ]);
    let nextTask = 0;
    let taskError = null;

    const runTask = async ({ cliente, collectionName, countAs }) => {
      let cursor = null;
      while (shouldContinue() && !taskError) {
        const batch = await fetchClienteRecordBatch(
          collectionName,
          cliente,
          identityIndex,
          cursor,
          CLIENTE_RECORD_BATCH_SIZE,
        );
        if (!shouldContinue() || taskError) return;
        for (const { value: record } of batch) {
          if (!registroMatchesCliente(record, cliente, identityIndex)) continue;
          if (collectionName === "obras") {
            const type = String(record.tipo || "").toLowerCase();
            if (type === "presupuesto") counts[cliente.id].presupuestos += 1;
            else if (type === "obra") counts[cliente.id].obras += 1;
          } else {
            counts[cliente.id][countAs] += 1;
          }
        }
        if (batch.length < CLIENTE_RECORD_BATCH_SIZE) return;
        cursor = batch[batch.length - 1].cursor;
      }
    };

    const workers = Array.from({ length: Math.min(12, tasks.length) }, async () => {
      while (shouldContinue() && !taskError) {
        const taskIndex = nextTask;
        nextTask += 1;
        if (taskIndex >= tasks.length) return;
        try {
          await runTask(tasks[taskIndex]);
        } catch (error) {
          taskError ||= error;
        }
      }
    });
    await Promise.all(workers);
    if (taskError) throw taskError;
    return shouldContinue() ? counts : null;
  }, [fetchClienteRecordBatch, loadClienteIdentityIndex]);

  const invalidateClientIndexes = () => {
    identityIndexRef.current = null;
    identityIndexPromiseRef.current = null;
    identityIndexPromiseKeyRef.current = "";
  };

  useEffect(() => {
    const requestId = ++countsRequestRef.current;
    let active = true;
    if (clientes.length === 0) {
      setClienteCounts({});
      setCountsLoading(false);
      setCountsError("");
      return () => { active = false; };
    }

    setCountsLoading(true);
    setCountsError("");
    const loadCounts = async () => {
      try {
        const pageCounts = await loadClienteCounts(
          clientes,
          () => active && requestId === countsRequestRef.current,
        );
        if (!active || requestId !== countsRequestRef.current || !pageCounts) return;
        setClienteCounts(pageCounts);
      } catch (error) {
        if (active && requestId === countsRequestRef.current) {
          setCountsError(error?.message || "No se pudieron calcular los registros vinculados.");
          setClienteCounts({});
        }
      } finally {
        if (active && requestId === countsRequestRef.current) setCountsLoading(false);
      }
    };

    void loadCounts();
    return () => {
      active = false;
      if (requestId === countsRequestRef.current) countsRequestRef.current += 1;
    };
  }, [clientes, loadClienteCounts]);

  const loadActivityPage = useCallback(async (type, cliente, page, cursor, generation) => {
    const requestId = ++activityPageRequestRef.current[type];
    setActivity((current) => ({
      ...current,
      [type]: { ...current[type], loading: true, error: "" },
    }));
    try {
      // La verificación de DNI/CUIT consulta únicamente clientes con esos
      // valores; no vuelve a recorrer la colección completa.
      const identityIndex = await loadClienteIdentityIndex([cliente]);
      if (generation !== activityRequestRef.current || requestId !== activityPageRequestRef.current[type]) return;

      const result = await scanMatchingCursorPage({
        fetchBatch: (nextCursor, batchSize) => fetchClienteRecordBatch(type, cliente, identityIndex, nextCursor, batchSize),
        matches: (registro) => registroMatchesCliente(registro, cliente, identityIndex),
        cursor,
        pageSize: ACTIVITY_PAGE_SIZE,
        batchSize: ACTIVITY_PAGE_SIZE + 1,
        shouldContinue: () => generation === activityRequestRef.current && requestId === activityPageRequestRef.current[type],
      });
      if (generation !== activityRequestRef.current || requestId !== activityPageRequestRef.current[type] || result.cancelled) return;

      activityCursorHistoryRef.current[type][page] = cursor || null;
      if (result.hasNext) activityCursorHistoryRef.current[type][page + 1] = result.nextCursor;
      else activityCursorHistoryRef.current[type].length = page + 1;
      setActivity((current) => ({
        ...current,
        [type]: { items: result.items, pageIndex: page, hasNext: result.hasNext, loading: false, error: "" },
      }));
    } catch (error) {
      if (generation === activityRequestRef.current && requestId === activityPageRequestRef.current[type]) {
        setActivity((current) => ({
          ...current,
          [type]: { ...current[type], loading: false, error: error?.message || "No se pudo cargar la actividad." },
        }));
      }
    } finally {
      if (generation === activityRequestRef.current && requestId === activityPageRequestRef.current[type]) {
        setActivity((current) => ({ ...current, [type]: { ...current[type], loading: false } }));
      }
    }
  }, [fetchClienteRecordBatch, loadClienteIdentityIndex]);

  const loadClienteActivity = useCallback((cliente, { force = false } = {}) => {
    if (!cliente?.id) return;
    const clienteKey = String(cliente.id);
    if (!force && activityLoadedClientRef.current === clienteKey) return;

    activityLoadedClientRef.current = clienteKey;
    activityCursorHistoryRef.current = { ventas: [null], presupuestos: [null] };
    const generation = activityRequestRef.current;
    setActivity({
      ventas: { items: [], pageIndex: 0, hasNext: false, loading: true, error: "" },
      presupuestos: { items: [], pageIndex: 0, hasNext: false, loading: true, error: "" },
    });
    void loadActivityPage("ventas", cliente, 0, null, generation);
    void loadActivityPage("presupuestos", cliente, 0, null, generation);
  }, [loadActivityPage]);

  const handleDetailTabChange = (nextTab) => {
    setDetailTab(nextTab);
    if (nextTab === "actividad" && selectedCliente) loadClienteActivity(selectedCliente);
  };

  const handleVerDetalle = (cliente) => {
    activityRequestRef.current += 1;
    activityLoadedClientRef.current = "";
    activityCursorHistoryRef.current = { ventas: [null], presupuestos: [null] };
    setDetailTab("datos");
    setSelectedCliente(cliente);
    setEditCliente({ ...cliente, dni: dniFor(cliente), cuit: cuitFor(cliente), estado: cliente.estado || "Activo" });
    setEditMsg("");
    setDetalleOpen(true);
    setActivity({
      ventas: { items: [], pageIndex: 0, hasNext: false, loading: false, error: "" },
      presupuestos: { items: [], pageIndex: 0, hasNext: false, loading: false, error: "" },
    });
  };

  const handleClientesPage = (nextPage) => {
    const cursor = clienteCursorHistoryRef.current[nextPage];
    if (cursor === undefined) return;
    void loadClientesPage({ search: busquedaActiva, page: nextPage, cursor, size: pageSize });
  };

  const handleActivityPage = (type, nextPage) => {
    if (!selectedCliente) return;
    const cursor = activityCursorHistoryRef.current[type][nextPage];
    if (cursor === undefined) return;
    void loadActivityPage(type, selectedCliente, nextPage, cursor, activityRequestRef.current);
  };

  const requestDeleteCliente = (cliente) => {
    setDeleteError("");
    setClienteAEliminar(cliente);
  };

  const handleDeleteCliente = async (event) => {
    event.preventDefault();
    if (!clienteAEliminar || deleteLoading) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await deleteDoc(doc(db, "clientes", clienteAEliminar.id));
      invalidateClientIndexes();
      clienteCursorHistoryRef.current = [null];
      setClienteAEliminar(null);
      if (selectedCliente?.id === clienteAEliminar.id) {
        setDetalleOpen(false);
        setSelectedCliente(null);
      }
      setReloadKey((key) => key + 1);
    } catch (error) {
      setDeleteError(error?.message || "No se pudo eliminar la ficha del cliente.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleGuardarEdicion = async () => {
    if (!editCliente.nombre || !editCliente.direccion || !editCliente.telefono) {
      setEditMsg("Nombre, dirección y teléfono son obligatorios.");
      return;
    }
    if (!isValidDni(editCliente.dni) || !isValidCuit(editCliente.cuit)) {
      setEditMsg("Revisá el DNI (7 a 9 dígitos) y el CUIT (11 dígitos).");
      return;
    }
    setEditSaving(true);
    setEditMsg("");
    try {
      const { id: clienteId, ...clienteData } = editCliente;
      await updateDoc(doc(db, "clientes", clienteId), clienteData);
      setEditMsg("Datos actualizados correctamente.");
      const clienteActualizado = { ...clienteData, id: clienteId };
      setSelectedCliente(clienteActualizado);
      setEditCliente(clienteActualizado);
      invalidateClientIndexes();
      activityLoadedClientRef.current = "";
      setReloadKey((key) => key + 1);
      setTimeout(() => setEditMsg(""), 1200);
    } catch (e) {
      setEditMsg("Error al guardar: " + e.message);
    }
    setEditSaving(false);
  };

  return (
    <div className="mx-auto w-full space-y-6 pb-16">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Clientes</h1>
          <p className="text-sm text-default-500">Gestión de clientes de la maderera.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="h-9 shrink-0 rounded-lg">
          <Plus className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">Agregar cliente</span>
          <span className="sm:hidden">Agregar</span>
        </Button>
      </header>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-500" />
            <Input
              value={filtro}
              onChange={(event) => setFiltro(event.target.value)}
              placeholder="Buscar por nombre, documento, teléfono, email o ubicación..."
              aria-label="Buscar clientes"
              className="h-9 rounded-lg pl-9 pr-9"
            />
            {filtro && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setFiltro("")}
                className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-default-500 hover:bg-default-100 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="shrink-0 text-sm text-default-500" aria-live="polite">
            {loading
              ? busquedaActiva ? `Buscando… ${searchScanned.toLocaleString("es-AR")} revisados` : "Cargando clientes…"
              : busquedaActiva
                ? `${clientes.length} coincidencias en esta página${hasNextPage ? " o más" : ""}`
                : `${clientes.length} clientes en esta página`}
          </p>
        </div>

        {loadError ? (
          <div className="flex flex-col items-start gap-3 p-6 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-destructive">No se pudieron cargar los clientes: {loadError}</p>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>Reintentar</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <Table className="min-w-[1260px] uppercase">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="whitespace-nowrap text-xs">NOMBRE</TableHead>
                <TableHead className="whitespace-nowrap text-xs">DNI</TableHead>
                <TableHead className="whitespace-nowrap text-xs">CUIT</TableHead>
                <TableHead className="whitespace-nowrap text-xs">DIRECCIÓN</TableHead>
                <TableHead className="whitespace-nowrap text-xs">TELÉFONO</TableHead>
                <TableHead className="whitespace-nowrap text-xs">EMAIL</TableHead>
                <TableHead className="whitespace-nowrap text-center text-xs">PRESUPUESTOS</TableHead>
                <TableHead className="whitespace-nowrap text-center text-xs">VENTAS</TableHead>
                <TableHead className="whitespace-nowrap text-center text-xs">OBRAS</TableHead>
                <TableHead className="whitespace-nowrap text-right text-xs">ACCIONES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="h-24 text-center text-sm text-default-500">Cargando clientes…</TableCell></TableRow>
              ) : clientes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-28 text-center">
                    <p className="text-sm font-medium">{busquedaActiva ? "No se encontraron clientes" : "Todavía no hay clientes"}</p>
                    <p className="mt-1 text-sm text-default-500">
                      {busquedaActiva ? "Probá con otro nombre, documento, teléfono o dato de contacto." : "Los clientes que agregues aparecerán acá."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : clientes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-[220px] truncate font-medium">{c.nombre || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{dniFor(c) || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{cuitFor(c) || "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{c.direccion || c.localidad || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{c.telefono || c.celular || "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{c.email || "—"}</TableCell>
                  <TableCell className="text-center tabular-nums">
                    {countsLoading ? "…" : countsError ? "—" : (clienteCounts[c.id]?.presupuestos ?? 0)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {countsLoading ? "…" : countsError ? "—" : (clienteCounts[c.id]?.ventas ?? 0)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {countsLoading ? "…" : countsError ? "—" : (clienteCounts[c.id]?.obras ?? 0)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        color="secondary"
                        aria-label={`Ver detalle de ${c.nombre || "cliente"}`}
                        title="Ver detalle"
                        className="h-8 w-8 rounded-lg p-0"
                        onClick={() => handleVerDetalle(c)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        color="destructive"
                        aria-label={`Eliminar ficha de ${c.nombre || "cliente"}`}
                        title="Eliminar cliente"
                        className="h-8 w-8 rounded-lg p-0"
                        onClick={() => requestDeleteCliente(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-default-500">
            <label htmlFor="clientes-page-size">Filas por página</label>
            <select
              id="clientes-page-size"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="h-8 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            {busquedaActiva && !loading && (
              <span className="hidden md:inline">· {searchScanned.toLocaleString("es-AR")} clientes revisados</span>
            )}
            {countsLoading && <span className="text-xs">· Calculando vinculaciones…</span>}
            {countsError && <span className="text-xs text-destructive">· Conteos no disponibles</span>}
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-sm text-default-500">Página {pageIndex + 1}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                disabled={loading || pageIndex === 0}
                onClick={() => handleClientesPage(pageIndex - 1)}
              >Anterior</Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg"
                disabled={loading || !hasNextPage}
                onClick={() => handleClientesPage(pageIndex + 1)}
              >Siguiente</Button>
            </div>
          </div>
        </div>
      </section>

      <FormularioClienteObras
        open={open}
        onClose={() => setOpen(false)}
        onClienteGuardado={() => {
          invalidateClientIndexes();
          clienteCursorHistoryRef.current = [null];
          setPageIndex(0);
          setReloadKey((key) => key + 1);
          setOpen(false);
        }}
        mode="general"
        submitLabel="Guardar"
      />
      <AlertDialog
        open={Boolean(clienteAEliminar)}
        onOpenChange={(isOpen) => {
          if (!isOpen && !deleteLoading) {
            setClienteAEliminar(null);
            setDeleteError("");
          }
        }}
      >
        <AlertDialogContent className="rounded-xl border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la ficha de {clienteAEliminar?.nombre || "este cliente"}?</AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              Esta acción eliminará solo el documento del cliente. No borrará ventas, presupuestos ni obras; los registros históricos se conservarán, aunque dejarán de aparecer vinculados a esta ficha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {clienteAEliminar && (
            <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-default-500">
              {countsLoading
                ? "Calculando registros vinculados…"
                : countsError
                  ? "No se pudo obtener el conteo de registros vinculados."
                  : `${clienteCounts[clienteAEliminar.id]?.presupuestos ?? 0} presupuestos · ${clienteCounts[clienteAEliminar.id]?.ventas ?? 0} ventas · ${clienteCounts[clienteAEliminar.id]?.obras ?? 0} obras`}
            </p>
          )}
          {deleteError && <p className="text-sm text-destructive" role="alert">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading} variant="outline" color="secondary">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              color="destructive"
              disabled={deleteLoading}
              onClick={handleDeleteCliente}
            >
              {deleteLoading ? "Eliminando…" : "Eliminar solo la ficha"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Modal detalle cliente */}
      <Dialog
        open={detalleOpen}
        onOpenChange={(isOpen) => {
          setDetalleOpen(isOpen);
          if (!isOpen) activityRequestRef.current += 1;
        }}
      >
        <DialogContent
          hiddenCloseIcon
          className="flex h-[92vh] w-[98vw] max-w-[960px] max-h-[92vh] flex-col gap-0 overflow-hidden rounded-2xl border border-border/60 bg-card p-0 shadow-2xl outline-none focus:outline-none"
          onPointerDownOutside={(event) => {
            // El dropdown de Google Places se monta fuera del Dialog; evitar que se interprete como click afuera y cierre/interrumpa la selección.
            if (event.target?.closest?.(".pac-container")) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (event.target?.closest?.(".pac-container")) {
              event.preventDefault();
            }
          }}
        >
          <div className="flex h-[68px] shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-card px-5">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold tracking-tight">Detalle del cliente</DialogTitle>
              <p className="mt-1 text-xs text-default-500">Datos, actividad y contacto</p>
            </div>
            <DialogClose asChild>
              <button type="button" aria-label="Cerrar" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-default-500 transition-colors hover:bg-default-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30">
                <X className="h-4 w-4" />
              </button>
            </DialogClose>
          </div>
          {selectedCliente && editCliente && (
            <Tabs value={detailTab} onValueChange={handleDetailTabChange} className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-border/60 bg-muted/20 px-5 pt-4">
                <div className="mb-4 flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-semibold text-primary">
                    {String(editCliente.nombre || "?").trim().slice(0, 1).toLocaleUpperCase("es-AR")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold leading-tight">{String(editCliente.nombre || "Cliente")}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-default-500">
                      {editCliente.telefono && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{editCliente.telefono}</span>}
                      {editCliente.direccion && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{editCliente.direccion}</span></span>}
                    </div>
                  </div>
                  <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${editCliente.estado === "Activo" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {editCliente.estado === "Activo" ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <TabsList className="grid h-11 w-full grid-cols-2 gap-1 rounded-none bg-transparent p-0">
                  <TabsTrigger value="datos" className="gap-2 rounded-t-lg rounded-b-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-card data-[state=active]:shadow-none">
                    <User className="h-4 w-4" /> Datos
                  </TabsTrigger>
                  <TabsTrigger value="actividad" className="gap-2 rounded-t-lg rounded-b-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-card data-[state=active]:shadow-none">
                    <ActivityIcon className="h-4 w-4" /> Actividad
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="datos" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
                  <div className="space-y-8 py-6">
                    {/* Datos personales + Datos de contacto (lado a lado en desktop) */}
                    <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
                      {/* Datos personales */}
                      <section className="space-y-4 border-b border-border/70 pb-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><User className="h-4 w-4" /></div>
                          <div><h4 className="text-sm font-semibold text-foreground">Datos personales</h4><p className="mt-0.5 text-xs text-default-500">Identificación del cliente</p></div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="nombre">Nombre *</Label>
                            <Input
                              id="nombre"
                              placeholder="Nombre y apellido del cliente"
                              className="h-10 w-full rounded-lg"
                              value={editCliente.nombre || ""}
                              onChange={(e) => setEditCliente((c) => ({ ...c, nombre: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="dni">DNI</Label>
                            <Input
                              id="dni"
                              placeholder="Ej: 30123456"
                              inputMode="numeric"
                              className={`h-10 w-full rounded-lg ${!isValidDni(editCliente.dni) ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                              value={editCliente.dni || ""}
                              onChange={(e) => setEditCliente((c) => ({ ...c, dni: e.target.value }))}
                            />
                            {!isValidDni(editCliente.dni) && <p className="mt-1 text-xs text-red-600">El DNI debe tener entre 7 y 9 dígitos.</p>}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="cuit">CUIT (opcional)</Label>
                            <Input
                              id="cuit"
                              placeholder="Ej: 20301234567"
                              inputMode="numeric"
                              className={`h-10 w-full rounded-lg ${!isValidCuit(editCliente.cuit) ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                              value={editCliente.cuit || ""}
                              onChange={(e) => setEditCliente((c) => ({ ...c, cuit: e.target.value }))}
                            />
                            {!isValidCuit(editCliente.cuit) && <p className="mt-1 text-xs text-red-600">El CUIT debe tener 11 dígitos.</p>}
                          </div>
                        </div>
                      </section>

                      {/* Datos de contacto */}
                      <section className="space-y-4 border-b border-border/70 pb-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300"><Phone className="h-4 w-4" /></div>
                          <div><h4 className="text-sm font-semibold text-foreground">Datos de contacto</h4><p className="mt-0.5 text-xs text-default-500">Canales para comunicarse</p></div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1 mb-1">
                              <Label htmlFor="telefono">Teléfono *</Label>
                            </div>
                            <Input
                              id="telefono"
                              placeholder="Ej: 1156781234"
                              inputMode="numeric"
                              className={`h-10 w-full rounded-lg ${!isValidPhone(editCliente.telefono) ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                              value={editCliente.telefono || ""}
                              onChange={(e) => setEditCliente((c) => ({ ...c, telefono: e.target.value }))}
                              aria-invalid={!isValidPhone(editCliente.telefono)}
                            />
                            {!isValidPhone(editCliente.telefono) && (
                              <p className="mt-1 text-xs text-red-600">El teléfono debe tener al menos 8 dígitos.</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                              id="email"
                              type="email"
                              placeholder="ejemplo@correo.com"
                              className={`h-10 w-full rounded-lg ${!isValidEmail(editCliente.email) ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                              value={editCliente.email || ""}
                              onChange={(e) => setEditCliente((c) => ({ ...c, email: e.target.value }))}
                              aria-invalid={!isValidEmail(editCliente.email)}
                            />
                            {!isValidEmail(editCliente.email) && (
                              <p className="mt-1 text-xs text-red-600">Formato de correo inválido.</p>
                            )}
                          </div>
                        </div>
                      </section>
                    </div>

                    {/* Ubicación */}
                    <section className="space-y-4 border-b border-border/70 pb-7">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><MapPin className="h-4 w-4" /></div>
                        <div><h4 className="text-sm font-semibold text-foreground">Ubicación</h4><p className="mt-0.5 text-xs text-default-500">Dirección y referencias del domicilio</p></div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="direccion">Dirección *</Label>
                          <GoogleAddressInput
                            id="direccion"
                            placeholder="Calle, número, piso..."
                            className="h-10 w-full rounded-lg"
                            value={editCliente.direccion || ""}
                            onChange={({ address, locality, lat, lng, mapsUrl }) =>
                              setEditCliente((c) => ({
                                ...c,
                                direccion: address,
                                localidad: locality || c.localidad,
                                lat,
                                lng,
                                mapsUrl,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="localidad">Localidad</Label>
                          <Input
                            id="localidad"
                            placeholder="Ej: La Plata"
                            className="h-10 w-full rounded-lg"
                            value={editCliente.localidad || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, localidad: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="partido">Partido</Label>
                          <Input
                            id="partido"
                            placeholder="Ej: La Plata"
                            className="h-10 w-full rounded-lg"
                            value={editCliente.partido || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, partido: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="barrio">Barrio</Label>
                          <Input
                            id="barrio"
                            placeholder="Ej: Centro"
                            className="h-10 w-full rounded-lg"
                            value={editCliente.barrio || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, barrio: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="area">Área</Label>
                          <Input
                            id="area"
                            placeholder="Ej: Manzana 3"
                            className="h-10 w-full rounded-lg"
                            value={editCliente.area || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, area: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lote">Lote</Label>
                          <Input
                            id="lote"
                            placeholder="Ej: 12"
                            className="h-10 w-full rounded-lg"
                            value={editCliente.lote || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, lote: e.target.value }))}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Información adicional */}
                    <section className="space-y-4 pb-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300"><FileText className="h-4 w-4" /></div>
                        <div><h4 className="text-sm font-semibold text-foreground">Información adicional</h4><p className="mt-0.5 text-xs text-default-500">Preferencias y notas internas</p></div>
                      </div>
                      <div className="grid grid-cols-1 gap-y-2">
                        <div className="flex items-center justify-between gap-3 border-b border-border/60 py-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">Estado</p>
                            <p className="text-xs text-muted-foreground">Activa o desactiva al cliente</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${editCliente.estado === 'Activo' ? 'text-green-600' : 'text-muted-foreground'}`}>{editCliente.estado === 'Activo' ? 'Activo' : 'Inactivo'}</span>
                            <Switch
                              color="success"
                              checked={editCliente.estado === "Activo"}
                              onCheckedChange={(checked) => setEditCliente((c) => ({ ...c, estado: checked ? "Activo" : "Inactivo" }))}
                              aria-label="Cambiar estado"
                            />
                          </div>
                        </div>

                        <div className="space-y-2 pt-3">
                          <Label htmlFor="descripcion">Descripción</Label>
                          <Textarea
                            id="descripcion"
                            placeholder="Notas, preferencias, referencias..."
                            className="w-full rounded-lg"
                            rows={3}
                            value={editCliente.descripcion || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, descripcion: e.target.value }))}
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                  {editMsg && (
                    <div className={`rounded-xl border p-3 text-sm ${
                      editMsg.startsWith("Error")
                        ? "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
                        : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    }`} role="status">
                      {editMsg}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-card px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">ID del cliente</p>
                    <p className="max-w-[45vw] truncate text-xs font-medium text-foreground sm:max-w-[360px]">{selectedCliente.id}</p>
                  </div>
                  <Button
                    onClick={handleGuardarEdicion}
                    disabled={editSaving || !editCliente.nombre || !editCliente.direccion || !editCliente.telefono}
                    className="h-9 shrink-0 gap-2 rounded-lg px-4 shadow-sm"
                  >
                    <Save className="h-4 w-4" />
                    {editSaving ? "Guardando…" : "Guardar cambios"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="actividad" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                <div className="h-full overflow-y-auto overscroll-contain px-5 py-5">
                <section className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Actividad del cliente</h3>
                      <p className="mt-1 text-sm text-default-500">Ventas y presupuestos vinculados a esta ficha.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg"
                      disabled={activity.ventas.loading || activity.presupuestos.loading}
                      onClick={() => loadClienteActivity(selectedCliente, { force: true })}
                    >
                      Actualizar actividad
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      { label: "Ventas", value: clienteCounts[selectedCliente.id]?.ventas, icon: ShoppingCart },
                      { label: "Presupuestos", value: clienteCounts[selectedCliente.id]?.presupuestos, icon: FileText },
                      { label: "Obras", value: clienteCounts[selectedCliente.id]?.obras, icon: MapPin },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
                        <div>
                          <p className="text-xs text-default-500">{label}</p>
                          <p className="text-lg font-semibold tabular-nums">{countsLoading ? "…" : countsError ? "—" : (value ?? 0)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* Ventas */}
                    <div className="flex min-h-[320px] flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300"><ShoppingCart className="h-4 w-4" /></div>
                        <div><h4 className="text-sm font-semibold text-foreground">Ventas</h4><p className="text-xs text-default-500">Operaciones registradas</p></div>
                      </div>
                      {activity.ventas.loading ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-sm text-default-500"><span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />Cargando ventas…</div>
                      ) : activity.ventas.error ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center"><p className="text-sm text-destructive">{activity.ventas.error}</p><Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => loadClienteActivity(selectedCliente, { force: true })}>Reintentar</Button></div>
                      ) : activity.ventas.items.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center"><ShoppingCart className="mb-2 h-6 w-6 text-default-500/70" /><p className="text-sm font-medium">Todavía no hay ventas</p><p className="mt-1 text-xs text-default-500">Cuando se registren, aparecerán acá.</p></div>
                      ) : (
                        <ul className="flex-1 divide-y divide-border/70">
                          {activity.ventas.items.map(v => (
                            <li key={v.id} className="flex items-center justify-between gap-3 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">Pedido {v.numeroPedido || v.id}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatActivityDate(v)}</span>
                                  <span className="font-semibold text-primary">{formatActivityTotal(v.total)}</span>
                                </div>
                              </div>
                              <Link href={`/${lang}/ventas/${v.id}`} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">Ver <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto flex items-center justify-between border-t border-border/70 pt-3">
                        <span className="text-xs text-default-500">Página {activity.ventas.pageIndex + 1}</span>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg px-2.5 text-xs" disabled={activity.ventas.loading || activity.ventas.pageIndex === 0} onClick={() => handleActivityPage("ventas", activity.ventas.pageIndex - 1)}>Anterior</Button>
                          <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg px-2.5 text-xs" disabled={activity.ventas.loading || !activity.ventas.hasNext} onClick={() => handleActivityPage("ventas", activity.ventas.pageIndex + 1)}>Siguiente</Button>
                        </div>
                      </div>
                    </div>
                    {/* Presupuestos */}
                    <div className="flex min-h-[320px] flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300"><FileText className="h-4 w-4" /></div>
                        <div><h4 className="text-sm font-semibold text-foreground">Presupuestos</h4><p className="text-xs text-default-500">Propuestas asociadas</p></div>
                      </div>
                      {activity.presupuestos.loading ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-sm text-default-500"><span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />Cargando presupuestos…</div>
                      ) : activity.presupuestos.error ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center"><p className="text-sm text-destructive">{activity.presupuestos.error}</p><Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => loadClienteActivity(selectedCliente, { force: true })}>Reintentar</Button></div>
                      ) : activity.presupuestos.items.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center"><FileText className="mb-2 h-6 w-6 text-default-500/70" /><p className="text-sm font-medium">Todavía no hay presupuestos</p><p className="mt-1 text-xs text-default-500">Cuando se registren, aparecerán acá.</p></div>
                      ) : (
                        <ul className="flex-1 divide-y divide-border/70">
                          {activity.presupuestos.items.map(p => (
                            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">Pedido {p.numeroPedido || p.id}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatActivityDate(p)}</span>
                                  <span className="font-semibold text-primary">{formatActivityTotal(p.total)}</span>
                                </div>
                              </div>
                              <Link href={`/${lang}/presupuestos/${p.id}`} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">Ver <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto flex items-center justify-between border-t border-border/70 pt-3">
                        <span className="text-xs text-default-500">Página {activity.presupuestos.pageIndex + 1}</span>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg px-2.5 text-xs" disabled={activity.presupuestos.loading || activity.presupuestos.pageIndex === 0} onClick={() => handleActivityPage("presupuestos", activity.presupuestos.pageIndex - 1)}>Anterior</Button>
                          <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg px-2.5 text-xs" disabled={activity.presupuestos.loading || !activity.presupuestos.hasNext} onClick={() => handleActivityPage("presupuestos", activity.presupuestos.pageIndex + 1)}>Siguiente</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientesPage; 
