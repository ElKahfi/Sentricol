-- New player skill profiles start at 10. Existing scores are intentionally
-- preserved; run the optional backfill below only if existing users should be
-- reset to the new baseline.
ALTER TABLE user_skill_profiles
  ALTER COLUMN ability_score SET DEFAULT 10;

-- New users created through the deployment invitation flow receive one row per
-- active tag. Existing users can be backfilled with:
-- INSERT INTO user_skill_profiles (user_id, tag_id, ability_score)
-- SELECT u.user_id, t.tag_id, 10
-- FROM users u CROSS JOIN tags t
-- WHERE u.role = 'player' AND t.is_active = true
-- ON CONFLICT (user_id, tag_id) DO NOTHING;
