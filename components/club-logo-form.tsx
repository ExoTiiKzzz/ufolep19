"use client";

import { useMutation } from "convex/react";
import { useRef, useState } from "react";

import { ClubLogo } from "@/components/club-logo";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ACCEPTED_LOGO_TYPES } from "@/lib/rules/logo";
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
  const input = useRef<HTMLInputElement>(null);
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
      if (input.current !== null) {
        input.current.value = "";
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ClubLogo name={name} logoUrl={logoUrl} size={48} />
      <div className="flex flex-col gap-1">
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_LOGO_TYPES.join(",")}
          aria-label={`Logo de ${name}`}
          className="text-muted-foreground text-sm"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) {
              void upload(file);
            }
          }}
        />
        <span className="text-muted-foreground text-xs">
          PNG, JPEG, WebP ou GIF, 2 Mo au maximum.
        </span>
      </div>
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
          Retirer le logo
        </Button>
      )}
      {pending ? <span className="text-muted-foreground text-sm">Envoi…</span> : null}
      {error === null ? null : <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
