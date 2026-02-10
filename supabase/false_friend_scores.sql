-- False Friend score table draft.
-- Intentionally not wired in app code yet (gameplay-only implementation).

create table if not exists false_friend_scores (
  id bigint generated always as identity primary key,
  player_name text not null,
  score integer not null check (score >= 0),
  rounds_cleared integer not null check (rounds_cleared >= 0),
  friends_clicked integer not null check (friends_clicked >= 0),
  avg_reaction_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists false_friend_scores_score_idx
  on false_friend_scores (score desc, created_at asc);
