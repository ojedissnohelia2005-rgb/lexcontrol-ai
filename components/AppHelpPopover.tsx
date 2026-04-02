"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

function getHelpContent(pathname: string) {
  if (pathname.startsWith("/notificaciones")) {
    return {
      title: "Centro de notificaciones",
      points: [
        "Revisa las alertas de Vigilancia legal: son pistas de normas recientes o noticias que podrían impactar al negocio.",
        "Usa “Marcar revisada” cuando ya analizaste una alerta; desaparecerá de la lista y del indicador rojo del menú.",
        "En “Posibles actualizaciones de normativa” revisa si una norma del sistema tiene una versión más reciente y, si aplica, sube la nueva desde AI Notebook.",
        "El bloque de Nuevos usuarios muestra quién se ha registrado; como super admin puedes ajustar roles desde Transparencia."
      ]
    };
  }

  if (pathname.startsWith("/ai-notebook")) {
    return {
      title: "AI Notebook: normativa y matriz",
      points: [
        "Primero selecciona un Negocio activo; la descripción del negocio aparece a la izquierda y es el contexto base de la IA.",
        "Elige el Origen de la información: la biblioteca de PDFs es la misma para todos los negocios; al mapear, la IA decide cuáles aplican al negocio activo. También puedes subir un PDF nuevo (entra a la biblioteca común).",
        "En “Normativa en memoria”, marca uno o varios PDFs y pulsa “Mapear empresa y generar sugerencias”; las filas se envían a Propuestas pendientes del negocio seleccionado.",
        "Debajo tienes Preguntas sobre normativa (Memoria): consultas sobre la biblioteca común, un PDF o todos."
      ]
    };
  }

  if (pathname.startsWith("/business")) {
    return {
      title: "Pantalla de negocio",
      points: [
        "En la parte superior puedes editar la descripción general, rubro y normativa a vigilar (solo admin/super admin). Eso alimenta a la IA.",
        "La sección de Tarea específica te deja describir un escenario muy concreto; la IA propone requisitos nuevos y los envía a Propuestas pendientes.",
        "En Actividades específicas del negocio defines procesos clave (ej. transporte de GLP) para relacionar requisitos con actividades reales.",
        "La matriz muestra Propuestas pendientes y filas aceptadas; aquí decides si aplica, quién es responsable y qué evidencia se debe cargar."
      ]
    };
  }

  if (pathname.startsWith("/dashboard")) {
    return {
      title: "Dashboard de riesgos y cumplimiento",
      points: [
        "El dashboard resume el estado de la matriz: número de requisitos, pendientes, en riesgo y cumplidos.",
        "Desde aquí puedes entrar rápido al negocio activo y revisar sus propuestas y evidencias.",
        "Los widgets te ayudan a priorizar: concéntrate primero en los requisitos con prioridad alta o impacto económico mayor."
      ]
    };
  }

  if (pathname.startsWith("/transparencia")) {
    return {
      title: "Transparencia y auditoría",
      points: [
        "Aquí ves el historial de acciones importantes (audit_log): altas de usuarios, cambios de roles, carga/eliminación de normas, etc.",
        "Sirve como bitácora de quién hizo qué y cuándo, útil para auditorías internas o externas.",
        "Los reportes de auditoría externa también se guardan aquí, junto con los riesgos que la IA detectó en cada informe."
      ]
    };
  }

  if (pathname.startsWith("/negocios")) {
    return {
      title: "Gestión de negocios",
      points: [
        "Crea nuevos negocios indicando nombre, sector y detalles; esa descripción será el contexto principal para la IA.",
        "Selecciona un negocio para trabajar su matriz, AI Notebook y notificaciones asociadas.",
        "Si eres admin/super admin, puedes eliminar un negocio que ya no se use (incluye su matriz y normativa vinculada)."
      ]
    };
  }

  // General fallback
  return {
    title: "¿Cómo usar LexControl AI?",
    points: [
      "1) Crea o elige un negocio y describe brevemente qué hace (eso alimenta a la IA).",
      "2) Sube o vincula normativa en AI Notebook para que el sistema pueda leer los PDFs.",
      "3) Usa el mapeo y las tareas específicas para que la IA genere propuestas de requisitos.",
      "4) Revisa y aprueba esas propuestas en la matriz, asignando responsables y evidencia.",
      "5) Consulta Notificaciones para vigilar cambios normativos y nuevos usuarios."
    ]
  };
}

export function AppHelpPopover() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "/";
  const help = getHelpContent(pathname);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Ayuda y recorrido"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-semibold text-sidebarRose ring-1 ring-borderSoft shadow-sm hover:bg-cream/80"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[85vw] rounded-2xl bg-white p-4 text-xs text-charcoal/80 shadow-lg ring-1 ring-borderSoft">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-sidebarRose">{help.title}</div>
            <button
              type="button"
              className="text-[10px] text-charcoal/60 hover:text-charcoal"
              onClick={() => setOpen(false)}
            >
              cerrar
            </button>
          </div>
          <ul className="space-y-2">
            {help.points.map((p, idx) => (
              <li key={idx}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

