"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { money } from "@/components/comercio/shared";

// La paleta se lee de los tokens CSS del documento, no de literales: los graficos
// responden asi al tema de la app (html.dark) y al contraste alto. Recharts pinta
// atributos SVG, donde var() no se resuelve, por eso el color se materializa aqui.
function channel(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function rgbToken(name: string, fallback: string) {
  return `rgb(${channel(name, fallback).replace(/\s+/g, ", ")})`;
}

function rgbaToken(name: string, fallback: string, alpha: number) {
  return `rgba(${channel(name, fallback).split(/\s+/).filter(Boolean).join(", ")}, ${alpha})`;
}

const triplet = (value: string) => value.split(/\s+/).filter(Boolean).map(Number);

// Los tokens de color se eligieron para texto grande y pueden quedar bajo 3:1 como trazo
// segun el fondo (el azul de informacion sobre superficie oscura, el verde sobre blanca).
// El matiz del token se conserva: se aclara hacia blanco en fondo oscuro y se oscurece en claro,
// en lugar de fijar un hex literal por tema.
function readable(name: string, fallback: string) {
  const parts = triplet(channel(name, fallback));
  const surface = triplet(channel("--surface", "255 255 255"));
  const lightness = (0.299 * surface[0] + 0.587 * surface[1] + 0.114 * surface[2]) / 255;
  if (lightness < 0.55) return `rgb(${parts.map((value) => Math.round(value + (255 - value) * 0.45)).join(", ")})`;
  return `rgb(${parts.map((value) => Math.round(value * 0.72)).join(", ")})`;
}

function buildPalette() {
  return {
    grid: rgbaToken("--color-line", "229 231 235", 0.55),
    text: rgbToken("--text-muted", "102 112 133"),
    strong: rgbToken("--text-strong", "23 33 43"),
    apex: rgbToken("--color-apex", "15 118 110"),
    apexSoft: rgbaToken("--color-apex", "15 118 110", 0.28),
    success: readable("--color-success", "34 197 94"),
    info: readable("--color-info", "37 99 235"),
    muted: rgbToken("--text-subtle", "102 112 133"),
    tooltip: {
      background: rgbToken("--surface", "255 255 255"),
      border: `1px solid ${rgbaToken("--color-line", "229 231 235", 0.9)}`,
      color: rgbToken("--text-strong", "23 33 43"),
      borderRadius: 10,
      fontSize: 12,
      transition: "none",
    },
  };
}

type Palette = ReturnType<typeof buildPalette>;

// Empezamos sin paleta: el servidor y la primera pintura del cliente coinciden y el
// efecto la resuelve contra el tema real del documento (evita discrepancia de hidratacion).
function useChartPalette() {
  const [palette, setPalette] = useState<Palette | null>(null);
  useEffect(() => {
    // El tema y el contraste viven como atributos del <html>.
    const sync = () => setPalette(buildPalette());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-contrast"] });
    return () => observer.disconnect();
  }, []);
  return palette;
}

const compact = (value: number) => new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);

// Recharts pasa la geometria de cada barra al renderer de etiqueta (el formatter del objeto
// label no recibe el valor), asi que el importe se dibuja pegado al borde derecho.
function endLabel(fill: string) {
  const BarValueLabel = (props: { x?: number; y?: number; width?: number; height?: number; value?: number | string }) => {
    const x = Number(props.x ?? 0) + Number(props.width ?? 0) + 6;
    const y = Number(props.y ?? 0) + Number(props.height ?? 0) / 2 + 4;
    return <text fill={fill} fontSize={11} x={x} y={y}>{compact(Number(props.value) || 0)}</text>;
  };
  BarValueLabel.displayName = "BarValueLabel";
  return BarValueLabel;
}

// Un solo suscriptor al tema por grafico y la misma reserva de alto con y sin paleta,
// para que la tarjeta no salte cuando cambia el tema.
// Ninguna serie anima: al cambiar de rango el importe debe quedar legible de inmediato,
// no despues de la reproducion de la animacion.
function ChartShell({ height, children }: { children: (palette: Palette) => ReactElement; height: string }) {
  const palette = useChartPalette();
  return (
    <div className={`w-full ${height}`}>
      {palette ? <ResponsiveContainer width="100%" height="100%">{children(palette)}</ResponsiveContainer> : null}
    </div>
  );
}

