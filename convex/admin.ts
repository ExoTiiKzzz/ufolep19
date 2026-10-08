import {
  createAccount,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { passwordProblem, temporaryPassword } from "../lib/rules/password";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { sendAccountCreated } from "./mail";
import { role } from "./schema";

/**
 * Amorçage du premier administrateur, sur une base sans aucun compte.
 *
 * Fonction `internal` : elle n'est pas exposée au client et ne s'exécute que depuis la
 * CLI, qui a les droits d'administration du déploiement :
 *
 * ```bash
 * npx convex run admin:createAdmin '{"email":"...","password":"...","name":"..."}'
 * ```
 *
 * Elle refuse d'écraser un compte existant : en cas de doublon d'e-mail, elle échoue
 * sans rien modifier.
 */
export const createAdmin = internalAction({
  args: { email: v.string(), password: v.string(), name: v.string() },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (email === "") {
      throw new Error("L'adresse e-mail est obligatoire.");
    }
    const problem = passwordProblem(args.password);
    if (problem !== null) {
      throw new Error(problem);
    }

    const existing = await ctx.runQuery(internal.users.byEmail, { email });
    if (existing !== null) {
      throw new Error(
        `Un compte existe déjà pour ${email} : aucune modification.`,
      );
    }

    const { user } = await createAccount<DataModel>(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: { email, name: args.name.trim(), role: "admin" },
    });

    return user._id;
  },
});

/** Ce que l'écran annonce après avoir délivré un mot de passe — voir `lib/account-notice.ts`. */
const issuedAccount = v.object({
  email: v.string(),
  temporaryPassword: v.union(v.string(), v.null()),
  linkedExisting: v.boolean(),
  mail: v.union(v.object({ sent: v.boolean(), error: v.union(v.string(), v.null()) }), v.null()),
});

type IssuedAccount = {
  email: string;
  temporaryPassword: string | null;
  linkedExisting: boolean;
  mail: { sent: boolean; error: string | null } | null;
};

/**
 * Crée un compte depuis l'interface d'administration.
 *
 * Le mot de passe est **généré**, jamais choisi par l'administrateur : il est envoyé à la
 * personne et rendu une seule fois pour l'écran, qui le montre si l'envoi a échoué. La
 * personne le remplace ensuite depuis « Mon compte ».
 *
 * C'est une **action** et non une mutation : `createAccount` de Convex Auth exige un
 * contexte d'action pour hacher le mot de passe. Le rôle de l'appelant est donc
 * revérifié par une query interne, `ctx.db` n'étant pas accessible ici.
 */
export const createUserAccount = action({
  args: { email: v.string(), name: v.string(), role },
  returns: v.object({ userId: v.id("users"), account: issuedAccount }),
  handler: async (
    ctx,
    args,
  ): Promise<{ userId: Id<"users">; account: IssuedAccount }> => {
    await ctx.runQuery(internal.users.assertAdmin, { userId: await getAuthUserId(ctx) });

    const email = args.email.trim().toLowerCase();
    if (email === "") {
      throw new ConvexError("L'adresse e-mail est obligatoire.");
    }
    const existing = await ctx.runQuery(internal.users.byEmail, { email });
    if (existing !== null) {
      throw new ConvexError(`Un compte existe déjà pour ${email}.`);
    }

    const password = temporaryPassword();
    const name = args.name.trim();
    const { user } = await createAccount<DataModel>(ctx, {
      provider: "password",
      account: { id: email, secret: password },
      profile: { email, name, role: args.role },
    });

    // L'envoi ne conditionne pas la création du compte.
    const mail = await sendAccountCreated({ to: email, name, password });
    return {
      userId: user._id,
      account: { email, temporaryPassword: password, linkedExisting: false, mail },
    };
  },
});

/**
 * Attribue un nouveau mot de passe provisoire à un compte dont le titulaire a perdu le sien.
 *
 * Pas de réinitialisation en libre-service : c'est l'administrateur qui délivre les
 * identifiants, et un envoi d'e-mail en panne ne bloque rien puisque le mot de passe est
 * rendu à l'écran. Les sessions ouvertes du compte sont fermées : un mot de passe perdu
 * peut aussi être un mot de passe volé.
 */
export const resetPassword = action({
  args: { userId: v.id("users") },
  returns: issuedAccount,
  handler: async (ctx, { userId }): Promise<IssuedAccount> => {
    await ctx.runQuery(internal.users.assertAdmin, { userId: await getAuthUserId(ctx) });
    const target = await ctx.runQuery(internal.users.credentialsOf, { userId });
    if (target === null) {
      throw new ConvexError("Compte inconnu, ou sans adresse de connexion.");
    }

    const password = temporaryPassword();
    await modifyAccountCredentials<DataModel>(ctx, {
      provider: "password",
      account: { id: target.email, secret: password },
    });
    await invalidateSessions<DataModel>(ctx, { userId });

    const mail = await sendAccountCreated({
      to: target.email,
      name: target.name,
      password,
      kind: "reset",
    });
    return { email: target.email, temporaryPassword: password, linkedExisting: false, mail };
  },
});
