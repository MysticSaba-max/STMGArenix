import { createHash } from "crypto";

/**
 * Hash unifié des adresses IP utilisé par tous les middlewares de sécurité
 * (antibot, vpn, turnstile, voteRateLimit).
 *
 * Pepperisation avec JWT_SECRET pour empêcher la rétro-corrélation d'un ip_hash
 * en clair en cas de fuite de la table bot_attempts (un attaquant qui voudrait
 * vérifier si "son" IP est connue ne peut pas pré-calculer le hash sans le pepper).
 *
 * Une fonction unique garantit que le même client produit le même ip_hash dans
 * toutes les tables et tous les caches — sans quoi les jointures et corrélations
 * cross-middleware retourneraient silencieusement de mauvais résultats.
 */
export function hashIp(ip) {
  return createHash("sha256")
    .update(String(ip ?? "") + (process.env.JWT_SECRET || "salt"))
    .digest("hex");
}
