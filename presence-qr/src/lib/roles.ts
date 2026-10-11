export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  enseignant: "Enseignant(e)",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
