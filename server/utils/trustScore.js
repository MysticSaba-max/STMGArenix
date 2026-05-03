/**
 * STMG TrustScore — algorithme unique de classement des sites.
 *
 * Inspiré de Trustpilot, IMDb et Reddit, mais corrigé pour les défauts identifiés
 * dans les versions précédentes (Wilson mal appliqué aux notes 1-5, prior biaisé
 * par les sites dominants, pas de décroissance temporelle, seuil trop bas).
 *
 * Composants :
 *   1. Lissage bayésien fort (prior neutre 50% pour binaire, μ_cat dynamique pour 1-5)
 *   2. Décroissance exponentielle des votes anciens (demi-vie de 365 jours)
 *   3. Borne inférieure de confiance à 95% (Z=1.96) pour les deux modes
 *   4. Variance plancher à σ=1.0 — on ne fait pas confiance aux petits échantillons consensuels
 *   5. Seuils différents : 5 votes binaire, 10 votes catégorie (sinon → "Nouveau")
 *
 * Les agrégats time-weighted (weighted_count, weighted_sum, weighted_up, weighted_down)
 * sont calculés directement en SQL via EXP(-LN(2) * âge / demi-vie).
 */

// Paramètres de l'algorithme
const Z_CATEGORY = 1.96; // Borne de confiance 95% pour les notes 1-5
const Z_BINARY = 1.96; // Borne de confiance 95% pour les votes up/down (standard Reddit)
const M_CATEGORY = 12; // Force du prior bayésien pour les notes 1-5
const K_BINARY = 15; // Force du prior bayésien pour les votes up/down
const P0_BINARY = 0.5; // Prior neutre pour le binaire (évite biais des sites dominants)
const SIGMA_FLOOR = 1.0; // Écart-type minimum — assume incertitude réaliste pour petits échantillons
const SIGMA_FALLBACK = 1.0; // Écart-type par défaut pour n < 2
const MIN_VOTES_FOR_RANK = 5; // Seuil binaire (up/down) — un signal binaire est lisible avec peu de votes
const MIN_VOTES_FOR_CATEGORY = 10; // Seuil catégories (1-5) — une note continue demande plus de données

/**
 * Calcule le TrustScore pour une liste de sites notés sur 1-5.
 *
 * @param {Array} rows - Lignes SQL avec les champs :
 *   id, name, url, logo_path,
 *   raw_count   (nombre brut de votes),
 *   raw_avg     (moyenne brute des notes),
 *   sum_sq      (somme des carrés des notes, pour la variance),
 *   weighted_count (nombre effectif après décroissance temporelle),
 *   weighted_sum   (somme pondérée des notes)
 * @returns {Array} Sites enrichis et triés (TrustScore décroissant, sites peu votés en bas).
 */
export function computeCategoryTrustScores(rows) {
  // Étape 1 : prior dynamique = moyenne globale pondérée de tous les sites
  const totalWeight = rows.reduce((s, r) => s + Number(r.weighted_count), 0);
  const totalWeightedSum = rows.reduce((s, r) => s + Number(r.weighted_sum), 0);
  const muCat = totalWeight > 0 ? totalWeightedSum / totalWeight : 3.0;

  const enriched = rows.map((r) => {
    const nEff = Number(r.weighted_count);
    const nRaw = Number(r.raw_count);
    const wSum = Number(r.weighted_sum);
    const sumSq = Number(r.sum_sq);
    const rawAvg = Number(r.raw_avg);

    // Moyenne pondérée temps (utilise les votes récents davantage)
    const xWeighted = nEff > 0 ? wSum / nEff : muCat;

    // Étape 2 : lissage bayésien avec prior dynamique
    const bayesMean =
      (nEff * xWeighted + M_CATEGORY * muCat) / (nEff + M_CATEGORY);

    // Étape 3 : écart-type du site (basé sur les votes bruts, plus stable)
    let sigmaSite;
    if (nRaw >= 2) {
      const variance = Math.max(0, sumSq / nRaw - rawAvg * rawAvg);
      sigmaSite = Math.sqrt(variance);
    } else {
      sigmaSite = SIGMA_FALLBACK;
    }
    sigmaSite = Math.max(sigmaSite, SIGMA_FLOOR);

    // Étape 4 : borne inférieure d'intervalle de confiance
    const standardError = sigmaSite / Math.sqrt(nEff + M_CATEGORY);
    const trustRaw = bayesMean - Z_CATEGORY * standardError;
    const trustScore = Math.max(1.0, Math.min(5.0, trustRaw));

    return {
      id: r.id,
      name: r.name,
      url: r.url,
      logo_path: r.logo_path,
      avg_score: Number(rawAvg.toFixed(2)),
      vote_count: nRaw,
      weighted_count: Number(nEff.toFixed(2)),
      trust_score: Number(trustScore.toFixed(3)),
      has_enough_votes: nEff >= MIN_VOTES_FOR_CATEGORY,
      distribution: {
        1: Number(r.count_1) || 0,
        2: Number(r.count_2) || 0,
        3: Number(r.count_3) || 0,
        4: Number(r.count_4) || 0,
        5: Number(r.count_5) || 0,
      },
    };
  });

  return enriched.sort(compareTrust);
}

