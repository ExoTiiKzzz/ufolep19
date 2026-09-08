import { createAccount, getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
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
    if (args.password.length < 8) {
      throw new Error("Le mot de passe doit faire au moins 8 caractères.");
    }

    const existing = await ctx.runQuery(internal.users.byEmail, { email });
    if (existing !== null) {
      throw new Error(
        `Un compte existe déjà pour ${email} : aucune modification. ` +
          "Pour changer un mot de passe, passez par le dashboard Convex.",
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

/**
 * Crée un compte depuis l'interface d'administration.
 *
 * C'est une **action** et non une mutation : `createAccount` de Convex Auth exige un
 * contexte d'action pour hacher le mot de passe. Le rôle de l'appelant est donc
 * revérifié par une query interne, `ctx.db` n'étant pas accessible ici.
 */
export const createUserAccount = action({
  args: { email: v.string(), password: v.string(), name: v.string(), role },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.users.assertAdmin, { userId: await getAuthUserId(ctx) });

    const email = args.email.trim().toLowerCase();
    if (email === "") {
      throw new Error("L'adresse e-mail est obligatoire.");
    }
    if (args.password.length < 8) {
      throw new Error("Le mot de passe doit faire au moins 8 caractères.");
    }
    const existing = await ctx.runQuery(internal.users.byEmail, { email });
    if (existing !== null) {
      throw new Error(`Un compte existe déjà pour ${email}.`);
    }

    const { user } = await createAccount<DataModel>(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: { email, name: args.name.trim(), role: args.role },
    });
    return user._id;
  },
});
