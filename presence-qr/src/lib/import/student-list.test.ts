import { describe, expect, it } from "vitest";
import { decodeText, parseCsv } from "./csv";
import { rowsToStudents } from "./student-list";

const csv = (text: string) => rowsToStudents(parseCsv(text));

describe("lecture CSV", () => {
  it("lit un CSV « ; » avec BOM (Excel français)", () => {
    const bytes = new TextEncoder().encode("﻿Matricule;Nom;Prénom\r\n20260001;Fictif;Alpha\r\n");
    const r = rowsToStudents(parseCsv(decodeText(bytes)));
    expect(r.errors).toEqual([]);
    expect(r.students).toEqual([{ line: 2, matricule: "20260001", nom: "Fictif", prenom: "Alpha" }]);
  });

  it("lit un CSV encodé en Windows-1252 (accents)", () => {
    // « Prénom;Hélène » encodé en Windows-1252 : é = 0xE9
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("Matricule;Nom;Pr"), 0xe9, ...new TextEncoder().encode("nom\n20260001;Fictif;H"),
      0xe9, ...new TextEncoder().encode("l"), 0xe8, ...new TextEncoder().encode("ne\n"),
    ]);
    const r = rowsToStudents(parseCsv(decodeText(bytes)));
    expect(r.students[0].prenom).toBe("Hélène");
  });

  it("gère la virgule et les guillemets", () => {
    const r = csv('Matricule,Nom,Prénom\n20260001,"Fictif, dit ""Test""",Alpha\n');
    expect(r.students[0].nom).toBe('Fictif, dit "Test"');
  });

  it("trouve l'en-tête sous des lignes de titre et ignore les colonnes en plus", () => {
    const r = csv(
      "Université fictive;;;\nListe des étudiants — L1 G1;;;\n;;;\nN°;N° Matricule;Nom;Prénom;Observation\n1;2026 0001;Fictif;Alpha;\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.students).toEqual([{ line: 5, matricule: "20260001", nom: "Fictif", prenom: "Alpha" }]);
  });

  it("ignore les lignes vides et nettoie les espaces", () => {
    const r = csv("Matricule;Nom;Prénom\n;;\n 20260001 ;  Fictif   Test ; Alpha \n\n");
    expect(r.students).toEqual([{ line: 3, matricule: "20260001", nom: "Fictif Test", prenom: "Alpha" }]);
  });
});

describe("validation de la liste", () => {
  it("signale les colonnes manquantes", () => {
    const r = csv("Code;Nom\n1;Fictif\n");
    expect(r.students).toEqual([]);
    expect(r.errors[0].message).toContain("Colonnes introuvables");
  });

  it("signale une colonne « Nom et prénom » unique", () => {
    const r = csv("Matricule;Nom et Prénom\n20260001;Fictif Alpha\n");
    expect(r.errors[0].message).toContain("une seule colonne");
  });

  it("signale les doublons, matricules invalides et noms manquants avec le numéro de ligne", () => {
    const r = csv(
      "Matricule;Nom;Prénom\n20260001;Fictif;Alpha\n20260001;Fictif;Bis\n#?!;Fictif;Beta\n20260003;;Gamma\n",
    );
    expect(r.students.map((s) => s.matricule)).toEqual(["20260001"]);
    expect(r.errors).toEqual([
      { line: 3, message: "Matricule 20260001 en double (déjà présent ligne 2)" },
      { line: 4, message: "Matricule invalide : « #?! »" },
      { line: 5, message: "Nom ou prénom manquant (matricule 20260003)" },
    ]);
  });

  it("refuse plus de 2000 étudiants", () => {
    const lines = Array.from({ length: 2001 }, (_, i) => `M${String(i).padStart(5, "0")};N;P`);
    const r = csv(`Matricule;Nom;Prénom\n${lines.join("\n")}\n`);
    expect(r.errors.at(-1)?.message).toContain("2000 au maximum");
  });
});