/**
 * Calcule le TrustScore pour les votes binaires (up/down).
 *
 * Ici Wilson est mathématiquement valide (les votes SONT bernoullis).
 * On l'applique sur des pseudo-comptes lissés (Bayes + Wilson combinés).
 *
 * @param {Array} rows - Lignes SQL avec :
 *   id, name, url, logo_path,
 *   upvotes, downvotes (bruts),
 *   weighted_up, weighted_down (avec décroissance temporelle)
 * @returns {Array} Sites enrichis et triés.
 */
export function computeBinaryTrustScores(rows) {
  // Prior NEUTRE 50% — pas de biais provenant des sites dominants du dataset
  const p0 = P0_BINARY;

  const enriched = rows.map((r) => {
    const wUp = Number(r.weighted_up);
    const wDown = Number(r.weighted_down);
    const nEff = wUp + wDown;
    const upRaw = Number(r.upvotes);
    const downRaw = Number(r.downvotes);

    // Wilson appliqué sur les pseudo-comptes lissés par le prior bayésien
    const smoothedUp = wUp + K_BINARY * p0;
    const smoothedTotal = nEff + K_BINARY;
    const p = smoothedUp / smoothedTotal;
    const z = Z_BINARY;
    const wilsonLower =
      (p +
        (z * z) / (2 * smoothedTotal) -
        z *
          Math.sqrt(
            (p * (1 - p) + (z * z) / (4 * smoothedTotal)) / smoothedTotal,
          )) /
      (1 + (z * z) / smoothedTotal);
    const trustScore = Math.max(0, Math.min(1, wilsonLower));

    return {
      id: r.id,
      name: r.name,
      url: r.url,
      logo_path: r.logo_path,
      upvotes: upRaw,
      downvotes: downRaw,
      score: upRaw - downRaw, // conservé pour rétrocompatibilité
      weighted_count: Number(nEff.toFixed(2)),
      trust_score: Number(trustScore.toFixed(4)),
      has_enough_votes: nEff >= MIN_VOTES_FOR_RANK,
    };
  });

  return enriched.sort((a, b) => {
    if (a.has_enough_votes !== b.has_enough_votes) {
      return a.has_enough_votes ? -1 : 1;
    }
    const diff = b.trust_score - a.trust_score;
    if (Math.abs(diff) > 1e-9) return diff;
    const totA = a.upvotes + a.downvotes;
    const totB = b.upvotes + b.downvotes;
    if (totA !== totB) return totB - totA;
    return b.upvotes - a.upvotes;
  });
}

function compareTrust(a, b) {
  if (a.has_enough_votes !== b.has_enough_votes) {
    return a.has_enough_votes ? -1 : 1;
  }
  const diff = b.trust_score - a.trust_score;
  if (Math.abs(diff) > 1e-9) return diff;
  return b.vote_count - a.vote_count;
}

// Exposé pour tests / debug
export const TRUST_PARAMS = {
  Z_CATEGORY,
  Z_BINARY,
  M_CATEGORY,
  K_BINARY,
  P0_BINARY,
  SIGMA_FLOOR,
  SIGMA_FALLBACK,
  MIN_VOTES_FOR_RANK,
  MIN_VOTES_FOR_CATEGORY,
  HALF_LIFE_DAYS: 365,
};
