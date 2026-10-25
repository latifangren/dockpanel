/**
 * Hide credentials embedded in a repository URL before it reaches the screen.
 *
 * `is_valid_repo_url` on the agent accepts any https:// URL, userinfo included,
 * and nothing on the panel side strips it — so an operator who pastes
 * `https://ghp_xxx@github.com/me/app.git` (the workaround people reach for when
 * a private HTTPS clone fails) stores a live token in `git_deploys.repo_url`.
 * This page then printed it back in three places, one of which — the deploy
 * approval queue — is read by an ADMINISTRATOR looking at somebody else's
 * deployment. Masking here does not un-store the token, and the guide now says
 * so; it stops the panel being the thing that shows it around.
 *
 * Only the userinfo is touched. Everything else about the URL still renders, so
 * the operator can still tell which repository a row is for.
 */
export function maskRepoCredentials(url: string): string {
  // Anchored on the scheme so a path containing '@' cannot be mistaken for
  // userinfo, and non-greedy up to the LAST '@' before the first '/' of the
  // path — which is where a parser puts the authority boundary.
  return url.replace(
    /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/@]*@)/,
    (_m, scheme) => `${scheme}•••@`,
  );
}

export function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-dark-700 text-dark-200",
    deploying: "bg-warn-500/15 text-warn-400 animate-pulse",
    running: "bg-rust-500/15 text-rust-400",
    failed: "bg-danger-500/15 text-danger-400",
    stopped: "bg-dark-700 text-dark-300",
  };
  return map[status] || "bg-dark-700 text-dark-200";
}

// Framework GUESS from repository URL keywords, ported from the AI Studio
// v2 detection idea and deliberately weakened: v2 presented this as
// "automatic framework detection", but matching substrings in a URL is not
// inspecting a repository. This helper only prefills the port and the
// pre-build command, shows its basis in the UI, and stays fully editable —
// the operator's values always win, and build_method itself is left to the
// server, which is what decides it in this codebase.
export function guessFrameworkFromUrl(repoUrl: string): { label: string; port: number; preBuild: string } | null {
  const lower = repoUrl.toLowerCase();
  if (lower.includes("next") || lower.includes("react") || lower.includes("saas") || lower.includes("web")) {
    return { label: "Next.js / Node.js (guess)", port: 3000, preBuild: "npm ci && npm run build" };
  }
  if (lower.includes("rust") || lower.includes("cargo") || lower.includes("axum") || lower.includes("actix")) {
    return { label: "Rust / Cargo (guess)", port: 8080, preBuild: "cargo build --release" };
  }
  if (lower.includes("laravel") || lower.includes("php") || lower.includes("wp")) {
    return { label: "Laravel / PHP (guess)", port: 8000, preBuild: "composer install --no-dev --optimize-autoloader" };
  }
  if (lower.includes("go") || lower.includes("gin") || lower.includes("fiber")) {
    return { label: "Go (guess)", port: 8080, preBuild: "go build -ldflags='-s -w' -o app ." };
  }
  if (lower.includes("python") || lower.includes("fastapi") || lower.includes("django")) {
    return { label: "Python / FastAPI (guess)", port: 8000, preBuild: "pip install -r requirements.txt" };
  }
  return null;
}
