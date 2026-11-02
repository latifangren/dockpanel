// DO NOT EDIT — generated from panel/backend/src/services/prerequisites/copy.rs
//
// The passive tier of the guidance layer: the line under a field, and the
// longer text behind its (i). The reactive and blocking tiers arrive at
// runtime as PrereqResults from the same registry.

export interface FieldGuidance {
  /** Surface this field belongs to, as a user would name it. */
  surface: string;
  label: string;
  /** The line under the field. Always shown. */
  help: string;
  /** The longer explanation behind the (i). Empty means no tooltip. */
  more: string;
  /** Prerequisite key this field's guidance escalates into, if any. */
  escalatesTo: string;
}

export const FIELD_GUIDANCE = {
  "setup.admin_password": {
    surface: "Create your admin account",
    label: "Password",
    help: "At least 8 characters. This signs you in to the panel itself — not to any site you host with it.",
    more: "This is the panel's first account and a full administrator: it can reach every site, database and container on this server. There is no password-reset email configured yet, so store it somewhere you trust before continuing. You can add two-factor authentication straight afterwards from Settings.",
    escalatesTo: "",
  },
  "apps.deploy.name": {
    surface: "Deploy a Docker app",
    label: "Container Name",
    help: "Names the container on this server. Must be unique — DockPanel suggests a free one if it isn't.",
    more: "The container is created as `dockpanel-app-<name>`, so this name is what you will see in `docker ps` minus that prefix.",
    escalatesTo: "apps.name_available",
  },
  "apps.deploy.port": {
    surface: "Deploy a Docker app",
    label: "Host Port",
    help: "The port on this server the app will answer on. DockPanel checks it is free before the image is pulled.",
    more: "Published on 127.0.0.1 by default. To expose the app publicly, put a Reverse Proxy site in front of it — that gets you a certificate and a domain instead of a port number.",
    escalatesTo: "apps.port_available",
  },
  "apps.deploy.memory": {
    surface: "Deploy a Docker app",
    label: "Memory (MB)",
    help: "Hard ceiling for this container. Leave blank for no limit.",
    more: "A limit above what the server has is accepted but unreachable — the box swaps first. DockPanel warns rather than refuses, because over-committing is ordinary and you may know what is about to be freed.",
    escalatesTo: "apps.resource_headroom",
  },
  "backups.policy.destination": {
    surface: "Backup policy",
    label: "Destination",
    help: "Where a copy is uploaded after each backup. Leave empty and backups stay on this server's own disk.",
    more: "A backup on the disk it protects covers a bad deploy or a dropped table, and nothing worse. Destinations are S3-compatible storage or any SFTP server. SFTP destinations that authenticate by PASSWORD need sshpass on the server the backup runs from: fresh installs and servers added through the agent installer get it automatically, but a panel upgraded in place does not, because update.sh upgrades binaries and installs no packages. When it is missing, Test Connection now says so in those words and Settings can install it onto that server for you — you are no longer asked to run a package manager by hand. Key-authenticated SFTP and every S3 destination are unaffected.",
    escalatesTo: "backups.destination_configured",
  },
} as const satisfies Record<string, FieldGuidance>;

export type FieldGuidanceId = keyof typeof FIELD_GUIDANCE;
