/** Reglas simplificadas para demo — no sustituyen asesoría legal. */

export type MateriaPlazo = "cogep" | "civil" | "administrativo" | "penal";

export type ProcedimientoPlazo = {
  id: string;
  label: string;
  diasHabiles: number;
  baseLegal: string;
  /** Materias donde aplica sin alerta */
  materiasOk: MateriaPlazo[];
};

export const PROCEDIMIENTOS_PLAZO: ProcedimientoPlazo[] = [
  {
    id: "cogep-contestacion",
    label: "Contestación de demanda (COGEP)",
    diasHabiles: 30,
    baseLegal: "COGEP — plazo ordinario de contestación (referencia demo: 30 días hábiles)",
    materiasOk: ["cogep"]
  },
  {
    id: "cogep-recurso",
    label: "Recurso de apelación (COGEP)",
    diasHabiles: 15,
    baseLegal: "COGEP — recurso de apelación (referencia demo: 15 días hábiles)",
    materiasOk: ["cogep"]
  },
  {
    id: "cc-contestacion",
    label: "Contestación de demanda (Código Civil / procedimiento civil)",
    diasHabiles: 30,
    baseLegal: "Código Civil — contestación (referencia demo)",
    materiasOk: ["civil", "cogep"]
  },
  {
    id: "coip-escrito",
    label: "Escrito de defensa / réplica (COIP — penal)",
    diasHabiles: 10,
    baseLegal: "COIP — trámite penal (referencia demo)",
    materiasOk: ["penal"]
  },
  {
    id: "admin-recurso",
    label: "Recurso administrativo (COA)",
    diasHabiles: 15,
    baseLegal: "COA — recurso (referencia demo)",
    materiasOk: ["administrativo"]
  }
];

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Suma días hábiles (lun–vie) — sin feriados ecuatorianos en demo. */
export function sumarDiasHabiles(inicio: Date, dias: number): Date {
  const d = new Date(inicio.getTime());
  let rest = dias;
  while (rest > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) rest--;
  }
  return d;
}

export function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type ResultadoPlazo = {
  ok: boolean;
  fechaLimite: string | null;
  diasHabiles: number;
  baseLegal: string;
  anomalia: string | null;
  notificarAbogado: boolean;
  mensaje: string;
};

export function calcularPlazoDemo(input: {
  materia: MateriaPlazo;
  procedimientoId: string;
  fechaInicio: string;
}): ResultadoPlazo {
  const proc = PROCEDIMIENTOS_PLAZO.find((p) => p.id === input.procedimientoId);
  const inicio = parseYmd(input.fechaInicio);
  if (!proc) {
    return {
      ok: false,
      fechaLimite: null,
      diasHabiles: 0,
      baseLegal: "",
      anomalia: "Procedimiento no reconocido.",
      notificarAbogado: true,
      mensaje: "Seleccione un tipo de trámite válido."
    };
  }
  if (!inicio) {
    return {
      ok: false,
      fechaLimite: null,
      diasHabiles: 0,
      baseLegal: proc.baseLegal,
      anomalia: "Fecha de inicio inválida.",
      notificarAbogado: true,
      mensaje: "Use formato AAAA-MM-DD."
    };
  }

  let anomalia: string | null = null;
  if (!proc.materiasOk.includes(input.materia)) {
    anomalia =
      `El trámite «${proc.label}» no coincide con la materia «${input.materia.toUpperCase()}». ` +
      `Revise COGEP / CC / COA / COIP antes de confiar en el plazo. Se notificará al abogado a cargo.`;
  }

  const fin = sumarDiasHabiles(inicio, proc.diasHabiles);
  return {
    ok: !anomalia,
    fechaLimite: formatYmd(fin),
    diasHabiles: proc.diasHabiles,
    baseLegal: proc.baseLegal,
    anomalia,
    notificarAbogado: Boolean(anomalia),
    mensaje: anomalia
      ? "Cálculo suspendido por posible anomalía normativa. Valide con el abogado a cargo."
      : `Plazo estimado: ${proc.diasHabiles} días hábiles (demo, sin feriados).`
  };
}
