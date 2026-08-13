# Ambiente local de certificacion offline

Estado: preparado, vacio y sin seed.

## Ambiente seleccionado

Se adopto la estrategia B: PostgreSQL dedicado y reconstruible.

| Propiedad | Valor |
| --- | --- |
| Motor | PostgreSQL 16.14 (`postgres:16-alpine`) |
| Host | `127.0.0.1` |
| Puerto | `54320` |
| Base | `apexos_offline_cert_local` |
| Usuario | `apex_offline_cert` |
| Origen | servicio Compose `offline-cert-postgres` |
| Volumen | `infra_offlinecertpgdata` |
| Estado | healthy |
| Datos | vacio |

La contrasena se genera localmente en
`config/offline-cert-local.env`, archivo ignorado. El contenedor escucha solo
en loopback y tiene la etiqueta
`com.apexos.purpose=offline-readonly-local-certification`.

## Otros candidatos

- `localhost:55432`: PostgreSQL Docker general con datos de demo, schema
  anterior y sin Nyvora exacto. No es limpiable para esta fase.
- `localhost:5432`: servicio Windows PostgreSQL 16 activo, origen ajeno al
  Compose del proyecto y sin identidad/credenciales aprobadas. No se usa.
- Supabase local: no existe `supabase/config.toml` ni stack local configurado.
- QA/produccion: excluidos por instruccion y guardas.

## Reconstruccion

```powershell
.\scripts\setup-offline-cert-local.ps1 -Mode rebuild
.\scripts\setup-offline-cert-local.ps1 -Mode status
.\scripts\setup-offline-cert-local.ps1 -Mode destroy
```

`destroy` solo administra el contenedor con etiqueta esperada y su volumen
dedicado. `rebuild` fue ejecutado dos veces desde volumen eliminado; la segunda
corrida finalizo correctamente.

