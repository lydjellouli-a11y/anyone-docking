// Traduction des erreurs PostgreSQL / PostgREST en messages compréhensibles.
type DbError = { code?: string; message?: string } | null | undefined;

export function dbErrorMessage(error: DbError, context?: { duplicate?: string; inUse?: string }): string {
  switch (error?.code) {
    case "23505":
      return context?.duplicate ?? "Cet élément existe déjà.";
    case "23503":
      return context?.inUse ?? "Impossible : cet élément est utilisé ailleurs (ou un élément lié est introuvable).";
    case "23514":
    case "P0001":
    case "22023":
      // Messages rédigés en français dans nos fonctions SQL : on les affiche tels quels.
      return error.message?.startsWith("new row") || error.message?.includes("violates")
        ? "Valeur invalide."
        : (error.message ?? "Valeur invalide.");
    case "42501":
      return "Action non autorisée.";
  }
  return "Une erreur est survenue. Vérifiez votre connexion et réessayez.";
}
