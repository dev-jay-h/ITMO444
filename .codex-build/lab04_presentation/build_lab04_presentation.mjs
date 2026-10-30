import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/jayhan/Desktop/Repo/ITMO-444";
const buildDir = path.join(workspaceDir, ".codex-build/lab04_presentation");
const outputDir = path.join(workspaceDir, "lab04_presentation");
const assetsDir = path.join(outputDir, "assets");
const skillDir = "/Users/jayhan/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations";
const pythonExecutable = "/Users/jayhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const finalPath = path.join(outputDir, "lab04_multi_az_resilience_final_v2.pptx");
const font = "Aptos";
const mono = "Aptos Mono";

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

const C = {
  navy: "#111827", ink: "#172033", blue: "#2563EB", cyan: "#06B6D4",
  orange: "#F59E0B", green: "#16A34A", red: "#DC2626", cloud: "#F5F7FB",
  white: "#FFFFFF", muted: "#64748B", line: "#D8DEE9", darkPanel: "#202532",
};

function rect(slide, x, y, w, h, fill, radius = "none", lineFill = "none") {
  return slide.shapes.add({
    geometry: radius === "none" ? "rect" : "roundRect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: lineFill, width: lineFill === "none" ? 0 : 1 },
    ...(radius === "none" ? {} : { borderRadius: radius }),
  });
}

function text(slide, value, x, y, w, h, opts = {}) {
  const s = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  s.text = value;
  s.text.style = {
    fontFamily: opts.fontFamily || font,
    fontSize: opts.size || 24,
    bold: opts.bold || false,
    color: opts.color || C.ink,
    alignment: opts.align || "left",
    verticalAlignment: opts.valign || "top",
  };
  return s;
}

function title(slide, value, section) {
  text(slide, section.toUpperCase(), 70, 38, 420, 24, { size: 13, bold: true, color: C.blue });
  text(slide, value, 70, 72, 1140, 58, { size: 31, bold: true, color: C.navy });
  rect(slide, 70, 138, 1140, 2, C.line);
}

function footer(slide, n) {
  text(slide, "ITMO-444 · Lab 04", 70, 682, 250, 18, { size: 11, color: C.muted });
  text(slide, String(n).padStart(2, "0"), 1140, 682, 70, 18, { size: 11, bold: true, color: C.muted, align: "right" });
}

async function addImage(slide, filename, x, y, w, h, fit = "contain") {
  const bytes = await fs.readFile(path.join(assetsDir, filename));
  return slide.images.add({
    blob: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    contentType: "image/png", alt: filename, fit,
    position: { left: x, top: y, width: w, height: h },
  });
}

function notes(slide, lines) {
  slide.speakerNotes.text = lines.join("\n");
  slide.speakerNotes.setVisible(true);
}

// 1. Cover
{
  const s = deck.slides.add();
  s.background.fill = C.navy;
  rect(s, 70, 68, 72, 8, C.cyan);
  text(s, "ITMO-444 · LAB 04", 70, 106, 420, 28, { size: 15, bold: true, color: "#93C5FD" });
  text(s, "Multi-AZ Resilience", 70, 182, 830, 72, { size: 49, bold: true, color: C.white });
  text(s, "ALB, Auto Scaling Groups, and recovery-time SLOs", 70, 270, 860, 70, { size: 27, color: "#CBD5E1" });
  text(s, "Jay Han", 70, 520, 330, 38, { size: 22, bold: true, color: C.white });
  text(s, "jhan38@hawk.illinoistech.edu", 70, 562, 420, 28, { size: 16, color: "#93C5FD" });
  rect(s, 960, 96, 250, 500, "#1E293B", "rounded-xl", "#334155");
  text(s, "2 AZs", 1002, 162, 170, 52, { size: 38, bold: true, color: C.cyan, align: "center" });
  text(s, "1 stable ALB endpoint", 982, 246, 206, 42, { size: 18, color: C.white, align: "center" });
  rect(s, 1010, 320, 150, 2, "#475569");
  text(s, "77.49 s", 1002, 370, 170, 50, { size: 34, bold: true, color: "#86EFAC", align: "center" });
  text(s, "measured outage", 990, 430, 194, 28, { size: 16, color: "#CBD5E1", align: "center" });
  notes(s, ["Source: Assignment4 -Multi-AZ Resilience.pdf", "Course lab reference: EC2_ALB_ASG_MultiAZ_Resilience.pdf"]);
}

