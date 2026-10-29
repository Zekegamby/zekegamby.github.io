# Zeke Gamby — master’s research

Static research portfolio at https://zekegamby.com/, served through GitHub Pages.

Public copy describes a modified PolyJet workflow for AI-assisted geometry and material distribution. It does not claim a novel printer hardware modification, superiority over conventional PolyJet, autonomous optimisation or assembly-free robotics. Implementation details are omitted.

The homepage leads with the current physical prototype, followed by a concise research explanation, current progress, bio and contact links. It uses responsive editorial typography, an off-white/ink/blue palette and a dark frame around the actual prototype footage.

## Assets

- `assets/research.css`: responsive layout, visible keyboard focus, reduced-motion and print styles.
- `assets/research.js`: starts the muted prototype video unless reduced motion or data saving is requested. Native controls work independently of JavaScript; blocked autoplay leaves the poster and controls available.
- `assets/current-hand-demo.mp4`: full 23.71-second thumb-and-index bench-test video from IMG_0377.MOV. H.264/AAC, 480 × 854, HDR converted to SDR, fast-start enabled, approximately 705 KB.
- `assets/current-hand-poster.jpg`: authentic frame at 10.5 seconds, preloaded for the first impression.
- LinkedIn: https://www.linkedin.com/in/zeke-gamby-300028306/

Former research-detail, Motion Lab, camera experiment and unrelated portfolio page URLs redirect to the research section of the homepage. Historical simulation sources and media remain in the repository, but are not loaded or linked by the homepage. No root HTML page loads camera code.

No build step or dependencies. Preserve CNAME and .nojekyll. Check internal links, video decoding and live source after deployment.

## Research framing

The modified process refers to the design-to-print workflow, as confirmed by Zeke. The homepage now explains the connection between AI-generated geometry/material instructions, PolyJet fabrication and designer-led physical testing. A three-step process and a concrete finger example make the technical contribution understandable without publishing implementation details. Expandable context credits PolyJet’s existing multimaterial/voxel capabilities and links to the manufacturer’s guide. No unsupported novelty, fully autonomous development, printer hardware modification or proven superiority claim is made.
