"use client";
import TaskBoard from "@/components/task-board";
import { useLeads } from "@/hooks/useLeads";
import { useVendedores } from "@/hooks/useVendedores";

const KanbanLeads = () => {
  const { leads, loading: loadingLeads } = useLeads();
  const { vendedores, loading: loadingVendedores } = useVendedores();

  // Boards = vendedores reales
  const boards = vendedores.map((v) => ({
    id: v.id,
    title: v.nombre, // <-- importante para el Kanban
    avatar: v.avatar,
    email: v.email,
    telefono: v.telefono,
    estado: v.estado,
    leadsAsignados: v.leadsAsignados,
  }));

  // Asignar boardId según vendedor asignado en el lead
  const tasks = leads.map((lead) => ({
    ...lead,
    boardId: lead.boardId || null, // boardId debe ser el id del vendedor
    nombre: lead.nombre,
    description: lead.descripcion,
  }));

  const subTasks = [];
  const comments = [];

  const isLoading = loadingLeads || loadingVendedores;

  return (
    <>
      <div className="flex flex-wrap mb-7">
        <div className="text-xl font-medium text-default-900 flex-1">
          Kanban de Asignación de Leads a Vendedores
        </div>
      </div>
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Cargando leads y vendedores...</div>
      ) : (
        <TaskBoard
          boards={boards}
          tasks={tasks}
          subTasks={subTasks}
          comments={comments}
        />
      )}
    </>
  );
};

export default KanbanLeads; 