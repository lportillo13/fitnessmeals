create extension if not exists pgcrypto;

alter table public.foods
  add column if not exists is_available boolean not null default true,
  add column if not exists profile_id uuid references public.meal_profiles(id) on delete cascade,
  add column if not exists max_amount numeric,
  add column if not exists sugar_alcohol_g numeric not null default 0,
  add column if not exists allulose_g numeric not null default 0,
  add column if not exists allowed_meal_slots text[] not null default array['breakfast','snack_1','lunch','snack_2','dinner'];

alter table public.meal_templates
  add column if not exists meal_slot text
  check (meal_slot in ('breakfast', 'snack_1', 'lunch', 'snack_2', 'dinner')),
  add column if not exists is_default_daily boolean not null default false,
  add column if not exists no_rebalance boolean not null default false;

alter table public.meal_template_items
  add column if not exists amount_mode text
  check (amount_mode in ('serving', 'grams'));

alter table public.meal_profiles
  add column if not exists goal_instruction text,
  add column if not exists current_body_fat_percentage numeric,
  add column if not exists goal_body_fat_percentage numeric,
  add column if not exists plan_bmr numeric,
  add column if not exists plan_tdee numeric,
  add column if not exists plan_daily_deficit numeric,
  add column if not exists plan_start_date date,
  add column if not exists plan_start_weight_lb numeric;

create table if not exists public.meal_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.meal_profiles(id) on delete cascade,
  name text not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'snack_1', 'lunch', 'snack_2', 'dinner')),
  rule_type text not null default 'required_food'
    check (rule_type in ('required_food', 'minimum_category_amount', 'exact_food_amount')),
  required_food_id uuid references public.foods(id) on delete cascade,
  target_category text check (target_category in ('protein', 'carb', 'fat', 'fruit', 'snack', 'drink', 'other')),
  amount numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.meal_rules
  add column if not exists rule_type text not null default 'required_food'
    check (rule_type in ('required_food', 'minimum_category_amount', 'exact_food_amount')),
  add column if not exists target_category text
    check (target_category in ('protein', 'carb', 'fat', 'fruit', 'snack', 'drink', 'other')),
  add column if not exists amount numeric;

alter table public.meal_rules
  alter column required_food_id drop not null;

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.meal_profiles(id) on delete cascade,
  plan_date date not null,
  generated_at timestamptz not null default now(),
  unique (profile_id, plan_date)
);

create table if not exists public.daily_plan_meals (
  id uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null references public.daily_plans(id) on delete cascade,
  meal_slot text not null check (meal_slot in ('breakfast', 'snack_1', 'lunch', 'snack_2', 'dinner')),
  meal_template_id uuid references public.meal_templates(id) on delete set null,
  meal_name text not null,
  completed boolean not null default false,
  no_rebalance boolean not null default false,
  unique (daily_plan_id, meal_slot)
);

alter table public.daily_plan_meals
  add column if not exists no_rebalance boolean not null default false;

create table if not exists public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  daily_plan_meal_id uuid not null references public.daily_plan_meals(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  amount_mode text check (amount_mode in ('serving', 'grams')),
  completed boolean not null default false
);

alter table public.daily_plan_items
  add column if not exists amount_mode text
  check (amount_mode in ('serving', 'grams'));

alter table public.daily_plan_items
  add column if not exists completed boolean not null default false;

alter table public.daily_plan_items
  alter column food_id drop not null,
  add column if not exists custom_food_name text,
  add column if not exists custom_food_brand text,
  add column if not exists custom_food_category text
    check (custom_food_category in ('protein', 'carb', 'fat', 'fruit', 'snack', 'drink', 'other')),
  add column if not exists custom_serving_mode text
    check (custom_serving_mode in ('unit', 'grams')),
  add column if not exists custom_serving_label text,
  add column if not exists custom_base_grams numeric,
  add column if not exists custom_calories numeric,
  add column if not exists custom_protein_g numeric,
  add column if not exists custom_carbs_g numeric,
  add column if not exists custom_fat_g numeric,
  add column if not exists custom_fiber_g numeric,
  add column if not exists custom_sugar_alcohol_g numeric,
  add column if not exists custom_allulose_g numeric;

alter table public.daily_plan_items
  drop constraint if exists daily_plan_items_food_reference_check;

alter table public.daily_plan_items
  add constraint daily_plan_items_food_reference_check
  check (food_id is not null or custom_food_name is not null);

