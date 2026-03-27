-- 어드민이 다른 사용자를 삭제할 수 있는 함수
CREATE OR REPLACE FUNCTION delete_user_by_admin(target_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 호출자가 어드민인지 확인
  IF NOT (SELECT is_admin FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION '어드민 권한이 없습니다.';
  END IF;

  -- 자기 자신은 삭제 불가
  IF target_id = auth.uid() THEN
    RAISE EXCEPTION '자기 자신은 삭제할 수 없습니다.';
  END IF;

  DELETE FROM auth.users WHERE id = target_id;
END;
$$;
