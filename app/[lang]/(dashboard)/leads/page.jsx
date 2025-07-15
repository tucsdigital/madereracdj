"use client";
import { DataTable, columns } from "../(tables)/data-table/advanced/index";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Kanban, 
  Users, 
  TrendingUp, 
  Target,
  Plus,
  Filter,
  Download,
  Share2
} from "lucide-react";
import { useLeads } from "@/hooks/useLeads";
import { useResponsiveColumns } from "../(tables)/data-table/advanced/components/columns";

export default function LeadsPage() {
  const { leads, loading } = useLeads();
  const columns = useResponsiveColumns({
    onNameClick: (id) => `/leads/${id}`
  });
  return (
    <div className="space-y-6">
      {/* Header con título y acciones */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Administración de Leads</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona y analiza todos los leads inmobiliarios de SomosLuxGroup
          </p>
        </div>
        
      </div>

      {/* Tabla principal */}
      <div className="w-full overflow-x-auto">
        <Card className="border border-border shadow-sm sm:min-w-0">
          <CardHeader className="border-b border-border bg-muted/50">
            <CardTitle className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Lista de Leads
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Cargando leads...</div>
            ) : (
              <DataTable data={leads} columns={columns} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 