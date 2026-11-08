// Node no resuelve "next/server" fuera del runtime de Next (el paquete no expone ese
// subpath al resolver ESM plano). Para probar el handler publico en aislamiento, este
// loader lo sustituye por el contrato minimo que la ruta usa: status + cuerpo JSON.
const SHIM = `
export class NextRequest {}
export class NextResponse {
  constructor(body, init = {}) {
    this.status = init.status || 200;
    this._body = body;
  }
  static json(body, init = {}) {
    return new NextResponse(body, init);
  }
  async json() {
    return this._body;
  }
}
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return { url: `data:text/javascript,${encodeURIComponent(SHIM)}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
