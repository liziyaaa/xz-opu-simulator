# XZ FES / RF observation validation

Model v1.3.0, collection v1.4.0. Local verification on 2026-11-04, Microsoft Edge, desktop and 360 px responsive viewport.

- 23 Node assertions/tests and 4 browser pressure tests passed.
- Observation UI, original XZ smoke and portal navigation passed with no page errors, failed resources or unexpected external requests.
- Original XZ v1.2.0 and optical v2.0.0 files, including HTML, match their pre-change hashes.
- Optical engine retained all 14 numerical checks. New audit hashes all deployed HTML, CSS and JavaScript in the observation release.
- Source data regeneration was compared with the imported output; full raw CSVs, original CAD and private paths are not published.

One independent whole-branch review identified five issues. Reproduction tests failed first, then passed after fixes: 184505-sample plotting overflow; over-capacity row unable to finish; missing archived raw download; material-specific 3D validity indicator; actual importer metadata validation. The final two were raised from minor to important because they affect interpretation or regeneration. No deferred minor findings.

Large rows retain all current data until exported. Only after the user confirms the file was saved may a row archive summary alone; metadata flags externally saved raw records. Normal historical raw exports have one header, row IDs and per-row configuration. Session history is bounded and is not persistent storage.

## Decisions and limits

1. Use a Git worktree fallback because the managed worktree tool refused a nested repository. The normal checkout remains protected; errors in isolation could otherwise affect unrelated edits.
2. Default 4 µm scale and bump reflectance are assumptions, not measured Z calibration or tin response. No physical accuracy or successful hardware scanning claim; treating these as calibrated would give false heights.
3. Pair FES/RF by relative time and common phase, disclosing independent clocks. Subsecond timing conclusions need a shared hardware clock.
4. Keep the existing FES controller and separate legacy quality proxy; measured RF never controls focus. Replacing the proxy would change the approved strategy.
5. Do not invent ADC clipping thresholds without hardware bounds. Reflectance extrapolation remains unverified and must be checked against hardware.
6. Legacy sample optical materials remain simulated mappings; they are not measured material responses.
7. Edge desktop and narrow responsive checks do not guarantee performance on every mobile device/browser.
8. The approved release task authorizes main integration, a new v1.4.0 tag and Pages publication; historical tags and paths remain unchanged.

This file records local verification. A successful push alone is not deployment verification; the release procedure additionally checks the Pages build commit and deployed browser behavior.