// 2. Architecture
{
  const s = deck.slides.add(); s.background.fill = C.cloud; title(s, "Multi-AZ application architecture", "Design");
  text(s, "Internet", 80, 204, 150, 34, { size: 19, bold: true, color: C.muted, align: "center" });
  rect(s, 80, 252, 150, 54, C.white, "rounded-xl", C.line); text(s, "Clients", 100, 267, 110, 25, { size: 20, bold: true, align: "center" });
  text(s, "HTTP 8080 / 8081", 260, 270, 200, 24, { size: 15, color: C.muted, align: "center" });
  rect(s, 472, 220, 260, 118, "#DBEAFE", "rounded-xl", "#93C5FD");
  text(s, "Application Load\nBalancer", 494, 238, 216, 54, { size: 20, bold: true, color: "#1D4ED8", align: "center" });
  text(s, "Stable DNS across two subnets", 494, 302, 216, 22, { size: 13, color: C.muted, align: "center" });
  text(s, "forwards", 748, 270, 110, 24, { size: 15, color: C.muted, align: "center" });
  rect(s, 870, 184, 300, 120, C.white, "rounded-xl", C.line);
  text(s, "Uploader target group", 890, 204, 260, 30, { size: 20, bold: true, color: C.blue, align: "center" });
  text(s, "ASG desired = 1 · port 3000", 890, 246, 260, 24, { size: 15, color: C.muted, align: "center" });
  rect(s, 870, 346, 300, 120, C.white, "rounded-xl", C.line);
  text(s, "Viewer target group", 890, 366, 260, 30, { size: 20, bold: true, color: C.cyan, align: "center" });
  text(s, "ASG desired = 1 · port 3000", 890, 408, 260, 24, { size: 15, color: C.muted, align: "center" });
  rect(s, 472, 430, 260, 112, "#ECFDF5", "rounded-xl", "#86EFAC");
  text(s, "Amazon S3", 494, 453, 216, 32, { size: 23, bold: true, color: "#15803D", align: "center" });
  text(s, "Shared upload storage", 494, 494, 216, 24, { size: 15, color: C.muted, align: "center" });
  // connectors kept simple and orthogonal
  rect(s, 230, 278, 242, 3, "#94A3B8"); rect(s, 732, 278, 138, 3, "#94A3B8");
  rect(s, 836, 242, 3, 166, "#94A3B8"); rect(s, 836, 242, 34, 3, "#94A3B8"); rect(s, 836, 406, 34, 3, "#94A3B8");
  rect(s, 600, 338, 3, 92, "#94A3B8");
  text(s, "The ALB owns the public entry point. Each ASG replaces a failed instance from the latest launch template.", 170, 590, 940, 50, { size: 20, bold: true, color: C.navy, align: "center" });
  footer(s, 2); notes(s, ["Sources: lab04/create_app_stack.sh; EC2_ALB_ASG_MultiAZ_Resilience.pdf, Architecture Overview"]);
}

// 3. Provisioning
{
  const s = deck.slides.add(); s.background.fill = C.cloud; title(s, "Stack creation produced both ALB endpoints", "Provisioning");
  rect(s, 70, 168, 540, 452, C.darkPanel, "rounded-xl");
  await addImage(s, "create-stack-terminal.png", 84, 182, 512, 424, "contain");
  text(s, "What the script created", 660, 184, 500, 40, { size: 25, bold: true, color: C.navy });
  const items = [
    ["01", "Default VPC and subnets in us-east-2a / 2b"],
    ["02", "ALB security group and restricted app ingress"],
    ["03", "Two target groups with 10-second health checks"],
    ["04", "Listeners on ports 8080 and 8081"],
    ["05", "Uploader and viewer ASGs using $Latest"],
  ];
  let y = 244;
  for (const [n, v] of items) {
    text(s, n, 660, y, 42, 28, { size: 14, bold: true, color: C.blue });
    text(s, v, 714, y - 3, 460, 38, { size: 18, color: C.ink });
    y += 68;
  }
  footer(s, 3); notes(s, ["Evidence image extracted from Assignment4 -Multi-AZ Resilience.pdf", "Implementation: lab04/create_app_stack.sh"]);
}

