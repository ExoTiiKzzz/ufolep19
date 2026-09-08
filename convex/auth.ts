import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { DataModel } from "./_generated/dataModel";

/**
 * Provider mot de passe, **sans inscription publique**.
 *
 * `profile` est appelé pour tous les flux du provider, y compris `signUp`. On s'en sert
 * pour fermer ce flux : seul un administrateur crée des comptes, via `createAccount`
 * côté serveur, qui ne passe pas par ce callback.
 */
const PasswordWithoutPublicSignUp = Password<DataModel>({
  profile(params) {
    if (params.flow === "signUp") {
      throw new ConvexError(
        "L'inscription publique est désactivée : les comptes sont créés par un administrateur.",
      );
    }
    const email = params.email;
    if (typeof email !== "string") {
      throw new ConvexError("Adresse e-mail manquante.");
    }
    // Valeurs utilisées uniquement si un compte devait être créé par ce flux, ce qui
    // n'arrive jamais : le rôle réel est fixé à la création du compte par l'administrateur.
    return { email: email.trim().toLowerCase(), role: "player" };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordWithoutPublicSignUp],
});
