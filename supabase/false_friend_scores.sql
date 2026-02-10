create table if not exists false_friend_scores (
  id bigint generated always as identity primary key,
  run_id uuid not null unique,
  user_id text,
  name text not null,
  total_score integer not null check (total_score >= 0),
  rounds_cleared integer not null check (rounds_cleared >= 0),
  created_at timestamptz not null default now()
);

create index if not exists false_friend_scores_total_score_idx
  on false_friend_scores (total_score desc, created_at asc);