// 4. App verification
{
  const s = deck.slides.add(); s.background.fill = C.cloud; title(s, "Both application endpoints were reachable through the ALB", "Verification");
  rect(s, 70, 176, 540, 392, C.white, "rounded-xl", C.line); await addImage(s, "uploader-browser.png", 88, 194, 504, 356, "contain");
  rect(s, 670, 176, 540, 392, C.white, "rounded-xl", C.line); await addImage(s, "viewer-browser.png", 688, 194, 504, 356, "contain");
  text(s, "Uploader · :8080", 70, 586, 540, 30, { size: 19, bold: true, color: C.blue, align: "center" });
  text(s, "Viewer · :8081", 670, 586, 540, 30, { size: 19, bold: true, color: C.cyan, align: "center" });
  text(s, "The screenshots confirm that both listener ports returned their application pages through the same ALB DNS name.", 150, 632, 980, 34, { size: 18, color: C.navy, align: "center" });
  footer(s, 4); notes(s, ["Evidence images extracted from Assignment4 -Multi-AZ Resilience.pdf"]);
}

// 5. Health and security
{
  const s = deck.slides.add(); s.background.fill = C.cloud; title(s, "Target health confirms the routing path", "Health checks");
  rect(s, 70, 172, 720, 440, C.darkPanel, "rounded-xl"); await addImage(s, "target-health.png", 86, 188, 688, 408, "contain");
  text(s, "Health-check policy", 840, 184, 340, 36, { size: 24, bold: true, color: C.navy });
  text(s, "10 s", 840, 246, 112, 48, { size: 34, bold: true, color: C.blue });
  text(s, "probe interval", 950, 259, 210, 28, { size: 17, color: C.muted });
  text(s, "2", 840, 324, 112, 48, { size: 34, bold: true, color: C.cyan });
  text(s, "healthy checks required", 950, 337, 220, 28, { size: 17, color: C.muted });
  text(s, "ELB", 840, 402, 112, 48, { size: 34, bold: true, color: C.green });
  text(s, "ASG health-check type", 950, 415, 220, 28, { size: 17, color: C.muted });
  rect(s, 840, 492, 330, 2, C.line);
  text(s, "Instances accept port 3000 only from the ALB security group.", 840, 520, 330, 76, { size: 18, bold: true, color: C.navy });
  footer(s, 5); notes(s, ["Evidence image extracted from Assignment4 -Multi-AZ Resilience.pdf", "Configuration source: lab04/create_app_stack.sh"]);
}

// 6. Chaos results
{
  const s = deck.slides.add(); s.background.fill = C.cloud; title(s, "The measured outage met 180 seconds but missed 60 seconds", "Chaos test");
  const chart = s.charts.add("bar", {
    position: { left: 70, top: 190, width: 690, height: 350 },
    categories: ["180 s SLO run", "60 s tightened SLO run"],
    series: [
      { name: "Measured outage", values: [77.49, 81.57], fill: C.blue },
      { name: "SLO threshold", values: [180, 60], fill: C.orange },
    ],
    hasLegend: true,
    dataLabels: { showValue: true, position: "outEnd", numberFormatCode: "0.00\" s\"" },
    xAxis: {},
    yAxis: { minimumScale: 0, maximumScale: 200, majorUnit: 40, title: { text: "Seconds" }, majorGridlines: { style: "solid", fill: C.line, width: 1 } },
  });
  chart.fontFamily = font;
  rect(s, 810, 194, 360, 142, "#ECFDF5", "rounded-xl", "#86EFAC");
  text(s, "PASS", 838, 220, 100, 38, { size: 25, bold: true, color: C.green });
  text(s, "77.49 s ≤ 180 s", 838, 266, 290, 36, { size: 22, bold: true, color: C.navy });
  rect(s, 810, 364, 360, 142, "#FEF2F2", "rounded-xl", "#FCA5A5");
  text(s, "FAIL", 838, 390, 100, 38, { size: 25, bold: true, color: C.red });
  text(s, "81.57 s > 60 s", 838, 436, 290, 36, { size: 22, bold: true, color: C.navy });
  await addImage(s, "chaos-pass.png", 806, 536, 366, 32, "contain");
  await addImage(s, "chaos-fail.png", 806, 580, 366, 36, "contain");
  footer(s, 6); notes(s, ["Data: lab04/testing/chaos_test_uploader_1792080610.csv; lab04/testing/chaos_test_uploader_1792080780.csv", "Console evidence extracted from Assignment4 -Multi-AZ Resilience.pdf"]);
}

