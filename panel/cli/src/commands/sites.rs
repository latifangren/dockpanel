use serde_json::json;

pub struct SiteInfo {
    pub domain: String,
    pub runtime: String,
    pub ssl: bool,
}

pub fn list_nginx_sites() -> Vec<SiteInfo> {
    let mut sites = Vec::new();
    let sites_dir = std::path::Path::new("/etc/nginx/sites-enabled");

    let dir = match std::fs::read_dir(sites_dir) {
        Ok(d) => d,
        Err(_) => return sites,
    };

    for entry in dir.flatten() {
        let path = entry.path();
        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        if filename == "dockpanel-panel.conf"
            || filename == "dockpanel.dev.conf"
            || filename == "default"
        {
            continue;
        }

        if let Ok(content) = std::fs::read_to_string(&path) {
            let domain = content
                .lines()
                .find(|l| l.trim().starts_with("server_name"))
                .and_then(|l| l.trim().strip_prefix("server_name"))
                .and_then(|l| {
                    l.trim()
                        .trim_end_matches(';')
                        .split_whitespace()
                        .next()
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| filename.replace(".conf", ""));

            if domain == "_" {
                continue;
            }

            let ssl = content.contains("ssl_certificate");
            let runtime = if content.contains("proxy_pass") {
                "proxy"
            } else if content.contains("fastcgi_pass") || content.contains("php") {
                "php"
            } else {
                "static"
            };

            sites.push(SiteInfo {
                domain,
                runtime: runtime.to_string(),
                ssl,
            });
        }
    }

    sites.sort_by(|a, b| a.domain.cmp(&b.domain));
    sites.dedup_by(|a, b| a.domain == b.domain);
    sites
}

/// Fully local: reads nginx vhost files on this box. No agent call —
// an unreachable agent must not hide the sites on disk.
pub async fn cmd_sites_list(output: &str, filter: Option<&str>) -> Result<(), String> {
    let mut sites = list_nginx_sites();

    // Apply filter
    if let Some(f) = filter {
        let f_lower = f.to_lowercase();
        sites.retain(|s| s.domain.to_lowercase().contains(&f_lower));
    }

    if output == "json" {
        let json_arr: Vec<serde_json::Value> = sites
            .iter()
            .map(|s| {
                json!({
                    "domain": s.domain,
                    "runtime": s.runtime,
                    "ssl": s.ssl,
                })
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&json_arr).unwrap_or_default());
        return Ok(());
    }

    if sites.is_empty() {
        println!("No sites configured.");
        return Ok(());
    }

    println!(
        "\x1b[1m{:<30} {:<10} {:<6}\x1b[0m",
        "DOMAIN", "TYPE", "SSL"
    );

    for site in &sites {
        println!(
            "{:<30} {:<10} {:<6}",
            site.domain,
            site.runtime,
            if site.ssl { "yes" } else { "no" }
        );
    }

    println!("\n{} site(s)", sites.len());
    Ok(())
}
