import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

// Convention `proxy` de Next 16, qui remplace `middleware`. Rafraîchit le jeton
// d'authentification et le rend disponible côté serveur. Ne protège aucune route : les
// autorisations sont revérifiées dans chaque fonction Convex, seule autorité en la
// matière.
export default convexAuthNextjsMiddleware();

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
