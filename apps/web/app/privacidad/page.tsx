import type { Metadata } from "next";

/**
 * Pagina publica de politica de privacidad.
 *
 * Google Play la exige para cualquier app que recoja ubicacion, y la URL debe
 * ser accesible sin iniciar sesion: el revisor entra sin cuenta. Por eso vive
 * fuera de /dashboard y no importa nada que dependa de la sesion.
 *
 * El contenido describe lo que la app movil **realmente** hace, contrastado
 * con los permisos del manifiesto y el codigo que los usa. Si cambian los
 * datos que se recogen, hay que actualizar esto y el formulario de Data
 * Safety de Play a la vez: declarar de menos es motivo de retiro de la ficha.
 */
export const metadata: Metadata = {
  title: "Política de privacidad — APEXOS",
  description:
    "Cómo APEXOS recoge, usa y protege los datos de la aplicación móvil para técnicos en campo.",
};

const ACTUALIZADO = "15 de octubre de 2026";

/** Pendiente de confirmar por la empresa antes de publicar. */
const CONTACTO = "privacidad@apexos.co";
const RAZON_SOCIAL = "APEXOS";

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-slate-100">{titulo}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-300">
        {children}
      </div>
    </section>
  );
}

function Dato({
  que,
  para,
  cuando,
}: {
  que: string;
  para: string;
  cuando: string;
}) {
  return (
    <tr className="border-t border-slate-800 align-top">
      <td className="py-3 pr-4 font-semibold text-slate-100">{que}</td>
      <td className="py-3 pr-4 text-slate-300">{para}</td>
      <td className="py-3 text-slate-400">{cuando}</td>
    </tr>
  );
}

