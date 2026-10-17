"use client";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lista ordenable por arrastre (con teclado también). `onMove(desde, hasta)` recibe posiciones. */
export function SortableList({ ids, onMove, grid = false, className, children }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    onMove(ids.indexOf(active.id), ids.indexOf(over.id));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={className}>{children}</div>
      </SortableContext>
    </DndContext>
  );
}

/** Elemento ordenable. `children` recibe el control de arrastre ya armado para ubicarlo donde convenga. */
export function SortableItem({ id, className, handleClassName, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      type="button"
      aria-label="Arrastrar para cambiar el orden"
      className={cn("flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-default-400 hover:bg-default-100 hover:text-default-700 active:cursor-grabbing", handleClassName)}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(className, isDragging && "relative z-10 shadow-lg")}>
      {children(handle)}
    </div>
  );
}
