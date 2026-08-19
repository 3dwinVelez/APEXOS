# Error And Permission QA

- A Nyvora role without `services.orders:edit_any_state` was rejected.
- An authorized role from the isolation tenant could not access the Nyvora order.
- Unauthorized platform requests returned `401`.
- MIME and binary signature validation passed before persistence.
- Both certification processes exited with code `0`.
