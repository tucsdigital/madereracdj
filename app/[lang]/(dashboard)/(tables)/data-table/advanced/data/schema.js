import { z } from "zod";

// Esquema para leads inmobiliarios recibidos desde Meta
export const leadSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  email: z.string(),
  telefono: z.string(),
  mensaje: z.string(),
  estado: z.string(),
  origen: z.string(),
  prioridad: z.string(),
  fecha: z.string(),
  proyecto: z.string(),
  vendedor: z.string().optional(),
});
