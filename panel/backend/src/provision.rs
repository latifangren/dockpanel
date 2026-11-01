/// A single provisioning step event.
#[derive(Clone, Debug, serde::Serialize)]
pub struct ProvisionStep {
    pub step: String,
    pub label: String,
    pub status: String, // "pending", "in_progress", "done", "error"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
