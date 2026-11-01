export interface NavItem {
  to: string;
  label: string;
  iconName: string;
  adminOnly?: boolean;
  /** Visible to reseller role (and admin, unless `resellerOnly` says otherwise) */
  resellerVisible?: boolean;
  /**
   * The page answers only for the caller's OWN reseller tenant, so an admin —
   * who has no tenant — must NOT see it. `reseller_dashboard.rs:76` refuses them
   * by name, and an admin who followed the sidebar got that refusal rendered as
   * the whole page (issue #112). The admin counterpart is the `/resellers` row.
   *
   * Kept as a THIRD flag rather than a rename of `resellerVisible`: two absence
   * arms assert the /account row carries neither of these, and a rename would
   * leave them vacuously green while a live restriction existed outside their
   * view. Adding a flag means those arms have to learn about it, which is the
   * behaviour we want.
   */
  resellerOnly?: boolean;
  /**
   * Hidden from the sidebar (and the command palette, which reads the same
   * visibility decision) because its content lives inside a hub page, while
   * the route itself stays registered and directly reachable — the same
   * "hide the door, keep the room" rule lite mode uses, applied in every
   * mode. Ported from the AI Studio v2 nav consolidation.
   */
  consolidatedInto?: string;
  /**
   * Shown in DockPanel Lite mode (backend `DOCKPANEL_LITE=1` surfaces as
   * `lite:true` on /api/branding). Lite is an opt-in set: in lite mode
   * ONLY rows carrying this flag are shown, everything else is hidden
   * from both menus — the visible set is the 14 rows below (Dashboard,
   * Files, App Store & Containers, Terminal, Monitoring, Settings,
   * Backup Manager, Logs, Security, System, Users, Telemetry,
   * Notifications, My Account). /account stays because it is the only
   * door to password/2FA/passkey management and the 2FA banner points
   * at it. Absence means "hidden in lite", not "undecided".
   *
   * Lite is a UX profile, NOT a security boundary: routes stay directly
   * reachable and the backend enforces nothing on this flag (see FORK.md).
   */
  liteVisible?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

/**
 * The ONE place that decides whether a role may be shown a navigation entry.
 *
 * This lived inline in `useLayoutState` and nowhere else, so the command palette
 * — a second menu over the same pages — simply never asked: Ctrl+K offered
 * /users, /secrets, /security and /settings to every account. Each of those
 * pages guards itself, so nothing leaked; what the palette handed out was a list
 * of doors that refuse, which is the same broken promise as a sidebar entry that
 * 403s. A decision inlined in two menus is a decision that drifts.
 */
export function isNavVisible(
  item: Pick<NavItem, "adminOnly" | "resellerVisible" | "resellerOnly" | "liteVisible" | "consolidatedInto">,
  role: string,
  lite = false,
): boolean {
  // Lite narrows FIRST: in lite mode a row without the flag is hidden
  // for every role, before any role branch can re-admit it (an admin
  // "sees everything" must not resurrect Sites or Mail in lite mode).
  // Rows WITH the flag still go through the role logic below, so an
  // adminOnly lite row (Docker Apps, Settings) stays admin-only.
  if (lite && !item.liteVisible) return false;
  // Consolidated rows are hidden in every mode: the hub is their door.
  if (item.consolidatedInto) return false;
  // Ahead of the admin branch, because it is the one kind of row "admin sees
  // everything" gets wrong: a tenant-scoped page has nothing to show an account
  // that is not a tenant, and the handler behind it says so with a 403.
  if (item.resellerOnly) return role === "reseller";
  // Admin sees everything else
  if (role === "admin") return true;
  // Reseller sees resellerVisible items + non-restricted items
  if (role === "reseller") return !!item.resellerVisible || (!item.adminOnly && !item.resellerVisible);
  // Everyone else (user / client): hide adminOnly and resellerVisible items
  return !item.adminOnly && !item.resellerVisible;
}

/**
 * The nav flags for a route, looked up from the registry above so callers cannot
 * carry their own copy. A path with no nav row is unrestricted — per-site tools
 * (/sites/:id/files, /sites/:id/backups) deliberately have no sidebar entry.
 */
export function navFlagsFor(
  path: string,
): Pick<NavItem, "adminOnly" | "resellerVisible" | "resellerOnly" | "liteVisible" | "consolidatedInto"> {
  const base = path.split("?")[0];
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.to === base) return item;
    }
  }
  return {};
}

export const navGroups: NavGroup[] = [
  {
    key: "system",
    label: "CasaOS",
    items: [
      { to: "/", label: "Dashboard", iconName: "dashboard", liteVisible: true },
      { to: "/files", label: "Files", iconName: "files", liteVisible: true },
      { to: "/apps", label: "App Store & Containers", iconName: "apps", adminOnly: true, liteVisible: true },
      { to: "/terminal", label: "Terminal", iconName: "terminal", adminOnly: true, liteVisible: true },
      { to: "/monitoring", label: "Monitoring", iconName: "monitoring", adminOnly: true, liteVisible: true },
      { to: "/settings", label: "Settings", iconName: "settings", adminOnly: true, liteVisible: true },
    ],
  },
  {
    key: "management",
    label: "Management",
    items: [
      { to: "/backup-orchestrator", label: "Backup Manager", iconName: "backups", adminOnly: true, liteVisible: true },
      // B9 (Phase 2): these five pages were registered routes with no nav
      // row and no palette entry — reachable only by typing the URL. They
      // return to the nav as admin-only rows because each holds controls
      // with no other home: Logs (full log views), Security (firewall,
      // lockdown, diagnostics), System (panel updates, health), Users
      // (account management), Telemetry (telemetry config + update
      // status, the only home for both). /integrations was decided the
      // other way — its tabs are Webhooks/Extensions/WHMCS/Migrations,
      // hosting-era through and through — so it redirects to / instead
      // (see main.tsx). Every returned row carries liteVisible: without
      // it, lite mode (which this fork always reports) would hide it
      // again and recreate the orphan.
      { to: "/logs", label: "Logs", iconName: "logs", adminOnly: true, liteVisible: true },
      { to: "/security", label: "Security", iconName: "security", adminOnly: true, liteVisible: true },
      { to: "/system", label: "System", iconName: "servers", adminOnly: true, liteVisible: true },
      { to: "/users", label: "Users", iconName: "users", adminOnly: true, liteVisible: true },
      { to: "/telemetry", label: "Telemetry", iconName: "monitoring", adminOnly: true, liteVisible: true },
      { to: "/notifications", label: "Notifications", iconName: "notifications", liteVisible: true },
      { to: "/account", label: "My Account", iconName: "settings", liteVisible: true },
    ],
  },
];
