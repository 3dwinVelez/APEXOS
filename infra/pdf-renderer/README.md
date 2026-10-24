# Runtime PDF con sandbox

Chromium se ejecuta con el usuario no root de la imagen del API. El host debe permitir los namespaces usados por el sandbox. No se usan `--no-sandbox`, seccomp unconfined, modo privilegiado ni `SYS_ADMIN`.

`seccomp.json` es el perfil publicado por Microsoft Playwright: conserva `SCMP_ACT_ERRNO` como accion predeterminada y permite las operaciones de namespace `clone`, `setns` y `unshare` necesarias para el sandbox. La licencia Apache 2.0 se incluye en `PLAYWRIGHT-LICENSE.txt`.

Fuente: https://github.com/microsoft/playwright/blob/main/utils/docker/seccomp_profile.json

Referencia del mantenedor: https://playwright.dev/docs/docker#crawling-and-scraping

SHA256 del archivo importado: `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`.

Desde la raiz del repositorio, configurar `PDF_WEB_ORIGIN` al nombre/puerto privado real del frontend y usar `infra/docker-compose.pdf-sandbox.yml` como overlay de `infra/docker-compose.yml`. La configuracion se valida sin desplegar con:

```powershell
docker compose -f infra/docker-compose.yml -f infra/docker-compose.pdf-sandbox.yml config --quiet
```

Antes de desplegar en un proveedor administrado, confirmar que admite este perfil por servicio. Una prueba aprobada con este overlay no demuestra que un servicio remoto use el mismo perfil. Si el proveedor no permite namespaces, se requiere un worker de renderizado en un runtime compatible; no se debe desactivar el sandbox para ocultar la incompatibilidad.

Certificaciones locales versionadas: `transport-pdf-runtime-local.js` valida PDF, usuario no root y sandbox; `transport-pdf-linux-local.js` ejerce el endpoint HTTP real del API en Docker contra datos locales y el frontend privado. Los contenedores de certificacion son temporales y no modifican configuraciones remotas.
