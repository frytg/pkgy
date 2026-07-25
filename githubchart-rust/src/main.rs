use std::env;
use std::fs::File;
use std::io::{self, Write};
use std::path::Path;

use githubchart_rust::{fetch_github_stats, Chart, COLOR_SCHEMES};

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!(
            "Usage: {} <output_file> [-u <username>] [-c <color_scheme>]",
            args[0]
        );
        std::process::exit(1);
    }

    let mut username = None;
    let output_file = &args[1];
    let mut color_scheme = None;

    let mut i = 2;
    while i < args.len() {
        match args[i].as_str() {
            "-u" => {
                if i + 1 < args.len() {
                    username = Some(args[i + 1].clone());
                    i += 1;
                } else {
                    eprintln!("Missing value for -u");
                    std::process::exit(1);
                }
            }
            "-c" => {
                if i + 1 < args.len() {
                    color_scheme = Some(args[i + 1].clone());
                    i += 1;
                } else {
                    eprintln!("Missing value for -c");
                    std::process::exit(1);
                }
            }
            _ => {
                eprintln!("Unknown option: {}", args[i]);
                std::process::exit(1);
            }
        }
        i += 1;
    }

    let stats = if let Some(username) = username {
        match fetch_github_stats(&username).await {
            Ok(stats) => stats,
            Err(e) => {
                eprintln!("Error fetching GitHub stats: {}", e);
                std::process::exit(1);
            }
        }
    } else {
        eprintln!("Either -u or -i must be provided");
        std::process::exit(1);
    };

    let colors = color_scheme
        .as_ref()
        .and_then(|scheme| COLOR_SCHEMES.iter().find(|&&(name, _)| name == scheme))
        .map(|&(_, colors)| colors.to_vec());

    let chart = Chart::new(stats, colors);
    let svg = chart.render().expect("Failed to render chart");

    if output_file == "-" {
        io::stdout()
            .write_all(svg.as_bytes())
            .expect("Failed to write to stdout");
    } else {
        let path = Path::new(output_file);
        let mut file = File::create(&path).expect("Failed to create output file");
        file.write_all(svg.as_bytes())
            .expect("Failed to write to output file");
    }
}
