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
   * from both menus — the task list is the visible set (Dashboard,
   * Docker Apps, Databases, Terminal, Monitoring, Backup Manager,
   * Settings, Notifications), plus /account, which stays because it is
   * the only door to password/2FA/passkey management and the 2FA banner
   * points at it. Absence means "hidden in lite", not "undecided".
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
    // Ported from the AI Studio v2 navigation consolidation. Projects is a
    // local-browser workspace view (see Projects.tsx), so it is lite-visible:
    // it groups exactly the lite set plus the pages lite hides, without
    // resurrecting any hidden route's sidebar row. Networking wraps Sites /
    // DNS / CDN, which lite hides, so it is NOT lite-visible — in lite mode
    // its tab content stays reachable only by direct URL, like every other
    // hidden route. Container Policies is deliberately NOT consolidated here:
    // v2 folded it into an /apps policies tab that this codebase does not
    // have, and folding it without that tab would orphan the page.
    key: "workspaces",
    label: "Workspaces & Apps",
    items: [
      { to: "/projects", label: "Projects", iconName: "extensions", liteVisible: true },
      { to: "/networking", label: "Domains, DNS & CDN", iconName: "dns", adminOnly: true },
    ],
  },
  {
    key: "hosting",
    label: "Hosting",
    items: [
      { to: "/", label: "Dashboard", iconName: "dashboard", liteVisible: true },
      { to: "/sites", label: "Sites", iconName: "sites" },
      { to: "/databases", label: "Databases", iconName: "databases", liteVisible: true },
      { to: "/wordpress-toolkit", label: "WP Toolkit", iconName: "wordpress", adminOnly: true },
      { to: "/apps", label: "Docker Apps", iconName: "apps", adminOnly: true, liteVisible: true },
      { to: "/git-deploys", label: "Git Deploy", iconName: "gitDeploys", adminOnly: true },
      { to: "/migration", label: "Migration", iconName: "migration", adminOnly: true },
    ],
  },
  {
    key: "reseller",
    label: "Reseller",
    items: [
      { to: "/reseller", label: "Reseller Panel", iconName: "reseller", resellerVisible: true, resellerOnly: true },
      { to: "/reseller/users", label: "My Users", iconName: "users", resellerVisible: true, resellerOnly: true },
      // The admin's half of this group. Everything an admin can do to a reseller
      // lives behind /api/resellers, which had eight handlers and no screen at
      // all until v2.118.0 — so the only reseller-shaped control the panel
      // offered an admin was the role dropdown in Users, which sets the role
      // without creating a profile and produces an account whose own panel
      // answers 404. This row is the door those handlers never had.
      { to: "/resellers", label: "Resellers", iconName: "reseller", adminOnly: true },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    items: [
      { to: "/dns", label: "DNS", iconName: "dns", adminOnly: true, consolidatedInto: "/networking?tab=dns" },
      { to: "/cdn", label: "CDN", iconName: "dns", adminOnly: true, consolidatedInto: "/networking?tab=cdn" },
      // Unrestricted since v2.103.0, and the flag's absence is the whole point.
      // The backend admits a mail domain to whoever owns the site of the same
      // name on the same server (`MAIL_DOMAIN_CALLER_PREDICATE`, backend
      // routes/mail.rs), and that test carries NO role term — a `client`, a
      // plain `user` and a `reseller` all reach it by the same route. There is
      // no flag here meaning "owner", because the registry only ever sees a
      // role string; ownership is not knowable at nav-render time. Restricting
      // this row to any single role would contradict the API in one direction
      // or the other. What the page SHOWS is decided in Mail.tsx, per caller.
      { to: "/mail", label: "Mail", iconName: "mail" },
      { to: "/backup-orchestrator", label: "Backup Manager", iconName: "backups", adminOnly: true, liteVisible: true },
      { to: "/monitoring", label: "Monitoring", iconName: "monitoring", liteVisible: true },
      { to: "/notifications", label: "Notifications", iconName: "notifications", liteVisible: true },
      { to: "/logs", label: "Logs", iconName: "logs", adminOnly: true },
      { to: "/terminal", label: "Terminal", iconName: "terminal", liteVisible: true },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    items: [
      { to: "/servers", label: "Servers", iconName: "servers", adminOnly: true },
      { to: "/users", label: "Users", iconName: "users", adminOnly: true },
      { to: "/container-policies", label: "Container Policies", iconName: "servers", adminOnly: true },
      { to: "/integrations", label: "Integrations", iconName: "extensions", adminOnly: true },
      { to: "/secrets", label: "Secrets", iconName: "secrets", adminOnly: true },
      { to: "/security", label: "Security", iconName: "security", adminOnly: true },
      { to: "/system", label: "System", iconName: "servers", adminOnly: true },
      { to: "/telemetry", label: "Telemetry", iconName: "monitoring", adminOnly: true },
      { to: "/settings", label: "Settings", iconName: "settings", adminOnly: true, liteVisible: true },
    ],
  },
  {
    key: "account",
    label: "Account",
    items: [
      // The ONLY entry every role can see, and the reason it exists: password
      // change, 2FA enrolment, passkeys, sessions and API keys all used to live
      // behind the `adminOnly` /settings row above, so a client had no door to
      // its own account at all. Never mark this `adminOnly` — the 2FA banner in
      // all four layouts points here, and a non-admin is exactly who it warns.
      { to: "/account", label: "My Account", iconName: "settings", liteVisible: true },
    ],
  },
];