// 7. Recovery interpretation and code
{
  const s = deck.slides.add(); s.background.fill = C.cloud; title(s, "Instance replacement dominated the recovery window", "Analysis");
  rect(s, 70, 174, 560, 430, C.white, "rounded-xl", C.line);
  text(s, "Observed sequence", 104, 208, 460, 34, { size: 24, bold: true, color: C.navy });
  const sequence = [
    ["2.22 s", "First failed probe"],
    ["≈75 s", "ASG launches EC2 and runs user data"],
    ["77.49 s", "Service returns after target becomes healthy"],
  ];
  let y = 270;
  for (const [a,b] of sequence) {
    text(s, a, 104, y, 128, 34, { size: 22, bold: true, color: C.blue });
    text(s, b, 246, y, 326, 44, { size: 18, color: C.ink }); y += 82;
  }
  text(s, "A 2-second polling interval only improves measurement precision. It does not shorten EC2 boot, package installation, application startup, or ALB health validation.", 104, 510, 466, 72, { size: 17, color: C.muted });
  rect(s, 670, 174, 540, 430, C.darkPanel, "rounded-xl");
  text(s, "chaos_test.py", 700, 204, 210, 26, { size: 15, bold: true, color: "#93C5FD", fontFamily: mono });
  text(s, "terminate_instance_via_asg(instance_id, region)\n\nwhile True:\n    is_up = probe_once(url)\n    writer.writerow([now, elapsed, is_up, ...])\n\n    if down_detected and is_up:\n        recovery_time = now - outage_start\n        break\n\nverdict = recovery_time <= slo_seconds", 700, 256, 456, 300, { size: 17, color: "#E5E7EB", fontFamily: mono });
  footer(s, 7); notes(s, ["Code source: lab04/testing/chaos_test.py", "Timing source: lab04/testing/chaos_test_uploader_1792080610.csv"]);
}

// 8. Changes and cleanup
{
  const s = deck.slides.add(); s.background.fill = C.cloud; title(s, "ASGs replaced direct EC2 launches and enabled recovery", "Implementation");
  text(s, "Previous lab", 70, 182, 360, 34, { size: 23, bold: true, color: C.muted });
  rect(s, 70, 232, 360, 112, C.white, "rounded-xl", C.line);
  text(s, "aws ec2 run-instances", 98, 266, 304, 34, { size: 21, bold: true, color: C.red, fontFamily: mono, align: "center" });
  text(s, "Current lab", 490, 182, 650, 34, { size: 23, bold: true, color: C.blue });
  rect(s, 490, 232, 650, 112, "#DBEAFE", "rounded-xl", "#93C5FD");
  text(s, "Launch Templates + Target Groups + Auto Scaling Groups", 522, 254, 586, 58, { size: 22, bold: true, color: "#1D4ED8", align: "center", valign: "middle" });
  text(s, "The ASGs maintain desired capacity at 1, attach replacements to the target groups, and let the ALB remove unhealthy targets from service.", 110, 386, 1030, 70, { size: 21, color: C.navy, align: "center" });
  rect(s, 70, 490, 1140, 142, C.darkPanel, "rounded-xl"); await addImage(s, "delete-stack-terminal.png", 90, 504, 500, 112, "contain");
  text(s, "Cleanup completed", 640, 514, 430, 36, { size: 25, bold: true, color: "#86EFAC" });
  text(s, "ASGs, ALB, target groups, security rules, IAM resources, and the S3 bucket were removed in dependency order.", 640, 558, 490, 54, { size: 17, color: "#E5E7EB" });
  footer(s, 8); notes(s, ["Implementation sources: lab04/create_app_stack.sh; lab04/delete_app_stack.sh", "Cleanup evidence extracted from Assignment4 -Multi-AZ Resilience.pdf"]);
}

// Render previews and montage before finalization.
for (const [i, slide] of deck.slides.items.entries()) {
  const png = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(buildDir, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
}
const montage = await deck.export({ format: "webp", montage: true });
await fs.writeFile(path.join(buildDir, "montage.webp"), new Uint8Array(await montage.arrayBuffer()));

const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, "container_tools/artifact_tool_utils.mjs")).href);
const stagingDir = path.join(buildDir, ".finalizer");
await fs.mkdir(stagingDir, { recursive: true });
const candidatePath = path.join(stagingDir, "candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);

await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable,
  integrityValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  explicitTotalSlideCount: 8,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [6],
  materializeLiteralChartWorkbooks: true,
  fontPolicy: { basis: "design", families: [font, mono] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "lab04_multi_az_resilience_final_v2.validation.json"),
});

console.log(finalPath);
