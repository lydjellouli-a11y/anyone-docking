// Traduction des erreurs Supabase Auth en messages compréhensibles.
// Les messages restent volontairement vagues quand il s'agit d'identifiants
// (on ne révèle pas si un e-mail existe ou non).

type AuthLikeError = { code?: string; status?: number; message?: string; name?: string };

export function authErrorMessage(error: AuthLikeError | null | undefined): string {
  if (!error) return "";
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Votre adresse e-mail n'est pas encore confirmée. Vérifiez votre boîte de réception.";
    case "user_already_exists":
    case "email_exists":
      return "Impossible de créer ce compte. Si vous avez déjà un compte, connectez-vous.";
    case "weak_password":
      return "Mot de passe trop faible : 10 caractères minimum, avec minuscule, majuscule et chiffre.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
    case "same_password":
      return "Le nouveau mot de passe doit être différent de l'ancien.";
  }
  if (error.name === "AuthRetryableFetchError" || error.status === 0) {
    return "Connexion au serveur impossible. Vérifiez votre réseau et réessayez.";
  }
  return "Une erreur est survenue. Réessayez dans un instant.";
}
