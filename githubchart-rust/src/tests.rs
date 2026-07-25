#[cfg(test)]
mod tests {
    use crate::{Chart, COLOR_SCHEMES};

    fn sample_stats() -> Vec<(String, i32)> {
        vec![
            ("2024-01-01".to_string(), 0),
            ("2024-01-02".to_string(), 1),
            ("2024-01-03".to_string(), 4),
            ("2024-01-04".to_string(), 7),
            ("2024-01-05".to_string(), 10),
        ]
    }

    #[test]
    fn test_chart_creation() {
        let stats = sample_stats();
        let chart = Chart::new(stats.clone(), None);
        assert_eq!(chart.stats, stats);
        assert_eq!(chart.colors.len(), 5);
    }

    #[test]
    fn test_chart_with_custom_colors() {
        let stats = sample_stats();
        let colors = Some(COLOR_SCHEMES[2].1.to_vec()); // Halloween scheme
        let chart = Chart::new(stats, colors.clone());
        assert_eq!(chart.colors, colors.unwrap());
    }

    #[test]
    fn test_svg_rendering() {
        let stats = sample_stats();
        let chart = Chart::new(stats, None);
        let svg = chart.render().unwrap();

        // Basic SVG structure
        assert!(svg.starts_with("<svg"));
        assert!(svg.ends_with("</svg>"));

        // Check for required elements
        assert!(svg.contains("<rect")); // Contribution squares
        assert!(svg.contains("Mon")); // Weekday labels
        assert!(svg.contains("Jan")); // Month label

        // Check color usage
        assert!(svg.contains("#eeeeee")); // Default color scheme
        assert!(svg.contains("#c6e48b"));
    }

    #[test]
    fn test_color_schemes() {
        // Test default scheme
        assert_eq!(COLOR_SCHEMES[0].0, "default");
        assert_eq!(COLOR_SCHEMES[0].1.len(), 5);

        // Test old scheme
        assert_eq!(COLOR_SCHEMES[1].0, "dark");
        assert_eq!(COLOR_SCHEMES[1].1.len(), 5);

        // Test halloween scheme
        assert_eq!(COLOR_SCHEMES[2].0, "halloween");
        assert_eq!(COLOR_SCHEMES[2].1.len(), 5);
    }
}
