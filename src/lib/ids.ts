/** Random, collision-safe identifiers. Requires a secure context (localhost counts). */
export function newId(): string {
  return crypto.randomUUID();
}
