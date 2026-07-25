use reqwest;
use scraper::{Html, Selector};
use wasm_bindgen::prelude::*;

pub mod svg;

pub struct Chart {
    stats: Vec<(String, i32)>,
    colors: Vec<&'static str>,
}

impl Chart {
    pub fn new(stats: Vec<(String, i32)>, colors: Option<Vec<&'static str>>) -> Self {
        let default_colors = vec!["#eeeeee", "#c6e48b", "#7bc96f", "#239a3b", "#196127"];
        Chart {
            stats,
            colors: colors.unwrap_or(default_colors),
        }
    }

    pub fn render(&self) -> Result<String, String> {
        Ok(svg::render_svg(&self))
    }
}

pub const COLOR_SCHEMES: &[(&str, &[&str])] = &[
    (
        "default",
        &["#F0F3F8", "#9CE2A8", "#39C651", "#339944", "#20602A"],
    ),
    (
        "dark",
        &["#191C1F", "#0A431D", "#0D5926", "#1AB34D", "#2BE168"],
    ),
    (
        "halloween",
        &["#EEEEEE", "#FFEE4A", "#FFC501", "#FE9600", "#03001C"],
    ),
];

pub async fn fetch_github_stats(
    username: &str,
) -> Result<Vec<(String, i32)>, Box<dyn std::error::Error>> {
    let url = format!("https://github.com/users/{}/contributions", username);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "githubchart-rust")
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed loading data from GitHub: {} {}",
            url,
            response.status()
        )
        .into());
    }

    let html_content = response.text().await?;
    let document = Html::parse_document(&html_content);
    let cell_selector = Selector::parse("td.ContributionCalendar-day").unwrap();

    let mut stats = Vec::new();

    for element in document.select(&cell_selector) {
        if let (Some(date), Some(count_str)) = (
            element.value().attr("data-date"),
            element.value().attr("data-level"),
        ) {
            if let Ok(count) = count_str.parse::<i32>() {
                stats.push((date.to_string(), count));
            }
        }
    }

    stats.sort_by(|a, b| a.0.cmp(&b.0));

    if stats.is_empty() {
        println!("Warning: No contribution data found for user {}", username);
    }

    Ok(stats)
}

#[cfg(test)]
mod tests;

#[wasm_bindgen]
pub async fn generate_github_chart(
    username: &str,
    color_scheme: Option<String>,
) -> Result<String, JsValue> {
    let stats = fetch_github_stats(username)
        .await
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let colors = match color_scheme.as_deref() {
        Some(scheme) => COLOR_SCHEMES
            .iter()
            .find(|&&(name, _)| name == scheme)
            .map(|&(_, colors)| colors.to_vec()),
        None => None,
    };

    let chart = Chart::new(stats, colors);
    chart.render().map_err(|e| JsValue::from_str(&e))
}
