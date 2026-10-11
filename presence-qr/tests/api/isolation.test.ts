// Tests d'isolation par requêtes HTTP DIRECTES à l'API Supabase (REST,
// GraphQL, RPC), sans passer par l'interface. Données 100 % fictives.
//
// Lancement : npm run test:api (Supabase local démarré : npx supabase start).
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  API_URL,
  PUBLISHABLE_KEY,
  fictiveMatricule,
  forgeJwt,
  newClient,
  signUpFictiveUser,
} from "./helpers";

type Client = SupabaseClient<Database>;

const TABLES_WITH_INSTITUTION = [
  "departments",
  "memberships",
  "semesters",
  "modules",
  "groups",
  "students",
  "group_students",
  "teaching_assignments",
  "class_sessions",
  "attendance",
  "audit_log",
] as const;

let alice: { client: Client; userId: string; token: string };
let bob: { client: Client; userId: string; token: string };
let carol: { client: Client; userId: string };
let instA: string;
let instB: string;
let studentA: string;
let assignmentA: string;

beforeAll(async () => {
  if (!API_URL || !PUBLISHABLE_KEY) {
    throw new Error("SUPABASE_TEST_URL et SUPABASE_TEST_PUBLISHABLE_KEY sont requis (voir scripts/test-api.sh)");
  }

  const a = await signUpFictiveUser("alice");
  const b = await signUpFictiveUser("bob");
  const c = await signUpFictiveUser("carol");
  alice = { client: a.client, userId: a.user.id, token: a.accessToken };
  bob = { client: b.client, userId: b.user.id, token: b.accessToken };
  carol = { client: c.client, userId: c.user.id };

  const wa = await alice.client.rpc("create_workspace", { p_name: "Université fictive A" });
  const wb = await bob.client.rpc("create_workspace", { p_name: "Université fictive B" });
  expect(wa.error).toBeNull();
  expect(wb.error).toBeNull();
  instA = wa.data!;
  instB = wb.data!;

  // alice (admin de A) crée des données dans A, par l'API, avec ses droits normaux.
  const sem = await alice.client
    .from("semesters")
    .insert({ institution_id: instA, label: "S1 fictif", start_date: "2026-09-01", end_date: "2027-01-31" })
    .select("id")
    .single();
  const mod = await alice.client
    .from("modules")
    .insert({ institution_id: instA, code: "BIO1", name: "Biologie fictive" })
    .select("id")
    .single();
  const grp = await alice.client
    .from("groups")
    .insert({ institution_id: instA, semester_id: sem.data!.id, name: "G1" })
    .select("id")
    .single();
  const stu = await alice.client
    .from("students")
    .insert({ institution_id: instA, matricule: fictiveMatricule("A"), last_name: "Fictif", first_name: "Alpha" })
    .select("id")
    .single();
  expect(stu.error).toBeNull();
  studentA = stu.data!.id;
  await alice.client
    .from("group_students")
    .insert({ institution_id: instA, group_id: grp.data!.id, student_id: studentA })
    .throwOnError();
  const ta = await alice.client
    .from("teaching_assignments")
    .insert({
      institution_id: instA,
      teacher_id: alice.userId,
      module_id: mod.data!.id,
      group_id: grp.data!.id,
      session_type: "td",
    })
    .select("id")
    .single();
  expect(ta.error).toBeNull();
  assignmentA = ta.data!.id;
  await alice.client
    .from("class_sessions")
    .insert({ institution_id: instA, assignment_id: assignmentA, scheduled_at: new Date().toISOString() })
    .throwOnError();

  // bob crée un étudiant dans B.
  await bob.client
    .from("students")
    .insert({ institution_id: instB, matricule: fictiveMatricule("B"), last_name: "Fictif", first_name: "Beta" })
    .throwOnError();
});

describe("visiteur anonyme (clé publique seule)", () => {
  const anon = () => newClient();

  it.each(["students", "attendance", "institutions", "session_tokens", "checkin_attempts", "audit_log"] as const)(
    "lecture de %s refusée",
    async (table) => {
      const { error } = await anon().from(table).select("*");
      expect(error?.code).toBe("42501");
    },
  );

  it("insertion directe d'une présence refusée", async () => {
    const { error } = await anon().from("attendance").insert({
      institution_id: instA,
      session_id: assignmentA,
      student_id: studentA,
      status: "present",
      source: "qr",
    });
    expect(error?.code).toBe("42501");
  });

  it("create_workspace refusé", async () => {
    const { error } = await anon().rpc("create_workspace", { p_name: "Pirate" });
    expect(error).not.toBeNull();
  });
});