export default function PoliticaPrivacidad() {
  return (
    <main className="min-h-screen bg-[#071018] px-6 py-16">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">
          APEXOS
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">
          Política de privacidad
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Última actualización: {ACTUALIZADO}
        </p>

        <Seccion titulo="A qué aplica">
          <p>
            Esta política describe cómo {RAZON_SOCIAL} trata los datos de la
            aplicación móvil <strong>APEXOS</strong>, usada por el personal
            técnico y operativo de las empresas que contratan el servicio.
          </p>
          <p>
            No es una aplicación de consumo: solo pueden entrar personas con una
            cuenta creada por el administrador de su empresa. Los datos
            pertenecen a esa empresa, que actúa como responsable del
            tratamiento; {RAZON_SOCIAL} los trata por encargo suyo.
          </p>
        </Seccion>

        <Seccion titulo="Qué datos recogemos y para qué">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4">Dato</th>
                  <th className="pb-2 pr-4">Para qué</th>
                  <th className="pb-2">Cuándo</th>
                </tr>
              </thead>
              <tbody>
                <Dato
                  que="Identificación"
                  para="Autenticar al empleado y mostrarle solo el trabajo que le corresponde."
                  cuando="Al iniciar sesión."
                />
                <Dato
                  que="Ubicación precisa"
                  para="Dejar constancia del lugar donde se marca la jornada, se inicia un servicio o se registra una actividad."
                  cuando="Solo en el momento de esas acciones. Nunca en segundo plano."
                />
                <Dato
                  que="Fotografías"
                  para="Evidencia del estado del producto y del trabajo realizado, que sustenta reclamaciones y garantías."
                  cuando="Cuando el técnico toma la foto desde la app."
                />
                <Dato
                  que="Firma del cliente"
                  para="Constancia de que el cliente recibió el servicio conforme."
                  cuando="Al cerrar un servicio."
                />
                <Dato
                  que="Datos del cliente final"
                  para="Nombre, dirección y teléfono del sitio de trabajo, para que el técnico pueda llegar y comunicarse."
                  cuando="Los carga la empresa; la app solo los muestra."
                />
              </tbody>
            </table>
          </div>
        </Seccion>

        <Seccion titulo="Huella digital">
          <p>
            La app pide confirmación con huella o con el bloqueo del dispositivo
            antes de registrar una marcación.{" "}
            <strong>
              Tu huella nunca sale del teléfono ni llega a nuestros servidores.
            </strong>{" "}
            El sistema operativo nos responde únicamente si la verificación fue
            correcta; no recibimos, ni guardamos, ningún dato biométrico.
          </p>
        </Seccion>

        <Seccion titulo="Ubicación, en concreto">
          <p>
            Se solicita el permiso de ubicación y se toma una lectura{" "}
            <strong>solo al marcar jornada, iniciar o cerrar un servicio y
            registrar una actividad</strong>. No hay seguimiento continuo ni
            recolección mientras la app está cerrada.
          </p>
          <p>
            Puedes negar el permiso: la app sigue funcionando y la acción queda
            registrada señalando que se hizo sin ubicación, para que quien
            supervise lo sepa.
          </p>
        </Seccion>

        <Seccion titulo="Dónde se guardan">
          <p>
            Los datos viajan cifrados por HTTPS a los servidores de APEXOS. La
            sesión se guarda en el almacenamiento cifrado del dispositivo
            (Keystore de Android).
          </p>
          <p>
            Cuando no hay señal, las acciones y las fotos quedan en una cola
            dentro del almacenamiento privado de la app y se envían al recuperar
            conexión. Esa cola solo es accesible para la propia aplicación.
          </p>
        </Seccion>

        <Seccion titulo="Con quién se comparten">
          <p>
            Con nadie fuera de la empresa del empleado y de los proveedores de
            infraestructura necesarios para operar el servicio (alojamiento y
            base de datos).
          </p>
          <p>
            <strong>
              No vendemos datos personales ni los usamos para publicidad.
            </strong>{" "}
            No hay redes de anuncios ni rastreadores de terceros en la
            aplicación.
          </p>
        </Seccion>

        <Seccion titulo="Cuánto tiempo se conservan">
          <p>
            El tiempo que la empresa contratante necesite para sustentar la
            operación y cumplir sus obligaciones legales y contractuales.
            Terminado el contrato, se eliminan o se devuelven según lo acordado
            con ella.
          </p>
        </Seccion>

        <Seccion titulo="Tus derechos">
          <p>
            Puedes conocer, actualizar, rectificar y suprimir tus datos, y
            revocar la autorización, conforme a la Ley 1581 de 2012 de Colombia
            y su reglamentación.
          </p>
          <p>
            Como los datos los administra tu empleador, el camino más rápido es
            solicitarlo al administrador de tu empresa. También puedes
            escribirnos a{" "}
            <a
              className="font-semibold text-teal-400 underline"
              href={`mailto:${CONTACTO}`}
            >
              {CONTACTO}
            </a>
            .
          </p>
        </Seccion>

        <Seccion titulo="Permisos que pide la aplicación">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Ubicación</strong> — registrar dónde ocurren las
              marcaciones y los servicios.
            </li>
            <li>
              <strong>Cámara</strong> — tomar las fotos de evidencia. Se abre la
              cámara del sistema; la app no accede a tu galería.
            </li>
            <li>
              <strong>Biometría</strong> — confirmar tu identidad al marcar.
            </li>
            <li>
              <strong>Notificaciones</strong> — avisarte del estado de los
              envíos pendientes.
            </li>
            <li>
              <strong>Internet y estado de la red</strong> — sincronizar con el
              servidor y saber cuándo hay señal.
            </li>
          </ul>
        </Seccion>

        <Seccion titulo="Cambios">
          <p>
            Si cambiamos lo que recogemos, actualizaremos esta página y la fecha
            de arriba.
          </p>
        </Seccion>

        <footer className="mt-12 border-t border-slate-800 pt-6 text-sm text-slate-500">
          {RAZON_SOCIAL} ·{" "}
          <a className="text-teal-400 underline" href={`mailto:${CONTACTO}`}>
            {CONTACTO}
          </a>
        </footer>
      </article>
    </main>
  );
}
