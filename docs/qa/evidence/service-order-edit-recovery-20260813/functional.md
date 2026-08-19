# Prueba funcional

- Ambiente: QA remoto.
- SHA desplegado y verificado por `/health`: `2b61281452d1`.
- Orden real ejercitada: `40`.
- Resultado: apertura, edicion, guardado y reapertura aprobados.
- Integridad: estado e items de la orden se conservaron despues de editar.
- Contrato de catalogos: referencias ausentes se trataron como coleccion vacia y la certificacion creo y retiro una referencia temporal controlada.
