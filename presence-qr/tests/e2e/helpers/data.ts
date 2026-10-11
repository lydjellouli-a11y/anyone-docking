// Création rapide de données fictives via l'API Supabase, avec le compte de
// l'enseignante (clé publique + son mot de passe : la RLS s'applique).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database.types";
import { PASSWORD } from "./account";

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} absent de .env.local`);
  return line.slice(name.length + 1).trim();
}

export async function teacherClient(email: string) {
  const client = createClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw error;
  return { client, userId: data.user.id };
}

/** TD « Cytologie » du groupe G1 (2 étudiants) ; G2 contient un 3e étudiant. */
export async function seedTdSession(email: string, institutionId: string) {
  const { client, userId } = await teacherClient(email);
  const one = <T>({ data, error }: { data: T; error: unknown }): NonNullable<T> => {
    if (error || !data) throw error ?? new Error("vide");
    return data;
  };
  const sem = one(
    await client
      .from("semesters")
      .insert({
        institution_id: institutionId,
        label: "S1",
        start_date: "2026-09-01",
        end_date: "2027-01-31",
      })
      .select("id")
      .single(),
  );
  const mod = one(
    await client
      .from("modules")
      .insert({
        institution_id: institutionId,
        code: "CYTO",
        name: "Cytologie",
      })
      .select("id")
      .single(),
  );
  const g1 = one(
    await client
      .from("groups")
      .insert({
        institution_id: institutionId,
        semester_id: sem.id,
        name: "G1",
      })
      .select("id")
      .single(),
  );
  const g2 = one(
    await client
      .from("groups")
      .insert({
        institution_id: institutionId,
        semester_id: sem.id,
        name: "G2",
      })
      .select("id")
      .single(),
  );
  one(
    await client.rpc("import_students", {
      p_group_id: g1.id,
      p_rows: [
        { matricule: "20260001", nom: "Fictif", prenom: "Amina" },
        { matricule: "20260002", nom: "Fictif", prenom: "Bilal" },
      ],
    }),
  );
  one(
    await client.rpc("import_students", {
      p_group_id: g2.id,
      p_rows: [{ matricule: "20260003", nom: "Fictif", prenom: "Chahinez" }],
    }),
  );
  const ta = one(
    await client
      .from("teaching_assignments")
      .insert({
        institution_id: institutionId,
        teacher_id: userId,
        module_id: mod.id,
        group_id: g1.id,
        session_type: "td",
      })
      .select("id")
      .single(),
  );
  const session = one(
    await client
      .from("class_sessions")
      .insert({
        institution_id: institutionId,
        assignment_id: ta.id,
        scheduled_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
  );
  return { sessionId: session.id, assignmentId: ta.id };
}
