export type NotariaDemo = {
  id: string;
  nombre: string;
  ciudad: string;
  direccion: string;
  lat: number;
  lng: number;
  horarios: string;
  abogadoTitular: string;
  telefono?: string;
};

export const NOTARIAS_DEMO: NotariaDemo[] = [
  {
    id: "n1",
    nombre: "Notaría Primera de Quito",
    ciudad: "Quito",
    direccion: "Av. Amazonas y Naciones Unidas (referencia demo)",
    lat: -0.1807,
    lng: -78.4678,
    horarios: "Lun–Vie 08:30–17:00 · Sáb 09:00–13:00",
    abogadoTitular: "Dr. Carlos Mendoza P.",
    telefono: "02-000-0000"
  },
  {
    id: "n2",
    nombre: "Notaría Séptima de Guayaquil",
    ciudad: "Guayaquil",
    direccion: "Av. 9 de Octubre (referencia demo)",
    lat: -2.1894,
    lng: -79.8891,
    horarios: "Lun–Vie 09:00–18:00",
    abogadoTitular: "Dra. María Fernanda Salazar",
    telefono: "04-000-0000"
  },
  {
    id: "n3",
    nombre: "Notaría Tercera de Cuenca",
    ciudad: "Cuenca",
    direccion: "Calle Larga (referencia demo)",
    lat: -2.9001,
    lng: -79.0059,
    horarios: "Lun–Vie 08:00–16:30",
    abogadoTitular: "Dr. Andrés Vega C.",
    telefono: "07-000-0000"
  }
];
