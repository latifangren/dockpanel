# WordPress Site Guide — removed

This guide described creating a WordPress **site** from the panel: a
domain, a PHP runtime, a MySQL container, an Nginx vhost and a Let's
Encrypt certificate, managed as one site object. That whole surface was
removed with the hosting backend (R3: `routes/wordpress.rs`,
`routes/sites.rs` and the site SSL/WordPress flows; R6: the agent
WordPress/CMS/PHP routes; R7: the `sites` table). There is no Sites page,
no `dockpanel sites create`, no WordPress Toolkit page, and no
`/api/wordpress/*` endpoint left to follow the steps below — every step
in the previous version of this file is dead, and the file is kept only
so the removal is visible instead of silent.

What still exists, and is the way to run WordPress now:

- **As a Docker app / stack.** The Apps catalogue includes a
  "WordPress + MySQL" stack template (WordPress container + dedicated
  MySQL container). Deploy it from **Apps** like any other stack: it gets
  a container, a port and — if you claim a domain for the stack — the
  panel's stack TLS handling. Its database is an ordinary database
  container, manageable from the **Databases** page and coverable by a
  backup policy.
- **On-disk helpers only.** The agent still ships a small WordPress
  helper module (`services/wordpress.rs`, kept in R6) that promotes an
  existing on-disk WordPress install's stored address to HTTPS and tracks
  its auto-update marker. It is not a creation or management surface: it
  serves installs that already exist on the box behind nginx templates,
  and nothing in the panel or CLI calls it to make a new one.

Do not follow any older copy of this guide (or the `dockpanel ssl
provision` / `dockpanel php install` commands it named): both commands
were removed, and the panel will not create the Nginx/PHP/MySQL shape
they assumed.
