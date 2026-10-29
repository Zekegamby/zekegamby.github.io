# Zeke Gamby — visual research portfolio

Static website at https://zekegamby.com/, published through GitHub Pages.

## Experience

The homepage presents a studio visualisation and current prototype video, followed by six selected physical experiments and CAD studies. Visitors can filter the gallery, enlarge images and browse with arrow keys. The research explanation sits beneath the work with expandable technical context. The box-tracking Motion Studio is accessible from navigation and a prominent homepage link. The camera-based motion-capture route remains redirected.

- `index.html`, `assets/research.css`, `assets/research.js`: responsive portfolio and accessible native-dialog image viewer.
- `motion-lab.html`: restored V14R3 wrist-assisted box-tracking study; no camera access or camera experiment links.
- `camera-motion-lab.html`: redirect to the research homepage.
- LinkedIn: https://www.linkedin.com/in/zeke-gamby-300028306/

## Media provenance

All gallery files are web-optimised derivatives; source geometry and photos are unchanged except for the explicitly labelled studio visualisation.

| Public asset | Source | Description |
| --- | --- | --- |
| `assets/gallery/v14-studio.webp` | Image generation based on `V14_Skin_Actual_CAD_Preview.png` | Studio visualisation, visibly labelled; not a photograph or simulation result. |
| `assets/gallery/v14-cad-study.webp` | `V14_Skin_Actual_CAD_Preview.png`, Library `libfile_c170b63b5cd48191a5b0dc7978ffe5a4` | Original V14 CAD study. |
| `assets/gallery/opposed-digits-cad.webp` | `OP02_Hero.png`, Library `libfile_ec93c2ac7b3c819185cfd891bdfdd926` | Earlier OP02 CAD study; untested physical performance. |
| `assets/gallery/finger-mechanism-cad.webp` | `V20_Hero.png`, Library `libfile_14670a20ec4c8191b200d591e37a877b` | Earlier V20 mechanism CAD study. |
| `assets/gallery/early-test-series.webp` | `IMG_0972.JPG`, Library `libfile_1d3f1e1131108191b0725cc1c56a0190` | Physical material samples, joints and actuated finger. |
| `assets/gallery/printed-joint.webp` | `IMG_0987.JPG`, Library `libfile_f27efc6d2a608191a03719de7db19d27` | Close-up photograph of an earlier physical joint. |
| `assets/gallery/skin-test.webp` | `IMG_0980.JPG`, Library `libfile_333a42cf8cc08191ad8124e640971f32` | Photograph of an earlier skin experiment. |
| `assets/current-hand-demo.mp4` | `IMG_0377.MOV`, Library `libfile_8737d17363e88191aef642a397bc91f8` | Full 23.71-second physical thumb-and-index test; H.264/AAC, 480 × 854, approximately 705 KB. |
| `assets/current-hand-poster.jpg` | Frame at 10.5 seconds from the same uploaded video | Actual prototype. |

The generated source PNG is kept in the workspace `generated_images` directory. Gallery captions distinguish historical prints, CAD studies and visualisation from the current prototype.

## Research framing

“Modified PolyJet” refers to the design-to-print workflow, as confirmed by Zeke: connecting AI-assisted geometry and material instructions to fabrication and designer-led physical testing. Public copy does not claim new printer hardware, autonomous optimisation, assembly-free robotics or proven superiority over conventional PolyJet. Implementation details are omitted.

## Validation and editing

No build or external dependencies for the homepage. Preserve `CNAME`, `.nojekyll` and the Motion Studio’s existing vendored assets. Validate local links and media, gallery filtering/dialog controls, and live deployment. The muted video respects reduced-motion and data-saving preferences. Native playback controls and image links work without JavaScript; the gallery filters only enhance browsing.
