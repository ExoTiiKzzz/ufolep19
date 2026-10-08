import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { passwordProblem } from "../lib/rules/password";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { action } from "./_generated/server";

/**
 * Le titulaire d'un compte remplace son mot de passe, en donnant l'actuel.
 *
 * C'est ce qui rend « provisoire » le mot de passe délivré par la plateforme :
 * l'administrateur n'a rien à retenir. Les autres sessions ouvertes du compte sont fermées,
 * celle d'où vient la demande reste ouverte.
 *
 * Une action : vérifier et hacher un mot de passe exige un contexte d'action dans Convex
 * Auth.
 */
export const change = action({
  args: { current: v.string(), next: v.string() },
  returns: v.null(),
  handler: async (ctx, { current, next }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("Authentification requise.");
    }
    const self = await ctx.runQuery(internal.users.credentialsOf, { userId });
    if (self === null) {
      throw new ConvexError("Ce compte n'a pas d'adresse de connexion.");
    }
    const problem = passwordProblem(next);
    if (problem !== null) {
      throw new ConvexError(problem);
    }
    if (next === current) {
      throw new ConvexError("Le nouveau mot de passe est identique à l'actuel.");
    }

    try {
      await retrieveAccount<DataModel>(ctx, {
        provider: "password",
        account: { id: self.email, secret: current },
      });
    } catch {
      throw new ConvexError("Mot de passe actuel incorrect.");
    }

    await modifyAccountCredentials<DataModel>(ctx, {
      provider: "password",
      account: { id: self.email, secret: next },
    });
    const sessionId = await getAuthSessionId(ctx);
    await invalidateSessions<DataModel>(ctx, {
      userId,
      // `undefined` hors session réelle (jeton sans identifiant de session).
      except: sessionId ? [sessionId] : [],
    });
    return null;
  },
});
