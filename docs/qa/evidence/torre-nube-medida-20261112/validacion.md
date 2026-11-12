# Nube medida por ambiente — 2026-11-12

Prueba de campo de `apps/control-tower/**` tras conectar los puntos de medicion de
la nube. Pregunta que responde: **¿los servicios de la nube estan bien?** Rama
`desarrollo`. La torre es herramienta de puesto: no se promueve ni se despliega, y
esta evidencia no se cita como authorization de promocion.

## Que se midio en el puesto (dato real, sin simulacion)

Torre del puesto en `http://127.0.0.1:4310`, sondeo real contra Railway, salida
completa en `nube-viva.json`.

| Ambiente | Railway | Vercel | Supabase |
|---|---|---|---|
| Local | no aplica — "se mide en el puesto, no en la nube" | no aplica | no aplica |
| Develop · QA | **ok, 662 ms** · proyecto `APEXOS QA` · ultimo deployment SUCCESS 2026-11-11T00:49:23Z · credencial: sesion del CLI de Railway | no aplica (fuera de la topologia) | sin token de gestion → `CLOUD_SIN_TOKEN` |
| Main · PROD | **ok, 470 ms** · proyecto `APEXOS PROD` · ultimo deployment SUCCESS 2026-11-11T20:01:38Z · credencial: sesion del CLI de Railway | no aplica | sin token de gestion → `CLOUD_SIN_TOKEN` |

Acciones de nube por ambiente, despues del corte: local **ninguna**; QA y PROD
**una sola** (`Configurar SUPABASE_ACCESS_TOKEN`). Antes de este cambio la barra
pedia los tres tokens en los tres ambientes, incluidos dos que no existen ahi.

Ninguna tarjeta, ningun JSON de evidencia y ninguna accion lleva token: el campo
`credentialSource` nombra el almacen ("sesion del CLI de Railway"), nunca su
contenido.

## Como se reproduce

```bash
npm run control:test                              # 186/186
npm run certify:control-tower:local               # 77/77
npm run certify:control-tower:consolidado         # 73/73 (16 verificaciones de nube)
node apps/control-tower/server.js                 # torre del puesto en 127.0.0.1:4310
```

La certificacion consolidada (`docs/qa/evidence/torre-consolidado-empresas-20261103/`)
no sale a internet ni depende de con quien este autenticado el operador: levanta un
ferrocarril local y un almacen de sesion propio, y certifica el viaje completo.

## Verificaciones de nube certificadas

Servidor (torre real → snapshot `/api/status`):

- `ferrocarril_falso_sondeable` — hay un proveedor al que sondear.
- `nube_sesion_del_cli_adoptada` — la tarjeta llega `configured` y con la fuente "CLI de Railway".
- `nube_sonda_viaja_con_la_sesion` — el ferrocarril recibio `Authorization: Bearer <sesion>` en cada llamada: la torre adopta la sesion, no la duplica.
- `nube_railway_medido_con_viaje` — `applies=true`, `status=ok`, latencia medida > 0, proyecto y deployment leidos, `detail` con SUCCESS.
- `nube_proveedor_sin_topologia_no_pide_token` — Vercel y Supabase `applies=false`/`not_applicable` y **no** generan accion `CLOUD_SIN_TOKEN`.
- `nube_ambiente_sin_proyecto_no_inventa` — un ambiente sin project id no inventa latencia: `latencyMs=null`, no "0 ms".
- `nube_local_no_pide_credenciales_cloud` — el local de Docker no pide tokens de nube.
- `nube_no_publica_la_sesion_del_puesto` — el snapshot completo no contiene la sesion.
- `nube_ids_reales_cableados_en_el_config` — los identificadores medidos de QA (`33726923-021d-47a7-a263-b8b287f164f1`) y PROD (`0afe38cc-6080-49d2-aa24-2d5625250ac2`) estan versionados en `lib/config.js`; local queda vacio a proposito.
- `evidencia_nube` — se publica `nube-certificada.json`.

Navegador (vista Nube en QA, `04-vista-nube-medida.png`):

- `navegador_nube_con_viaje_medido` — tres tarjetas; la de Railway muestra proyecto, SUCCESS y los ms medidos.
- `navegador_nube_dice_la_fuente_de_la_credencial` — "Credencial leida de: sesion del CLI de Railway".
- `navegador_nube_no_pide_configurar_lo_que_no_aplica` — dos tarjetas dicen "No aplica", ninguna dice "Configura" ni "Sin credenciales".
- `navegador_nube_grafica_del_viaje` — el viaje se dibuja con su umbral y la tarjeta queda en banda operativa.
- `navegador_nube_no_imprime_la_sesion` — la pantalla no muestra la credencial.
- `captura_vista_nube` — captura > 20 KB.

## Lo que queda bloqueado, y por que no lo cierra el codigo

- **`SUPABASE_ACCESS_TOKEN`**: no existe en el puesto y solo el dueno puede mintarlo (Supabase → Account → Access tokens). Hasta entonces la tarjeta queda `unknown` con su accion, nunca en `ok` inventado.
- **Telemetria profunda de QA/PROD** (`apex-control`, empresas por tenant): sus builds desplegados no incluyen el modulo → 404. Se destraba promocionando, lo que exige authorization expresa.
- **Credencial APEX de QA/PROD**: `npm run control:credential -- --environment develop|main`.
- La captura de pantalla del navegador se certifica contra el ferrocarril local; la medida del puesto esta en `nube-viva.json`. No se publico una captura con el token real del puesto para no escribir la credencial en ningun artefacto.
