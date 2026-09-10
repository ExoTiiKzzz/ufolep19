"use client";

import { ACCEPTED_LOGO_TYPES } from "@/lib/rules/logo";
import { cn } from "@/lib/utils";

/**
 * Bouton « + » de choix d'un fichier.
 *
 * C'est un `<label>` et non un `<button>` : cliquer un label associé à un `<input type="file">`
 * ouvre le sélecteur nativement, sans JavaScript, et le champ reste accessible au clavier et
 * aux lecteurs d'écran. L'`<input>` lui-même est masqué visuellement, pas retiré de l'arbre.
 */
export function LogoPicker({
  inputId,
  label,
  disabled = false,
  onPick,
  className,
}: {
  inputId: string;
  label: string;
  disabled?: boolean;
  onPick: (file: File) => void;
  className?: string;
}) {
  return (
    <label
      htmlFor={inputId}
      title={label}
      className={cn(
        "border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border text-lg leading-none font-medium transition-colors",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <span aria-hidden>+</span>
      <span className="sr-only">{label}</span>
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_LOGO_TYPES.join(",")}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) {
            onPick(file);
          }
          // Remis à zéro pour que choisir deux fois le même fichier déclenche bien l'événement.
          event.target.value = "";
        }}
      />
    </label>
  );
}
