"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Dumbbell,
  ExternalLink,
  Play,
  Plus,
  Save,
  Search,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  Exercise,
  ExerciseRoutine,
  ExerciseRoutineItem,
  Profile,
  WorkoutLog,
  WorkoutLogSet,
} from "@/lib/types";

const muscleGroups = [
  "All",
  "Legs",
  "Glutes",
  "Hamstrings",
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Core",
  "Full body",
];

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

export default function ExercisesPage() {
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [routines, setRoutines] = useState<ExerciseRoutine[]>([]);
  const [routineItems, setRoutineItems] = useState<ExerciseRoutineItem[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [sets, setSets] = useState<WorkoutLogSet[]>([]);
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("All");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [setCount, setSetCount] = useState(3);
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState(0);
  const [routineName, setRoutineName] = useState("");
  const [routineFocus, setRoutineFocus] = useState("Legs");
  const [selectedRoutineId, setSelectedRoutineId] = useState("");
  const [routineExerciseId, setRoutineExerciseId] = useState("");
  const [routineSets, setRoutineSets] = useState(3);
  const [routineReps, setRoutineReps] = useState("10");
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseMuscle, setNewExerciseMuscle] = useState("Legs");
  const [newExerciseEquipment, setNewExerciseEquipment] = useState("");
  const [newExerciseVideoUrl, setNewExerciseVideoUrl] = useState("");
  const [newExerciseInstructions, setNewExerciseInstructions] = useState("");
  const [progressExerciseId, setProgressExerciseId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfiles() {
      const { data } = await createClient().from("meal_profiles").select("*").order("name");
      const loadedProfiles = (data || []) as Profile[];
      const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
      setSelectedProfileId(
        loadedProfiles.find((profile) => profile.id === rememberedProfileId)?.id ||
          loadedProfiles[0]?.id ||
          ""
      );
    }

    void loadProfiles();
  }, []);

  useEffect(() => {
    function syncSelectedProfile() {
      const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
      if (rememberedProfileId) setSelectedProfileId(rememberedProfileId);
    }

    window.addEventListener("selected-profile-changed", syncSelectedProfile);
    return () => window.removeEventListener("selected-profile-changed", syncSelectedProfile);
  }, []);

  useEffect(() => {
    async function loadExerciseData() {
      if (!selectedProfileId) return;
      const supabase = createClient();
      const [
        { data: exerciseData, error: exerciseError },
        { data: routineData, error: routineError },
        { data: logData, error: logError },
      ] = await Promise.all([
        supabase
          .from("exercise_library")
          .select("*")
          .or(`profile_id.eq.${selectedProfileId},profile_id.is.null,is_public.eq.true`)
          .order("name"),
        supabase
          .from("exercise_routines")
          .select("*")
          .eq("profile_id", selectedProfileId)
          .order("name"),
        supabase
          .from("workout_logs")
          .select("*")
          .eq("profile_id", selectedProfileId)
          .order("workout_date", { ascending: false }),
      ]);

      if (exerciseError || routineError || logError) {
        setMessage(
          exerciseError?.message ||
            routineError?.message ||
            logError?.message ||
            "Could not load exercises."
        );
        return;
      }

      const loadedExercises = (exerciseData || []) as Exercise[];
      const loadedRoutines = (routineData || []) as ExerciseRoutine[];
      const loadedLogs = (logData || []) as WorkoutLog[];
      setExercises(loadedExercises);
      setRoutines(loadedRoutines);
      setLogs(loadedLogs);
      setSelectedExerciseId((current) => current || loadedExercises[0]?.id || "");
      setProgressExerciseId((current) => current || loadedExercises[0]?.id || "");

      const [{ data: itemData, error: itemError }, { data: setData, error: setError }] =
        await Promise.all([
          loadedRoutines.length > 0
            ? supabase
                .from("exercise_routine_items")
                .select("*")
                .in(
                  "routine_id",
                  loadedRoutines.map((routine) => routine.id)
                )
                .order("sort_order")
            : { data: [], error: null },
          loadedLogs.length > 0
            ? supabase
                .from("workout_log_sets")
                .select("*")
                .in(
                  "workout_log_id",
                  loadedLogs.map((log) => log.id)
                )
                .order("created_at")
            : { data: [], error: null },
        ]);

      if (itemError || setError) {
        setMessage(itemError?.message || setError?.message || "Could not load workout details.");
        return;
      }

      setRoutineItems((itemData || []) as ExerciseRoutineItem[]);
      setSets((setData || []) as WorkoutLogSet[]);
      setMessage("");
    }

    void loadExerciseData();
  }, [selectedProfileId]);

  const currentLog = logs.find((log) => log.workout_date === selectedDate);
  const currentSets = useMemo(
    () =>
      sets
        .filter((set) => set.workout_log_id === currentLog?.id)
        .sort((a, b) => a.exercise_name.localeCompare(b.exercise_name) || a.set_number - b.set_number),
    [sets, currentLog]
  );
  const filteredExercises = exercises
    .filter((exercise) => {
      const query = exerciseSearch.toLowerCase();
      const matchesSearch =
        exercise.name.toLowerCase().includes(query) ||
        exercise.muscle_group.toLowerCase().includes(query) ||
        (exercise.equipment || "").toLowerCase().includes(query);
      const matchesMuscle = muscleFilter === "All" || exercise.muscle_group === muscleFilter;
      return matchesSearch && matchesMuscle;
    })
    .slice(0, 24);
  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId);
  const selectedRoutine = routines.find((routine) => routine.id === selectedRoutineId);
  const selectedRoutineItems = routineItems
    .filter((item) => item.routine_id === selectedRoutineId)
    .sort((a, b) => a.sort_order - b.sort_order);
  const progressExercise =
    exercises.find((exercise) => exercise.id === progressExerciseId) ||
    exercises.find((exercise) => sets.some((set) => set.exercise_id === exercise.id));
  const progressEntries = buildProgressEntries(progressExercise, logs, sets);
  const latestProgress = progressEntries.at(-1);
  const previousProgress = progressEntries.at(-2);
  const bestWeight = progressEntries.reduce((best, entry) => Math.max(best, entry.weight), 0);

  async function ensureWorkoutLog(routine?: ExerciseRoutine) {
    if (!selectedProfileId) return null;
    if (currentLog) {
      if (routine && currentLog.routine_id !== routine.id) {
        const { data, error } = await createClient()
          .from("workout_logs")
          .update({ routine_id: routine.id, routine_name: routine.name })
          .eq("id", currentLog.id)
          .select("*")
          .single();
        if (error) {
          setMessage(error.message);
          return null;
        }
        setLogs((current) =>
          current.map((log) => (log.id === currentLog.id ? (data as WorkoutLog) : log))
        );
        return data as WorkoutLog;
      }
      return currentLog;
    }

    const { data, error } = await createClient()
      .from("workout_logs")
      .insert({
        profile_id: selectedProfileId,
        workout_date: selectedDate,
        routine_id: routine?.id || null,
        routine_name: routine?.name || null,
      })
      .select("*")
      .single();
    if (error) {
      setMessage(error.message);
      return null;
    }
    setLogs((current) => [data as WorkoutLog, ...current]);
    return data as WorkoutLog;
  }

  async function addExerciseSets() {
    if (!selectedExercise || setCount <= 0) return;
    const log = await ensureWorkoutLog();
    if (!log) return;
    const existingSetCount = sets.filter(
      (set) =>
        set.workout_log_id === log.id &&
        (set.exercise_id === selectedExercise.id || set.exercise_name === selectedExercise.name)
    ).length;
    const rows = Array.from({ length: setCount }, (_, index) => ({
      workout_log_id: log.id,
      exercise_id: selectedExercise.id,
      exercise_name: selectedExercise.name,
      set_number: existingSetCount + index + 1,
      reps,
      weight_lb: weight,
      completed: true,
    }));
    const { data, error } = await createClient().from("workout_log_sets").insert(rows).select("*");
    if (error) {
      setMessage(error.message);
      return;
    }
    setSets((current) => [...current, ...((data || []) as WorkoutLogSet[])]);
    setProgressExerciseId(selectedExercise.id);
    setMessage(`${selectedExercise.name} added to ${formatShortDate(selectedDate)}.`);
  }

  async function deleteSet(setId: string) {
    const { error } = await createClient().from("workout_log_sets").delete().eq("id", setId);
    if (error) {
      setMessage(error.message);
      return;
    }
    setSets((current) => current.filter((set) => set.id !== setId));
  }

  async function saveExercise() {
    const name = newExerciseName.trim();
    if (!name || !selectedProfileId) {
      setMessage("Add an exercise name first.");
      return;
    }
    const { data, error } = await createClient()
      .from("exercise_library")
      .insert({
        profile_id: selectedProfileId,
        name,
        muscle_group: newExerciseMuscle,
        equipment: newExerciseEquipment.trim() || null,
        video_url: newExerciseVideoUrl.trim() || null,
        instructions: newExerciseInstructions.trim() || null,
        is_public: false,
      })
      .select("*")
      .single();
    if (error) {
      setMessage(error.message);
      return;
    }
    setExercises((current) => [...current, data as Exercise].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedExerciseId((data as Exercise).id);
    setNewExerciseName("");
    setNewExerciseEquipment("");
    setNewExerciseVideoUrl("");
    setNewExerciseInstructions("");
    setMessage("Exercise saved.");
  }

  async function saveRoutine() {
    if (!routineName.trim() || !selectedProfileId) {
      setMessage("Name the routine first.");
      return;
    }
    const { data, error } = await createClient()
      .from("exercise_routines")
      .insert({
        profile_id: selectedProfileId,
        name: routineName.trim(),
        focus: routineFocus || null,
      })
      .select("*")
      .single();
    if (error) {
      setMessage(error.message);
      return;
    }
    setRoutines((current) => [...current, data as ExerciseRoutine]);
    setSelectedRoutineId((data as ExerciseRoutine).id);
    setRoutineName("");
    setMessage("Routine saved. Add exercises to it next.");
  }

  async function addExerciseToRoutine() {
    const routine = routines.find((entry) => entry.id === selectedRoutineId);
    const exercise = exercises.find((entry) => entry.id === routineExerciseId);
    if (!routine || !exercise) {
      setMessage("Choose a routine and exercise first.");
      return;
    }
    const currentItems = routineItems.filter((item) => item.routine_id === routine.id);
    const { data, error } = await createClient()
      .from("exercise_routine_items")
      .insert({
        routine_id: routine.id,
        exercise_id: exercise.id,
        exercise_name: exercise.name,
        target_sets: routineSets,
        target_reps: routineReps || "10",
        sort_order: currentItems.length,
      })
      .select("*")
      .single();
    if (error) {
      setMessage(error.message);
      return;
    }
    setRoutineItems((current) => [...current, data as ExerciseRoutineItem]);
    setRoutineExerciseId("");
    setMessage(`${exercise.name} added to ${routine.name}.`);
  }

  async function deleteRoutineItem(itemId: string) {
    const { error } = await createClient().from("exercise_routine_items").delete().eq("id", itemId);
    if (error) {
      setMessage(error.message);
      return;
    }
    setRoutineItems((current) => current.filter((item) => item.id !== itemId));
  }

  async function loadRoutineForDate() {
    if (!selectedRoutine || selectedRoutineItems.length === 0) {
      setMessage("Choose a routine with exercises first.");
      return;
    }
    const log = await ensureWorkoutLog(selectedRoutine);
    if (!log) return;
    const rows = selectedRoutineItems.flatMap((item) => {
      const lastWeight = findLastWeight(item, logs, sets);
      const repsFromRoutine = parseReps(item.target_reps);
      const existingSetCount = sets.filter(
        (set) =>
          set.workout_log_id === log.id &&
          (set.exercise_id === item.exercise_id || set.exercise_name === item.exercise_name)
      ).length;
      return Array.from({ length: item.target_sets }, (_, index) => ({
        workout_log_id: log.id,
        exercise_id: item.exercise_id,
        exercise_name: item.exercise_name,
        set_number: existingSetCount + index + 1,
        reps: repsFromRoutine,
        weight_lb: lastWeight,
        completed: true,
      }));
    });
    const { data, error } = await createClient().from("workout_log_sets").insert(rows).select("*");
    if (error) {
      setMessage(error.message);
      return;
    }
    setSets((current) => [...current, ...((data || []) as WorkoutLogSet[])]);
    setMessage(`${selectedRoutine.name} loaded for ${formatShortDate(selectedDate)}.`);
  }

  return (
    <main className="app-shell">
      <div className="mx-auto grid max-w-7xl gap-4">
        <section className="grid gap-4 lg:grid-cols-[1fr_420px]">
          <div className="surface rounded-3xl p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow mb-2 text-xs font-semibold">Exercises</p>
                <h1 className="text-4xl font-bold">Workout log</h1>
                <p className="muted mt-1 text-sm">Track exercises, sets, reps, and weights by day.</p>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="muted">Workout date</span>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value || getTodayKey())}
                />
              </label>
            </div>

            <div className="grid gap-3 rounded-3xl bg-white/[0.03] p-4 lg:grid-cols-[1fr_130px_130px_130px_auto]">
              <div className="relative lg:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 pl-9 text-white"
                  placeholder="Search exercise"
                  value={exerciseSearch}
                  onChange={(event) => setExerciseSearch(event.target.value)}
                />
              </div>
              <input
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                type="number"
                min="1"
                value={setCount}
                onChange={(event) => setSetCount(Number(event.target.value))}
                aria-label="Sets"
                title="Sets"
              />
              <input
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                type="number"
                min="0"
                value={reps}
                onChange={(event) => setReps(Number(event.target.value))}
                aria-label="Reps"
                title="Reps"
              />
              <input
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                type="number"
                min="0"
                step="2.5"
                value={weight}
                onChange={(event) => setWeight(Number(event.target.value))}
                aria-label="Weight lb"
                title="Weight lb"
              />
              <button
                type="button"
                onClick={addExerciseSets}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-300 px-4 py-3 font-semibold text-black"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              {filteredExercises.slice(0, 8).map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  onClick={() => {
                    setSelectedExerciseId(exercise.id);
                    setProgressExerciseId(exercise.id);
                    setExerciseSearch(exercise.name);
                  }}
                  className={`rounded-2xl border p-3 text-left transition ${
                    selectedExerciseId === exercise.id
                      ? "border-lime-300 bg-lime-300/10"
                      : "border-white/10 bg-white/5 hover:bg-white/8"
                  }`}
                >
                  <div className="font-semibold">{exercise.name}</div>
                  <div className="muted text-sm">{exercise.muscle_group}</div>
                </button>
              ))}
            </div>

            <div className="mt-5">
              <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold">
                <CalendarDays className="h-5 w-5 text-cyan-300" />
                {formatShortDate(selectedDate)}
              </h2>
              <div className="space-y-2">
                {currentSets.map((set) => (
                  <div
                    key={set.id}
                    className="surface-strong grid gap-2 rounded-2xl p-3 sm:grid-cols-[1fr_80px_100px_44px] sm:items-center"
                  >
                    <div>
                      <div className="font-semibold">{set.exercise_name}</div>
                      <div className="muted text-sm">Set {set.set_number}</div>
                    </div>
                    <div>{set.reps} reps</div>
                    <div>{set.weight_lb} lb</div>
                    <button
                      type="button"
                      onClick={() => deleteSet(set.id)}
                      className="grid h-10 w-10 place-items-center rounded-xl bg-white/6"
                      aria-label={`Delete ${set.exercise_name} set ${set.set_number}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {currentSets.length === 0 && (
                  <p className="muted rounded-2xl bg-white/[0.03] p-4 text-sm">
                    No exercises logged for this day yet.
                  </p>
                )}
              </div>
            </div>
            {message && <p className="muted mt-4 text-sm">{message}</p>}
          </div>

          <aside className="space-y-4">
            <section className="surface rounded-3xl p-5">
              <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold">
                <Play className="h-5 w-5 text-lime-300" />
                Exercise video
              </h2>
              {selectedExercise ? (
                <ExercisePreview exercise={selectedExercise} />
              ) : (
                <p className="muted text-sm">Pick an exercise to see instructions and video.</p>
              )}
            </section>

            <section className="surface rounded-3xl p-5">
              <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold">
                <TrendingUp className="h-5 w-5 text-cyan-300" />
                Weight progress
              </h2>
              <select
                className="mb-3 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                value={progressExercise?.id || ""}
                onChange={(event) => setProgressExerciseId(event.target.value)}
              >
                {exercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <SummaryCard label="Latest" value={latestProgress ? `${latestProgress.weight} lb` : "-"} />
                <SummaryCard label="Best" value={bestWeight ? `${bestWeight} lb` : "-"} />
                <SummaryCard
                  label="Change"
                  value={
                    latestProgress && previousProgress
                      ? `${roundOne(latestProgress.weight - previousProgress.weight)} lb`
                      : "-"
                  }
                />
              </div>
              <div className="mt-3 space-y-2">
                {progressEntries.slice(-8).reverse().map((entry) => (
                  <div key={entry.date} className="grid grid-cols-[1fr_auto] rounded-xl bg-white/5 px-3 py-2 text-sm">
                    <span>{formatShortDate(entry.date)}</span>
                    <strong>{entry.weight} lb</strong>
                  </div>
                ))}
                {progressEntries.length === 0 && (
                  <p className="muted rounded-xl bg-white/5 p-3 text-sm">Log this exercise to see weight progress.</p>
                )}
              </div>
            </section>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="surface rounded-3xl p-5">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
              <Dumbbell className="h-5 w-5 text-lime-300" />
              Exercise library
            </h2>
            <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]">
              <input
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                placeholder="Search by name, muscle, equipment"
                value={exerciseSearch}
                onChange={(event) => setExerciseSearch(event.target.value)}
              />
              <select
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                value={muscleFilter}
                onChange={(event) => setMuscleFilter(event.target.value)}
              >
                {muscleGroups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {filteredExercises.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  onClick={() => {
                    setSelectedExerciseId(exercise.id);
                    setProgressExerciseId(exercise.id);
                  }}
                  className="surface-strong rounded-2xl p-3 text-left hover:bg-white/8"
                >
                  <div className="font-semibold">{exercise.name}</div>
                  <div className="muted text-sm">
                    {exercise.muscle_group}
                    {exercise.equipment ? ` - ${exercise.equipment}` : ""}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-3xl bg-white/[0.03] p-4">
              <h3 className="mb-3 text-lg font-semibold">Add custom exercise</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white sm:col-span-2"
                  placeholder="Exercise name"
                  value={newExerciseName}
                  onChange={(event) => setNewExerciseName(event.target.value)}
                />
                <select
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  value={newExerciseMuscle}
                  onChange={(event) => setNewExerciseMuscle(event.target.value)}
                >
                  {muscleGroups.filter((group) => group !== "All").map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  placeholder="Equipment"
                  value={newExerciseEquipment}
                  onChange={(event) => setNewExerciseEquipment(event.target.value)}
                />
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white sm:col-span-2"
                  placeholder="Video URL"
                  value={newExerciseVideoUrl}
                  onChange={(event) => setNewExerciseVideoUrl(event.target.value)}
                />
                <textarea
                  className="min-h-24 rounded-2xl border border-white/10 bg-white/5 p-3 text-white sm:col-span-2"
                  placeholder="Notes or form cues"
                  value={newExerciseInstructions}
                  onChange={(event) => setNewExerciseInstructions(event.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={saveExercise}
                className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-3 font-semibold"
              >
                <Save className="h-4 w-4" />
                Save exercise
              </button>
            </div>
          </section>

          <section className="surface rounded-3xl p-5">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
              <Activity className="h-5 w-5 text-fuchsia-300" />
              Saved routines
            </h2>
            <div className="rounded-3xl bg-white/[0.03] p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  placeholder="Routine name, e.g. Legs"
                  value={routineName}
                  onChange={(event) => setRoutineName(event.target.value)}
                />
                <select
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  value={routineFocus}
                  onChange={(event) => setRoutineFocus(event.target.value)}
                >
                  {muscleGroups.filter((group) => group !== "All").map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={saveRoutine}
                  className="rounded-2xl bg-lime-300 px-4 py-3 font-semibold text-black"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-3xl bg-white/[0.03] p-4">
              <select
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                value={selectedRoutineId}
                onChange={(event) => setSelectedRoutineId(event.target.value)}
              >
                <option value="">Choose routine</option>
                {routines.map((routine) => (
                  <option key={routine.id} value={routine.id}>
                    {routine.name}
                  </option>
                ))}
              </select>
              <div className="grid gap-3 sm:grid-cols-[1fr_90px_100px_auto]">
                <select
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  value={routineExerciseId}
                  onChange={(event) => setRoutineExerciseId(event.target.value)}
                >
                  <option value="">Add exercise</option>
                  {exercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  type="number"
                  min="1"
                  value={routineSets}
                  onChange={(event) => setRoutineSets(Number(event.target.value))}
                  aria-label="Routine sets"
                  title="Sets"
                />
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  value={routineReps}
                  onChange={(event) => setRoutineReps(event.target.value)}
                  aria-label="Routine reps"
                  title="Reps"
                />
                <button
                  type="button"
                  onClick={addExerciseToRoutine}
                  className="rounded-2xl bg-white/8 px-4 py-3 font-semibold"
                >
                  Add
                </button>
              </div>
              <button
                type="button"
                onClick={loadRoutineForDate}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 font-semibold text-black"
              >
                <Plus className="h-4 w-4" />
                Load routine into selected day
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {routines.map((routine) => {
                const items = routineItems
                  .filter((item) => item.routine_id === routine.id)
                  .sort((a, b) => a.sort_order - b.sort_order);
                return (
                  <article key={routine.id} className="surface-strong rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">{routine.name}</h3>
                        <p className="muted text-sm">
                          {routine.focus || "Routine"} - {items.length} exercise{items.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedRoutineId(routine.id)}
                        className="rounded-xl bg-white/8 px-3 py-2 text-sm font-semibold"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {items.map((item) => (
                        <div key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl bg-black/15 px-3 py-2 text-sm">
                          <span>{item.exercise_name}</span>
                          <span className="muted">{item.target_sets} x {item.target_reps}</span>
                          <button
                            type="button"
                            onClick={() => deleteRoutineItem(item.id)}
                            className="rounded-lg bg-white/6 p-2"
                            aria-label={`Remove ${item.exercise_name} from ${routine.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
              {routines.length === 0 && (
                <p className="muted rounded-2xl bg-white/[0.03] p-4 text-sm">
                  Save routines like Legs, Chest, Pull, or Full body here.
                </p>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function ExercisePreview({ exercise }: { exercise: Exercise }) {
  const embedUrl = getVideoEmbedUrl(exercise.video_url);
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${exercise.name} exercise form`
  )}`;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold">{exercise.name}</h3>
        <p className="muted text-sm">
          {exercise.muscle_group}
          {exercise.equipment ? ` - ${exercise.equipment}` : ""}
        </p>
      </div>
      {embedUrl ? (
        <iframe
          className="aspect-video w-full rounded-2xl border border-white/10 bg-black"
          src={embedUrl}
          title={`${exercise.name} video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <a
          className="inline-flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-3 text-sm font-semibold"
          href={exercise.video_url || searchUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="h-4 w-4" />
          {exercise.video_url ? "Open video" : "Search video"}
        </a>
      )}
      {exercise.instructions && <p className="muted text-sm">{exercise.instructions}</p>}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-3">
      <div className="muted text-xs">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}

function getVideoEmbedUrl(videoUrl?: string | null) {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes("youtube.com")) {
      const watchId = url.searchParams.get("v");
      const shortsId = url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] : "";
      const embedId = watchId || shortsId;
      return embedId ? `https://www.youtube.com/embed/${embedId}` : videoUrl;
    }
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : videoUrl;
    }
    return videoUrl;
  } catch {
    return null;
  }
}

function buildProgressEntries(
  exercise: Exercise | undefined,
  logs: WorkoutLog[],
  sets: WorkoutLogSet[]
) {
  if (!exercise) return [];
  const entries = logs.flatMap((log) => {
    const matchingSets = sets.filter(
      (set) =>
        set.workout_log_id === log.id &&
        (set.exercise_id === exercise.id || set.exercise_name === exercise.name)
    );
    if (matchingSets.length === 0) return [];
    return [
      {
        date: log.workout_date,
        weight: Math.max(...matchingSets.map((set) => Number(set.weight_lb))),
      },
    ];
  });

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

function findLastWeight(
  item: ExerciseRoutineItem,
  logs: WorkoutLog[],
  sets: WorkoutLogSet[]
) {
  const matchingLogs = [...logs].sort((a, b) => b.workout_date.localeCompare(a.workout_date));
  for (const log of matchingLogs) {
    const matchingSet = sets.find(
      (set) =>
        set.workout_log_id === log.id &&
        (set.exercise_id === item.exercise_id || set.exercise_name === item.exercise_name)
    );
    if (matchingSet) return Number(matchingSet.weight_lb);
  }
  return 0;
}

function parseReps(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 10;
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = year && month && day ? new Date(year, month - 1, day) : new Date(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function roundOne(value: number) {
  return Number(value.toFixed(1));
}
