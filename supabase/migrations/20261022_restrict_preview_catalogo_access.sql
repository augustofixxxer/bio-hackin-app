-- Restringe explícitamente la tabla de Preview a backend privilegiado.
revoke all on table public.preview_catalogo_maestro_platos from public, anon, authenticated;
grant select, insert, update, delete on table public.preview_catalogo_maestro_platos to service_role;
