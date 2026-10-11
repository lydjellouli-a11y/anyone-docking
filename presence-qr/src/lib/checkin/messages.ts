// Messages affichés aux étudiants selon le résultat du pointage.
import { formatTime } from "@/lib/dates";

export type CheckinResult = {
  result: "ok" | "deja_enregistre" | "inconnu" | "pointage_ferme" | "limite" | "seance_introuvable" | "jeton_expire";
  recorded_at?: string;
  display?: string;
};

export function checkinMessage(r: CheckinResult): { ok: boolean; text: string } {
  switch (r.result) {
    case "ok":
      return { ok: true, text: `Présence enregistrée à ${formatTime(r.recorded_at!)} (${r.display}).` };
    case "deja_enregistre":
      return {
        ok: true,
        text: `Votre présence était déjà enregistrée${r.recorded_at ? ` (à ${formatTime(r.recorded_at)})` : ""}.`,
      };
    case "inconnu":
      return {
        ok: false,
        text: "Matricule non reconnu pour cette séance. Vérifiez-le ; en cas de problème, signalez-vous à l'enseignant(e).",
      };
    case "pointage_ferme":
      return { ok: false, text: "Le pointage de cette séance est terminé. Adressez-vous à l'enseignant(e)." };
    case "limite":
      return { ok: false, text: "Trop de tentatives. Adressez-vous à l'enseignant(e)." };
    case "jeton_expire":
      return {
        ok: false,
        text: "Ce QR code a expiré (il change toutes les 20 secondes). Scannez à nouveau le QR code affiché.",
      };
    case "seance_introuvable":
      return { ok: false, text: "Séance introuvable. Vérifiez le code ou scannez à nouveau le QR code." };
  }
}
