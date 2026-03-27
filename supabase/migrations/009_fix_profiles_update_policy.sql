-- profiles UPDATE 정책에 WITH CHECK 추가 (어드민이 다른 프로필 수정 가능하도록)
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update
  using (id = auth.uid() or (select is_admin from profiles where id = auth.uid()))
  with check (id = auth.uid() or (select is_admin from profiles where id = auth.uid()));
