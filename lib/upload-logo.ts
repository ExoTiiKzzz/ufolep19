import type { Id } from "@/convex/_generated/dataModel";

import { rejectLogo } from "./rules/logo";

export type LogoUploadResult =
  | { storageId: Id<"_storage">; error: null }
  | { storageId: null; error: string };

/**
 * Dépose un logo dans le stockage Convex et rend son identifiant.
 *
 * Le fichier est d'abord contrôlé avec les mêmes règles que le serveur, pour ne pas envoyer
 * un fichier voué au refus. Le serveur revalide de toute façon : c'est lui qui fait autorité.
 */
export async function uploadLogo(
  generateUploadUrl: () => Promise<string>,
  file: File,
): Promise<LogoUploadResult> {
  const rejection = rejectLogo({ contentType: file.type, size: file.size });
  if (rejection !== null) {
    return { storageId: null, error: rejection };
  }
  try {
    const url = await generateUploadUrl();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) {
      return { storageId: null, error: "L'envoi du fichier a échoué." };
    }
    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
    return { storageId, error: null };
  } catch (caught) {
    return {
      storageId: null,
      error: caught instanceof Error ? caught.message : "Envoi impossible.",
    };
  }
}
