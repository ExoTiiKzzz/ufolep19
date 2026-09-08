/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminViews from "../adminViews.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as championships from "../championships.js";
import type * as clubs from "../clubs.js";
import type * as http from "../http.js";
import type * as matchdays from "../matchdays.js";
import type * as matches from "../matches.js";
import type * as negotiation from "../negotiation.js";
import type * as players from "../players.js";
import type * as roster from "../roster.js";
import type * as seasons from "../seasons.js";
import type * as sheets from "../sheets.js";
import type * as standings from "../standings.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminViews: typeof adminViews;
  auth: typeof auth;
  authz: typeof authz;
  championships: typeof championships;
  clubs: typeof clubs;
  http: typeof http;
  matchdays: typeof matchdays;
  matches: typeof matches;
  negotiation: typeof negotiation;
  players: typeof players;
  roster: typeof roster;
  seasons: typeof seasons;
  sheets: typeof sheets;
  standings: typeof standings;
  teams: typeof teams;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
