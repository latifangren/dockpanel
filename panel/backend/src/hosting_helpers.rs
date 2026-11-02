// R7: this module is empty by design.
//
// `site_domain_for_caller` and `SITE_CALLER_PREDICATE` died with the `sites`
// table — every caller (databases, secrets, logs) was rewritten in R7 to
// scope on the surviving rows' own `user_id`/`server_id` columns, and a
// re-grep after those edits proved zero callers remain. The module file and
// its `mod hosting_helpers;` declaration in `main.rs` are kept so the
// deletion is a visible tombstone rather than a silent disappearance: if a
// future reader finds a reference to either name in history, this is where
// it lived and why it went.
