# Politica de sesion offline

La consulta local exige simultaneamente:

- JWT local presente, no vencido y con identidad/empresa esperadas.
- descriptor minimo de autorizacion coincidente;
- snapshot valido para ambiente, empresa, tenant y usuario;
- `authorizedUntil` y TTL del snapshot vigentes.

El descriptor solo guarda contexto y vencimiento. No guarda token, permisos ni
datos operativos. Un logout explicito elimina descriptor y base IndexedDB del
contexto aun despues de retirar el token. Un cambio de cuenta no abre la base de
la cuenta anterior.

## Riesgo residual

Sin conectividad no puede conocerse una revocacion remota posterior al ultimo
bootstrap. El limite residual es el menor vencimiento entre JWT,
`authorizedUntil` y snapshot. La politica inicial deniega lectura vencida. Una
revocacion inmediata en dispositivo desconectado requiere gestion de
dispositivo futura y no se declara resuelta en Fase 3.

La certificacion exige que las columnas de version de usuario y tenant existan
realmente en la base. No se admite omitir la verificacion de revocacion para
acomodar un ambiente local desactualizado.
