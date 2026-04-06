// svgImporter.js
(function initSVGImporter(global) {
  const SBE = (global.SBE = global.SBE || {});

  function importSVG(svgText, lineSettings) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");

    const segments = [];

    // --- HANDLE <line> ---
    doc.querySelectorAll("line").forEach((el) => {
      segments.push({
        x1: parseFloat(el.getAttribute("x1")),
        y1: parseFloat(el.getAttribute("y1")),
        x2: parseFloat(el.getAttribute("x2")),
        y2: parseFloat(el.getAttribute("y2")),
      });
    });

    // --- HANDLE <polyline> ---
    doc.querySelectorAll("polyline").forEach((el) => {
      const points = parsePoints(el.getAttribute("points"));
      segments.push(...pointsToSegments(points));
    });

    // --- HANDLE <path> (basic) ---
    doc.querySelectorAll("path").forEach((el) => {
      const path = el.getAttribute("d");
      const points = samplePath(path, 16); // resolution
      segments.push(...pointsToSegments(points));
    });

    return segments.map((seg) => SBE.LineSystem.createLine(seg, lineSettings));
  }

  function parsePoints(str) {
    return str
      .trim()
      .split(" ")
      .map((p) => {
        const [x, y] = p.split(",").map(Number);
        return { x, y };
      });
  }

  function pointsToSegments(points) {
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      if (!points[i] || !points[i + 1]) {
        continue;
      }

      segments.push({
        x1: points[i].x,
        y1: points[i].y,
        x2: points[i + 1].x,
        y2: points[i + 1].y,
      });
    }
    return segments;
  }

  function samplePath(d, resolution = 16) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const samples = [];
    const subpaths = splitSubpaths(d);

    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    svg.style.visibility = "hidden";
    svg.style.pointerEvents = "none";

    document.body.appendChild(svg);

    try {
      subpaths.forEach((subpathD, subpathIndex) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", subpathD);
        svg.appendChild(path);

        const length = path.getTotalLength();
        const stepCount = Math.max(1, Math.ceil(length / resolution));

        for (let i = 0; i <= stepCount; i++) {
          const point = path.getPointAtLength((i / stepCount) * length);
          samples.push({ x: point.x, y: point.y });
        }

        if (subpathIndex < subpaths.length - 1) {
          samples.push(null);
        }
      });
    } finally {
      document.body.removeChild(svg);
    }

    return samples;
  }

  function splitSubpaths(d) {
    const matches = d.match(/[Mm][^Mm]*/g);
    return matches && matches.length ? matches.map((part) => part.trim()) : [d];
  }

  function normalizePoints(points, width, height) {
    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;

    points.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });

    const scaleX = width / (maxX - minX);
    const scaleY = height / (maxY - minY);
    const scale = Math.min(scaleX, scaleY) * 0.8;

    return points.map((p) => ({
      x: (p.x - minX) * scale + width * 0.1,
      y: (p.y - minY) * scale + height * 0.1,
    }));
  }

  SBE.SVGImporter = {
    importSVG,
  };
})(window);