create table if not exists public.progress_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.meal_profiles(id) on delete cascade,
  log_date date not null default current_date,
  weight_lb numeric not null,
  body_fat_percentage numeric,
  note text,
  created_at timestamptz not null default now(),
  unique (profile_id, log_date)
);

update public.meal_templates
set meal_slot = case
  when lower(name) like '%breakfast%' then 'breakfast'
  when lower(name) like '%snack 2%' then 'snack_2'
  when lower(name) like '%snack%' then 'snack_1'
  when lower(name) like '%lunch%' then 'lunch'
  when lower(name) like '%dinner%' then 'dinner'
  else meal_slot
end
where meal_slot is null;

create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.meal_profiles(id) on delete cascade,
  name text not null,
  muscle_group text not null,
  equipment text,
  video_url text,
  instructions text,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists exercise_library_profile_idx on public.exercise_library(profile_id);
create index if not exists exercise_library_name_idx on public.exercise_library using gin (to_tsvector('english', name));
create unique index if not exists exercise_library_public_name_idx
  on public.exercise_library (lower(name))
  where is_public and profile_id is null;

create table if not exists public.exercise_routines (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.meal_profiles(id) on delete cascade,
  name text not null,
  focus text,
  created_at timestamptz not null default now()
);

create table if not exists public.exercise_routine_items (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.exercise_routines(id) on delete cascade,
  exercise_id uuid references public.exercise_library(id) on delete set null,
  exercise_name text not null,
  target_sets integer not null default 3 check (target_sets > 0),
  target_reps text not null default '10',
  sort_order integer not null default 0
);

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.meal_profiles(id) on delete cascade,
  workout_date date not null default current_date,
  routine_id uuid references public.exercise_routines(id) on delete set null,
  routine_name text,
  notes text,
  created_at timestamptz not null default now(),
  unique (profile_id, workout_date)
);

create table if not exists public.workout_log_sets (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs(id) on delete cascade,
  exercise_id uuid references public.exercise_library(id) on delete set null,
  exercise_name text not null,
  set_number integer not null default 1 check (set_number > 0),
  reps integer not null default 0 check (reps >= 0),
  weight_lb numeric not null default 0 check (weight_lb >= 0),
  completed boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.exercise_library (name, muscle_group, equipment, instructions, is_public)
values
  ('Back squat', 'Legs', 'Barbell', 'Brace, sit between the hips, keep knees tracking over toes, and drive up through the floor.', true),
  ('Romanian deadlift', 'Hamstrings', 'Barbell or dumbbells', 'Hinge at the hips with soft knees, keep the back neutral, and stop when hamstrings are loaded.', true),
  ('Leg press', 'Legs', 'Machine', 'Set feet about shoulder width, lower with control, and press without locking out aggressively.', true),
  ('Walking lunge', 'Legs', 'Dumbbells or bodyweight', 'Step long enough to keep the front heel planted, lower under control, and alternate legs.', true),
  ('Hip thrust', 'Glutes', 'Barbell or machine', 'Tuck ribs down, drive through heels, and squeeze glutes at the top.', true),
  ('Bench press', 'Chest', 'Barbell', 'Pin shoulder blades, lower to the lower chest, and press back over the shoulders.', true),
  ('Incline dumbbell press', 'Chest', 'Dumbbells', 'Use a slight incline, lower dumbbells beside upper chest, and press without shrugging.', true),
  ('Push-up', 'Chest', 'Bodyweight', 'Keep a straight line from shoulders to ankles and lower chest toward the floor.', true),
  ('Lat pulldown', 'Back', 'Cable machine', 'Pull elbows down toward ribs and avoid leaning back excessively.', true),
  ('Seated cable row', 'Back', 'Cable machine', 'Reach forward with control, then row elbows behind the body while keeping the torso stable.', true),
  ('Dumbbell shoulder press', 'Shoulders', 'Dumbbells', 'Press from shoulder height while keeping ribs stacked over hips.', true),
  ('Lateral raise', 'Shoulders', 'Dumbbells or cable', 'Raise arms slightly forward of the body and stop around shoulder height.', true),
  ('Biceps curl', 'Arms', 'Dumbbells or cable', 'Keep elbows quiet and curl without swinging.', true),
  ('Triceps rope pressdown', 'Arms', 'Cable machine', 'Keep elbows pinned and extend fully at the bottom.', true),
  ('Plank', 'Core', 'Bodyweight', 'Brace abs, squeeze glutes, and hold a straight line.', true),
  ('Cable crunch', 'Core', 'Cable machine', 'Round through the upper back and pull ribs toward pelvis.', true)
on conflict do nothing;
