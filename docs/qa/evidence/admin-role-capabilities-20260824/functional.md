# Certificación funcional

- El administrador corporativo personalizado consulta usuarios, crea usuarios y crea roles.
- El gestor de usuarios crea usuarios y no puede crear roles.
- Soporte consulta y edita usuarios, pero no puede crearlos.
- El gestor de roles consulta y crea roles, pero no puede crear usuarios.
- Solo lectura consulta usuarios y no puede crearlos.
- El rol exclusivo de marcaciones no puede abrir la administración de usuarios.
- Un usuario inactivo no puede iniciar sesión.
- La edición persiste cargo, área, sede, datos laborales y perfil operativo admitidos.
- Una identidad administrativa de Nyvora no puede editar un usuario de otro tenant.

El certificado ejecutable produjo 16/16 controles aprobados en `certification.json`. La sesión visual confirmó que el rol `admin_empresa` con nombre personalizado abre Administración APEX, ve el usuario certificado y dispone del formulario de creación con selector de rol.
