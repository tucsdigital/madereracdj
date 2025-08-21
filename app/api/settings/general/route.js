import { NextResponse } from "next/server";
import { aplicarCorsPublico, preflightCorsPublico, jsonPublico } from "@/lib/cors-publico";

// Fuente de sucursales (estático por ahora). radio en metros.
const sucursales = [
  { nombre: "Sucursal Centro", direccion: "Av. Siempre Viva 742", lat: -34.6037, lng: -58.3816, radio: 5000 },
];

export function OPTIONS(request) {
  return preflightCorsPublico(request);
}

export async function GET(request) {
  // Responder sin redirección, sin auth
  const locations = sucursales.map((s) => ({
    nombre: s.nombre,
    direccion: s.direccion,
    lat: s.lat,
    lng: s.lng,
    radio: s.radio,
  }));
  return jsonPublico({ locations }, {}, request);
}


