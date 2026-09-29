-- Category writes are exposed through RLS-checked administrator policies only.
grant insert,update,delete on public.categories to authenticated;
