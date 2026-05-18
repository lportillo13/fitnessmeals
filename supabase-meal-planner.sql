create extension if not exists pgcrypto;

alter table public.foods
  add column if not exists is_available boolean not null default true,
  add column if not exists profile_id uuid references public.meal_profiles(id) on delete cascade,
  add column if not exists max_amount numeric,
  add column if not exists allowed_meal_slots text[] not null default array['breakfast','snack_1','lunch','snack_2','dinner'];

alter table public.meal_templates
  add column if not exists meal_slot text
  check (meal_slot in ('breakfast', 'snack_1', 'lunch', 'snack_2', 'dinner')),
  add column if not exists is_default_daily boolean not null default false;

alter table public.meal_template_items
  add column if not exists amount_mode text
  check (amount_mode in ('serving', 'grams'));

alter table public.meal_profiles
  add column if not exists goal_instruction text,
  add column if not exists goal_body_fat_percentage numeric;

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
  unique (daily_plan_id, meal_slot)
);

create table if not exists public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  daily_plan_meal_id uuid not null references public.daily_plan_meals(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  amount_mode text check (amount_mode in ('serving', 'grams'))
);

alter table public.daily_plan_items
  add column if not exists amount_mode text
  check (amount_mode in ('serving', 'grams'));

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
