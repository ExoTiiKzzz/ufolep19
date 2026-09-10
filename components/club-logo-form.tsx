"use client";

import { useMutation } from "convex/react";
import { useState } from "react";

import { ClubLogo } from "@/components/club-logo";
import { LogoPicker } from "@/components/logo-picker";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { uploadLogo } from "@/lib/upload-logo";

/**
 * Envoi du logo d'un club, réservé à l'administration.
 *
 * Le fichier part directement vers le stockage Convex par une URL signée, puis la mutation
 * l'attache au club. Le même module de règles valide le fichier ici — pour éviter un
 * aller-retour inutile — et côté serveur, qui reste seul à faire autorité.
 */
export function ClubLogoForm({
  clubId,
  name,
  logoUrl,
}: {
  clubId: Id<"clubs">;
  name: string;
  logoUrl: string | null;
}) {
  const generateUploadUrl = useMutation(api.clubs.generateLogoUploadUrl);
  const setLogo = useMutation(api.clubs.setLogo);
  const removeLogo = useMutation(api.clubs.removeLogo);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(file: File) {
    setError(null);
    setPending(true);
    try {
      const upload = await uploadLogo(generateUploadUrl, file);
      if (upload.error !== null) {
        setError(upload.error);
        return;
      }
      const rejection = await setLogo({ clubId, storageId: upload.storageId });
      if (rejection !== null) {
        setError(rejection);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ClubLogo name={name} logoUrl={logoUrl} size={48} />
      <LogoPicker
        inputId={`logo-${clubId}`}
        label={logoUrl === null ? `Ajouter un logo à ${name}` : `Remplacer le logo de ${name}`}
        disabled={pending}
        onPick={(file) => void upload(file)}
      />
      {logoUrl === null ? null : (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={async () => {
            setError(null);
            await removeLogo({ clubId });
          }}
        >
          Retirer
        </Button>
      )}
      <span className="text-muted-foreground text-xs">
        {pending ? "Envoi…" : "PNG, JPEG, WebP ou GIF, 2 Mo au maximum."}
      </span>
      {error === null ? null : <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
