use crate::Chart;

const CUBE_SIZE: usize = 12;
const X_PAD: usize = 27;
const Y_PAD: usize = 20;

pub fn render_svg(chart: &Chart) -> String {
    let grid = matrix(&chart.stats);

    let mut svg = String::new();
    svg.push_str(&format!(
        r#"<svg width="{}" height="{}" version="1.1" xmlns="http://www.w3.org/2000/svg">"#,
        (CUBE_SIZE * grid.len()) + X_PAD,
        (CUBE_SIZE * grid[0].len()) + Y_PAD,
    ));
    svg_add_points(&grid, &mut svg, &chart.colors);
    svg_add_weekdays(&mut svg);
    svg_add_months(&mut svg, &chart.stats);
    svg.push_str("</svg>");
    svg
}

fn matrix(stats: &[(String, i32)]) -> Vec<Vec<Point>> {
    let mut grid = vec![vec![Point::default(); 7]; (stats.len() + 6) / 7];
    for (i, (date, score)) in stats.iter().enumerate() {
        let x = i / 7;
        let y = i % 7;
        grid[x][y] = Point {
            date: date.clone(),
            score: *score,
        };
    }
    grid
}

#[derive(Default, Clone)]
struct Point {
    date: String,
    score: i32,
}

fn svg_add_points(grid: &[Vec<Point>], svg: &mut String, colors: &[&str]) {
    for (x, row) in grid.iter().enumerate() {
        for (y, point) in row.iter().enumerate() {
            if point.score == -1 || !point.date.contains("-") {
                continue;
            }
            svg.push_str(&format!(
                r#"<rect x="{}" y="{}" rx="2" ry="2" width="10" height="10" style="fill:{};" data-score="{}" data-date="{}" />"#,
                (x * CUBE_SIZE) + X_PAD,
                (y * CUBE_SIZE) + Y_PAD,
                point_color(point.score, colors),
                point.score,
                point.date
            ));
        }
    }
}

fn svg_add_weekdays(svg: &mut String) {
    let weekdays = ["Mon", "Wed", "Fri"];
    for (i, &day) in weekdays.iter().enumerate() {
        svg.push_str(&format!(
            r#"<text x="0" y="{}" style="fill:#767676;text-anchor:start;text-align:center;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';white-space:nowrap;font-size:9px;display:block;">{}</text>"#,
            (CUBE_SIZE * (i * 2 + 1)) + 28,
            day
        ));
    }
}

fn svg_add_months(svg: &mut String, stats: &[(String, i32)]) {
    if stats.is_empty() {
        return;
    }

    let months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    // Parse the first date to get starting month
    let start_date = &stats[0].0; // Format: "YYYY-MM-DD"
    let start_month: usize = start_date[5..7].parse().unwrap_or(1);

    let mut current_month = start_month - 1; // 0-based index
    let mut last_x = 0;

    // Add up to 12 month labels
    for i in 0..12 {
        let x = (CUBE_SIZE * (i * 30) / 7) + X_PAD;

        // Only add label if it's significantly far from the last one
        if i == 0 || x >= last_x + 40 {
            svg.push_str(&format!(
                r#"<text x="{}" y="10" style="fill:#767676;text-anchor:start;text-align:center;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';white-space:nowrap;font-size:10px;">{}</text>"#,
                x,
                months[current_month]
            ));
            last_x = x;
        }

        current_month = (current_month + 1) % 12;
    }
}

fn point_color<'a>(score: i32, colors: &'a [&str]) -> &'a str {
    let index = match score {
        0 => 0,
        1 => 1,
        2 => 2,
        3 => 3,
        _ => 4,
    };
    colors.get(index).unwrap_or(&colors[0])
}
