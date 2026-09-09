"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";

import { ClubLogoForm } from "@/components/club-logo-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ACCEPTED_LOGO_TYPES } from "@/lib/rules/logo";
import { uploadLogo } from "@/lib/upload-logo";

export default function ClubsPage() {
  const clubs = useQuery(api.clubs.list);
  const create = useMutation(api.clubs.create);
  const update = useMutation(api.clubs.update);
  const generateUploadUrl = useMutation(api.clubs.generateLogoUploadUrl);
  const createPlayer = useAction(api.players.create);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const newLogo = useRef<HTMLInputElement>(null);
  const [openClub, setOpenClub] = useState<Id<"clubs"> | null>(null);
  const players = useQuery(api.players.listByClub, openClub ? { clubId: openClub } : "skip");

  async function guard(action: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action impossible.");
    }
  }

  /** Message à afficher après la création d'un licencié, selon son compte et l'envoi. */
  function accountNotice(
    account: {
      email: string;
      temporaryPassword: string | null;
      linkedExisting: boolean;
      mail: { sent: boolean; error: string | null } | null;
    } | null,
  ) {
    if (account === null) {
      return "Licencié créé.";
    }
    if (account.linkedExisting) {
      return `Licencié créé et rattaché au compte existant ${account.email}.`;
    }
    if (account.mail?.sent === true) {
      return `Licencié créé. Ses identifiants viennent de lui être envoyés à ${account.email}.`;
    }
    return (
      `Licencié créé, avec un compte pour ${account.email}. ` +
      `Le message n'est pas parti (${account.mail?.error ?? "raison inconnue"}) : ` +
      `transmettez-lui son mot de passe provisoire ${account.temporaryPassword}, ` +
      "il ne sera plus affiché."
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Clubs et licenciés</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        La salle par défaut préremplit le lieu des créneaux proposés par les équipes du club
        lorsqu&apos;elles reçoivent.
      </p>

      {error === null ? null : <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice === null ? null : (
        <p className="mt-4 text-sm text-green-700" role="status">
          {notice}
        </p>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Nouveau club</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const element = event.currentTarget;
              await guard(async () => {
                // Le fichier part d'abord vers le stockage : la mutation ne reçoit qu'un
                // identifiant, et le club se crée même si le logo est refusé.
                const file = newLogo.current?.files?.[0];
                let logoStorageId: Id<"_storage"> | undefined;
                if (file !== undefined) {
                  const upload = await uploadLogo(generateUploadUrl, file);
                  if (upload.error !== null) {
                    setError(upload.error);
                    return;
                  }
                  logoStorageId = upload.storageId;
                }
                const { logoRejection } = await create({
                  name: String(form.get("name")),
                  defaultVenue: String(form.get("defaultVenue")),
                  logoStorageId,
                });
                element.reset();
                setNotice(
                  logoRejection === null
                    ? "Club créé."
                    : `Club créé, mais le logo a été refusé : ${logoRejection}`,
                );
              });
            }}
          >
            <div className="min-w-40 flex-1">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" className="mt-2" required />
            </div>
            <div className="min-w-48 flex-1">
              <Label htmlFor="defaultVenue">Salle par défaut</Label>
              <Input id="defaultVenue" name="defaultVenue" className="mt-2" />
            </div>
            <div className="min-w-56 flex-1">
              <Label htmlFor="logo">Logo (facultatif)</Label>
              <input
                ref={newLogo}
                id="logo"
                name="logo"
                type="file"
                accept={ACCEPTED_LOGO_TYPES.join(",")}
                className="text-muted-foreground mt-2 block text-sm"
              />
            </div>
            <Button type="submit">Créer</Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col gap-3">
        {(clubs ?? []).map((club) => (
          <Card key={club._id}>
            <CardHeader>
              <CardTitle className="text-base">
                <Link href={`/clubs/${club._id}`} className="hover:underline">
                  {club.name}
                </Link>
              </CardTitle>
              <CardDescription>{club.defaultVenue || "Aucune salle renseignée"}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ClubLogoForm clubId={club._id} name={club.name} logoUrl={club.logoUrl} />

              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await guard(() =>
                    update({
                      clubId: club._id,
                      defaultVenue: String(form.get("defaultVenue")),
                    }),
                  );
                }}
              >
                <div className="min-w-48 flex-1">
                  <Label htmlFor={`venue-${club._id}`}>Salle par défaut</Label>
                  <Input
                    id={`venue-${club._id}`}
                    name="defaultVenue"
                    className="mt-2"
                    defaultValue={club.defaultVenue}
                  />
                </div>
                <Button type="submit" variant="outline">
                  Enregistrer
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpenClub(openClub === club._id ? null : club._id)}
                >
                  {openClub === club._id ? "Masquer les licenciés" : "Licenciés"}
                </Button>
              </form>

              {openClub !== club._id ? null : (
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Licence</TableHead>
                        <TableHead>Compte</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(players ?? []).map((player) => (
                        <TableRow key={player._id}>
                          <TableCell className="font-medium">
                            {player.lastName.toUpperCase()} {player.firstName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {player.licenseNumber || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {player.email ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {(players ?? []).length === 0 ? (
                    <p className="text-muted-foreground text-sm">Aucun licencié enregistré.</p>
                  ) : null}

                  <form
                    className="mt-4 flex flex-wrap items-end gap-3"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const element = event.currentTarget;
                      await guard(async () => {
                        const { account } = await createPlayer({
                          clubId: club._id,
                          firstName: String(form.get("firstName")),
                          lastName: String(form.get("lastName")),
                          licenseNumber: String(form.get("licenseNumber")),
                          email: String(form.get("email")),
                        });
                        element.reset();
                        setNotice(accountNotice(account));
                      });
                    }}
                  >
                    <div>
                      <Label htmlFor={`ln-${club._id}`}>Nom</Label>
                      <Input id={`ln-${club._id}`} name="lastName" className="mt-2" required />
                    </div>
                    <div>
                      <Label htmlFor={`fn-${club._id}`}>Prénom</Label>
                      <Input id={`fn-${club._id}`} name="firstName" className="mt-2" required />
                    </div>
                    <div>
                      <Label htmlFor={`lic-${club._id}`}>Licence</Label>
                      <Input id={`lic-${club._id}`} name="licenseNumber" className="mt-2" />
                    </div>
                    <div className="min-w-56 flex-1">
                      <Label htmlFor={`mail-${club._id}`}>E-mail (facultatif)</Label>
                      <Input
                        id={`mail-${club._id}`}
                        name="email"
                        type="email"
                        className="mt-2"
                        placeholder="crée un compte de consultation"
                      />
                    </div>
                    <Button type="submit" variant="outline">
                      Ajouter un licencié
                    </Button>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
