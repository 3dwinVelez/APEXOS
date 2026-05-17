# Supabase QA Test Checklist

## Preparacion

- [ ] Confirmar que el proyecto objetivo es `APEX-OS` QA.
- [ ] Confirmar que no se esta usando ningun proyecto legacy.
- [ ] Ejecutar migraciones versionadas.
- [ ] Confirmar que las tablas base existen.
- [ ] Confirmar que RLS esta activo en tablas sensibles.
- [ ] Confirmar que las politicas compilan.
- [ ] Confirmar que los indices existen.

## Usuario y empresa

- [ ] Crear usuario QA en Supabase Auth.
- [ ] Crear fila en `profiles`.
- [ ] Asociar usuario QA a `Cliente Piloto QA` en `company_users`.
- [ ] Validar `v_user_companies`.
- [ ] Validar que usuario sin empresa no ve datos.

## Modulos

- [ ] Validar modulos habilitados para la empresa piloto.
- [ ] Confirmar `talento_humano` habilitado.
- [ ] Confirmar `servicios` habilitado.
- [ ] Confirmar `configuracion` habilitado.
- [ ] Intentar acceder a modulo bloqueado.
- [ ] Confirmar que modulo bloqueado no permite operar datos reales.

## Talento Humano

- [ ] Crear empleado.
- [ ] Editar empleado.
- [ ] Consultar empleado.
- [ ] Validar que `company_id` filtra correctamente.
- [ ] Validar que una empresa no puede ver empleados de otra.
- [ ] Validar que sin `talento_humano` habilitado no se pueden consultar empleados.

## Servicios

- [ ] Crear servicio.
- [ ] Editar servicio.
- [ ] Consultar servicio.
- [ ] Validar que `company_id` filtra correctamente.
- [ ] Validar que una empresa no puede ver servicios de otra.
- [ ] Validar que sin `servicios` habilitado no se pueden consultar servicios.

## Seguridad negativa

- [ ] Usuario sin acceso no puede consultar `companies`.
- [ ] Usuario sin acceso no puede consultar `company_users`.
- [ ] Usuario miembro no admin no puede insertar usuarios.
- [ ] Usuario miembro no admin no puede editar modulos.
- [ ] Usuario miembro no admin no puede insertar empleados.
- [ ] Usuario miembro no admin no puede insertar servicios.

