import * as BunnySDK from "https://esm.sh/@bunny.net/edgescript-sdk@0.11.2";
import { generate_github_chart } from "https://esm.sh/githubchart-rust@5.1.4/githubchart_rust_deno.js";

/**
 * Executes a WASM binary and returns the response value
 * @param {Request} request - The Fetch API Request object.
 * @return {Response} The HTTP response or string.
 */
BunnySDK.net.http.serve(async (req: Request): Promise<Response> => {
  try {
    // parse incoming request
    const url = new URL(req.url);
    const splittedUrl = url.pathname.split("/");

    // extract username from path
    const username = splittedUrl[1];
    const color = splittedUrl[2] || "default";

    // check if username is provided
    if (!username) return new Response("No username provided", { status: 400 });

    // generate chart
    const chart = await generate_github_chart(username, color);

    // return response
    return new Response(chart, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "max-age=300",
        "x-generated-by": "githubchart-rust",
        "x-username": username,
      },
    });
  } catch (error) {
    console.log(req.method, req.url, error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
