-- group_members status에 'left' 추가
ALTER TABLE group_members DROP CONSTRAINT group_members_status_check;
ALTER TABLE group_members ADD CONSTRAINT group_members_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'left'));

-- schedules_select RLS 수정: 생성자도 'left' 상태면 안 보이도록
DROP POLICY IF EXISTS "schedules_select" ON schedules;
CREATE POLICY "schedules_select" ON schedules FOR SELECT
  USING (
    type = 'class' OR
    (type = 'personal' AND created_by = auth.uid()) OR
    (type = 'group' AND (
      (created_by = auth.uid() AND NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE schedule_id = schedules.id
          AND user_id = auth.uid()
          AND status = 'left'
      )) OR
      EXISTS (
        SELECT 1 FROM group_members
        WHERE schedule_id = schedules.id
          AND user_id = auth.uid()
          AND status = 'accepted'
      )
    ))
  );