describe("admin de B contre l'établissement A (accès croisé)", () => {
  it("ne voit pas l'établissement A", async () => {
    const { data, error } = await bob.client.from("institutions").select("id").eq("id", instA);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(TABLES_WITH_INSTITUTION)("ne voit aucune ligne de A dans %s", async (table) => {
    const { data, error } = await bob.client.from(table).select("institution_id").eq("institution_id", instA);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("ne voit pas le profil d'alice", async () => {
    const { data } = await bob.client.from("profiles").select("id").eq("id", alice.userId);
    expect(data).toEqual([]);
  });

  it("ne voit que ses propres données (contrôle positif)", async () => {
    const { data } = await bob.client.from("students").select("institution_id");
    expect(data?.length).toBe(1);
    expect(data?.[0].institution_id).toBe(instB);
  });

  it("ne peut pas renommer A", async () => {
    const { data } = await bob.client.from("institutions").update({ name: "Piratée" }).eq("id", instA).select();
    expect(data ?? []).toEqual([]);
    const check = await alice.client.from("institutions").select("name").eq("id", instA).single();
    expect(check.data?.name).toBe("Université fictive A");
  });

  it("ne peut pas supprimer les étudiants de A", async () => {
    const { data } = await bob.client.from("students").delete().eq("institution_id", instA).select();
    expect(data ?? []).toEqual([]);
    const check = await alice.client.from("students").select("id").eq("id", studentA);
    expect(check.data?.length).toBe(1);
  });

  it("ne peut pas se déclarer admin de A", async () => {
    const { error } = await bob.client
      .from("memberships")
      .insert({ institution_id: instA, user_id: bob.userId, role: "admin" });
    expect(error?.code).toBe("42501");
  });

  it("ne peut pas créer d'étudiant dans A", async () => {
    const { error } = await bob.client
      .from("students")
      .insert({ institution_id: instA, matricule: fictiveMatricule("P"), last_name: "Pirate", first_name: "Test" });
    expect(error?.code).toBe("42501");
  });

  it("ne peut pas créer de séance sur une affectation de A", async () => {
    const { error } = await bob.client
      .from("class_sessions")
      .insert({ institution_id: instA, assignment_id: assignmentA, scheduled_at: new Date().toISOString() });
    expect(error?.code).toBe("42501");
  });

  it("ne voit rien de A via l'API GraphQL", async () => {
    const res = await fetch(`${API_URL}/graphql/v1`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${bob.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ studentsCollection { edges { node { id institution_id } } } }" }),
    });
    const body = await res.json();
    const ids = (body?.data?.studentsCollection?.edges ?? []).map(
      (e: { node: { institution_id: string } }) => e.node.institution_id,
    );
    expect(ids).not.toContain(instA);
  });
});

describe("surface d'API", () => {
  it("le schéma private n'est pas accessible par l'API REST", async () => {
    const res = await fetch(`${API_URL}/rest/v1/memberships?select=*`, {
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${bob.token}`, "Accept-Profile": "private" },
    });
    expect(res.ok).toBe(false);
  });

  it("les fonctions d'aide internes ne sont pas appelables", async () => {
    const res = await fetch(`${API_URL}/rest/v1/rpc/is_member`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${bob.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_institution: instA }),
    });
    expect(res.ok).toBe(false);
  });

  it("un jeton JWT forgé (fausse signature) est rejeté", async () => {
    const res = await fetch(`${API_URL}/rest/v1/students?select=id`, {
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${forgeJwt(alice.userId)}` },
    });
    expect(res.status).toBe(401);
  });

  it("un enseignant ne peut pas créer de séance déjà « ouverte » (statut imposé par la base)", async () => {
    const { error } = await alice.client.from("class_sessions").insert({
      institution_id: instA,
      assignment_id: assignmentA,
      scheduled_at: new Date().toISOString(),
      status: "open",
      opened_at: new Date().toISOString(),
    });
    expect(error?.code).toBe("42501");
  });
});

describe("enseignant ajouté à A par l'admin", () => {
  it("ne voit rien avant d'être ajouté", async () => {
    const { data } = await carol.client.from("institutions").select("id");
    expect(data).toEqual([]);
  });

  it("une fois ajouté, voit l'établissement mais aucun étudiant hors de ses groupes", async () => {
    await alice.client
      .from("memberships")
      .insert({ institution_id: instA, user_id: carol.userId, role: "enseignant" })
      .throwOnError();

    const inst = await carol.client.from("institutions").select("id");
    expect(inst.data?.map((r) => r.id)).toEqual([instA]);

    const students = await carol.client.from("students").select("id");
    expect(students.data).toEqual([]);
  });

  it("ne peut pas se promouvoir admin", async () => {
    const { error } = await carol.client
      .from("memberships")
      .insert({ institution_id: instA, user_id: carol.userId, role: "admin" });
    expect(error?.code).toBe("42501");
  });
});
