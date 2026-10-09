import { ClubLogo } from "@/components/club-logo";
import { cn } from "@/lib/utils";

type Side = {
  teamName: string;
  clubName: string;
  logoUrl: string | null;
  /** Classe de graisse du nom : l'équipe dont on consulte la fiche ressort. */
  emphasis?: string;
};

/**
 * Affiche d'un match : receveur aligné à droite, visiteur à gauche, de part et d'autre du
 * tiret. Les deux colonnes ont une largeur fixe, de sorte que d'une ligne à l'autre les tirets
 * s'alignent — sans quoi une liste de matchs dessine un sapin au gré des noms. Un nom trop
 * long est tronqué, en entier au survol.
 */
export function MatchTeams({ home, away }: { home: Side; away: Side }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex w-28 items-center justify-end gap-2 sm:w-36">
        <span className={cn("truncate text-right", home.emphasis ?? "font-medium")} title={home.teamName}>
          {home.teamName}
        </span>
        <ClubLogo name={home.clubName} logoUrl={home.logoUrl} size={20} />
      </span>
      <span className="text-muted-foreground">—</span>
      <span className="flex w-28 items-center gap-2 sm:w-36">
        <ClubLogo name={away.clubName} logoUrl={away.logoUrl} size={20} />
        <span className={cn("truncate", away.emphasis ?? "font-medium")} title={away.teamName}>
          {away.teamName}
        </span>
      </span>
    </span>
  );
}

/** Les deux côtés d'un match tel que le renvoient les queries de matchs. */
export function sidesOf(match: {
  homeTeamName: string;
  homeClubName: string;
  homeClubLogoUrl: string | null;
  awayTeamName: string;
  awayClubName: string;
  awayClubLogoUrl: string | null;
}) {
  return {
    home: { teamName: match.homeTeamName, clubName: match.homeClubName, logoUrl: match.homeClubLogoUrl },
    away: { teamName: match.awayTeamName, clubName: match.awayClubName, logoUrl: match.awayClubLogoUrl },
  };
}