// Promedio movil de 7 dias: la lectura util es la tendencia, no el pico suelto de un dia.
function withTrend(rows: { date: string; total: number }[]) {
  return rows.map((row, index) => {
    const slice = rows.slice(Math.max(0, index - 6), index + 1);
    return { ...row, tendencia: slice.reduce((sum, item) => sum + item.total, 0) / slice.length };
  });
}

export function SalesTrendChart({ data }: { data: { date: string; total: number }[] }) {
  const rows = useMemo(() => withTrend(data), [data]);
  return (
    <ChartShell height="h-[300px]">
      {(palette) => (
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="comercioSales" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={palette.apex} stopOpacity={0.45} />
              <stop offset="100%" stopColor={palette.apex} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={16} tick={{ fill: palette.text, fontSize: 11 }}
            tickFormatter={(value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`} />
          <YAxis axisLine={false} tickLine={false} width={56} tick={{ fill: palette.text, fontSize: 11 }} tickFormatter={(value: number) => compact(value)} />
          <Tooltip contentStyle={palette.tooltip} labelFormatter={(label: string) => `Dia ${label}`}
            formatter={(value: number | string, name: string) => [money(Number(value)), name === "tendencia" ? "Promedio 7 dias" : "Ventas del dia"]} />
          <Area isAnimationActive={false} type="monotone" dataKey="total" stroke={palette.apex} strokeWidth={2.5} fill="url(#comercioSales)" name="total" />
          {rows.length > 2 ? <Line isAnimationActive={false} type="monotone" dataKey="tendencia" stroke={palette.info} strokeWidth={2} strokeDasharray="5 4" dot={false} name="tendencia" /> : null}
        </ComposedChart>
      )}
    </ChartShell>
  );
}

export function CashMethodChart({ data }: { data: { method: string; total: number }[] }) {
  return (
    <ChartShell height="h-[240px]">
      {(palette) => {
        const colors = [palette.apex, palette.info, palette.success, palette.muted];
        return (
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }}>
            <CartesianGrid stroke={palette.grid} horizontal={false} />
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: palette.text, fontSize: 11 }} tickFormatter={(value: number) => compact(value)} />
            <YAxis type="category" dataKey="method" width={96} axisLine={false} tickLine={false} tick={{ fill: palette.text, fontSize: 11 }} />
            <Tooltip contentStyle={palette.tooltip} formatter={(value: number | string) => [money(Number(value)), "Recaudo"]} />
            <Bar isAnimationActive={false} barSize={22} dataKey="total" label={endLabel(palette.strong)} radius={[0, 6, 6, 0]}>
              {data.map((row, index) => <Cell fill={colors[index % colors.length]} key={row.method} />)}
            </Bar>
          </BarChart>
        );
      }}
    </ChartShell>
  );
}

export function TopProductsChart({ data }: { data: { product_name: string; quantity: number; revenue: number; margin: number }[] }) {
  return (
    <ChartShell height="h-[300px]">
      {(palette) => (
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="product_name" axisLine={false} tickLine={false} interval={0} height={58} angle={-20} textAnchor="end" tick={{ fill: palette.text, fontSize: 10 }}
            tickFormatter={(value: string) => (value.length > 16 ? `${value.slice(0, 15)}...` : value)} />
          <YAxis axisLine={false} tickLine={false} width={56} tick={{ fill: palette.text, fontSize: 11 }} tickFormatter={(value: number) => compact(value)} />
          <Tooltip contentStyle={palette.tooltip} formatter={(value: number | string, name: string) => [money(Number(value)), name]} />
          <Legend wrapperStyle={{ fontSize: 11, color: palette.text }} />
          <Bar isAnimationActive={false} dataKey="revenue" fill={palette.apexSoft} name="Ingreso" radius={[6, 6, 0, 0]} stroke={palette.apex} strokeWidth={1.5} />
          <Bar isAnimationActive={false} dataKey="margin" fill={palette.success} name="Margen" radius={[6, 6, 0, 0]} />
        </BarChart>
      )}
    </ChartShell>
  );
}
