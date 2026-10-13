# Local AI Finger Studio

An unpublished pilot for Zeke's website. The AI authors a new geometry description instead of matching prompt keywords to presets. The preview rotates, bends at three joints and supports the existing opt-in camera tracker. Follow-up prompts receive the current geometry. Undo, redo, JSON download and reopening work without a generation service.

## On your Windows RTX 5070 PC

1. Extract the whole `Finger-Studio-Local-AI.zip` into a folder. Do not launch from inside the zip.
2. Double-click `Start-Finger-Studio.cmd`. Follow any Node.js or Ollama installer prompts. If Windows Package Manager isn't available, the launcher explains which official installer to use.
3. First setup downloads `qwen2.5-coder:7b` (about 4.7 GB). Keep the window open; it opens `http://127.0.0.1:8787` when ready.
4. Describe an idea. After generation, ask for a change with **Build on the design I'm looking at** checked. Use the bend slider or Move tab. Save a concept before leaving.

No API key or paid inference service. Your PC supplies the compute and must stay awake for generation. Internet is needed for setup, the 3D library and camera model. Camera video stays in the visitor's browser. Prompts and current geometry go to the host PC; jobs and results expire from memory after about 15 minutes, or at shutdown, and are not written to a database. Job history is also capped at 20 records.

If setup fails, install [Node.js LTS](https://nodejs.org/en/download) and [Ollama for Windows](https://ollama.com/download/windows), then rerun the launcher. Node 22+ is required. Updated NVIDIA drivers may be needed for GPU inference. With generation running, `ollama ps` in a terminal shows whether the model is using the GPU. There is no need to change firewall rules or expose port 11434.

Linux/macOS with Node and Ollama already installed can run `node local-ai/start.mjs`, then open the displayed localhost URL.

## What to check when the PC is on

The model has not yet been tested on this PC. It is a starting candidate, not a claim about generation quality or speed. Try unrelated visual ideas—branching coral, folded fabric, a mechanical insect, an asymmetric sculptural finger—and then revise only one feature. Confirm the preview visibly follows the request, preserves the rest on revisions, and bends without severe visual collisions. Try a saved-file round trip, Cancel, Undo, and the camera on your usual browser. A request is interpreted as a visual concept; it does not create arbitrary functional mechanisms or printer-ready geometry.

This is a fixed three-joint rig. The model may invent the geometry on those segments using primitives, variable-radius tubes and triangle meshes. It cannot generate executable code, load remote assets, create physical simulation or change the rig topology. Invalid output gets one repair attempt, then a visible error; the studio never substitutes a preset and labels it generated.

## Connect the public site after the local test

The live website has not been switched to this pilot. Keep generation local until actual output quality and GPU performance are checked.

For durable public access, configure a **named Cloudflare Tunnel** to `http://127.0.0.1:8787` with a stable HTTPS hostname. Do not expose the Ollama port. Set `STUDIO_PUBLIC_ORIGIN` to that exact HTTPS origin and run `node local-ai/server.mjs` with Ollama already running. The local launcher intentionally doesn't publish a tunnel. Cloudflare Quick Tunnels are for short development tests and their changing URLs should not be used as a production endpoint.

Set `AI_SERVICE_URL` in `assets/ai-config.mjs` to that HTTPS origin before publishing the AI page from this branch. The service accepts that origin and `https://zekegamby.com` / `https://www.zekegamby.com`. It checks origins and hosts, has one active generation, two queued requests, four starts per minute and 30 per hour globally. CORS is not authentication: this is a small public pilot, and larger traffic needs abuse controls and a capacity review. The host PC must remain on; existing saved concepts still open if generation is offline.

Do not merge the new studio into the public navigation until the real model and a phone have been tested. Verify the public HTTPS camera flow separately; a phone cannot use the PC's `127.0.0.1` URL.

## Developer checks

`node --experimental-vm-modules --test tests/*.test.mjs`

The service uses Node's standard library and local Ollama HTTP API. It exposes only the allowlisted pilot assets and a narrow asynchronous generation API. It never serves this setup directory, executes model code, accepts a user-selected model or forwards arbitrary URLs. All geometry is validated on the service and in the browser. The API binds to loopback. No npm install is required.

Official references: [Ollama structured output](https://docs.ollama.com/capabilities/structured-outputs), [model](https://ollama.com/library/qwen2.5-coder:7b), [Ollama Windows](https://docs.ollama.com/windows), [Cloudflare tunnels](https://developers.cloudflare.com/tunnel/).
