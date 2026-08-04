import React, { useEffect, useRef, useState } from "react";

type Point = {
  x: number;
  y: number;
};

type Stroke = {
  points: Point[];
  mode?: "freehand" | "pen";
};

type Glyph = {
  strokes: Stroke[];
};

type GlyphMap = Record<string, Glyph>;

type GlyphBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

const EDITOR_CANVAS_SIZE = 400;

const PAGE_CHARS_PER_LINE = 20;
const PAGE_CELL_WIDTH = 50;
const PAGE_LINE_HEIGHT = 80;
const PAGE_GLYPH_BOX = 38;

const CHARACTER_SET = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
  ...".,?!:;-_()[]{}",
  " ",
];

function snap(value: number, grid = 25) {
  return Math.round(value / grid) * grid;
}

function getGlyphBounds(glyph: Glyph): GlyphBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  glyph.strokes.forEach((stroke) => {
    stroke.points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });

  if (
    minX === Infinity ||
    minY === Infinity ||
    maxX === -Infinity ||
    maxY === -Infinity
  ) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function buildSmoothPathData(stroke: Stroke, bounds?: GlyphBounds): string {
  if (stroke.points.length < 2) {
    return "";
  }

  const originX = bounds?.minX ?? 0;
  const originY = bounds?.minY ?? 0;

  let pathData = `M ${stroke.points[0].x - originX} ${
    stroke.points[0].y - originY
  }`;

  if (stroke.mode === "pen") {
    for (let i = 1; i < stroke.points.length; i++) {
      pathData += ` L ${stroke.points[i].x - originX} ${
        stroke.points[i].y - originY
      }`;
    }

    return pathData;
  }

  for (let i = 1; i < stroke.points.length - 1; i++) {
    const current = stroke.points[i];
    const next = stroke.points[i + 1];

    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;

    pathData += ` Q ${current.x - originX} ${current.y - originY} ${
      midX - originX
    } ${midY - originY}`;
  }

  return pathData;
}

function buildPageRows(text: string, maxCharsPerLine: number): string[] {
  const rows: string[] = [];

  const paragraphs = text.split("\n");

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(" ");

    let currentLine = "";

    words.forEach((word) => {
      const proposed =
        currentLine.length === 0 ? word : `${currentLine} ${word}`;

      if (proposed.length <= maxCharsPerLine) {
        currentLine = proposed;
      } else {
        if (currentLine.length > 0) {
          rows.push(currentLine);
        }

        currentLine = word;
      }
    });

    if (currentLine.length > 0) {
      rows.push(currentLine);
    }

    rows.push("");
  });

  return rows;
}

export default function GlyphLabApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [currentChar, setCurrentChar] = useState("A");
  const [glyphs, setGlyphs] = useState<GlyphMap>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [penPoints, setPenPoints] = useState<Point[]>([]);
  const [currentTool, setCurrentTool] = useState("draw");

  const [compositionText, setCompositionText] = useState(
    `ABCDEFGHIJKLM
NOPQRSTUVWXYZ
abcdefghijklmnopqrstuvwxyz
0123456789 .,?!:;-_()[]{}`,
  );

  const currentGlyph = glyphs[currentChar] || {
    strokes: [],
  };

  const pageRows = buildPageRows(compositionText, PAGE_CHARS_PER_LINE);

  useEffect(() => {
    const saved = localStorage.getItem("glyphlab-project");

    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as GlyphMap;
      setGlyphs(parsed);
    } catch {
      localStorage.removeItem("glyphlab-project");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("glyphlab-project", JSON.stringify(glyphs));
  }, [glyphs]);

  function exportPNG() {
    const svgElement = document.getElementById("glyph-page");

    if (!svgElement) {
      return;
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);

    const blob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);

    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");

      canvas.width = 1080;
      canvas.height = 1920;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return;
      }

      ctx.fillStyle = "#2b2b2b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const pngUrl = canvas.toDataURL("image/png");

      const a = document.createElement("a");

      a.href = pngUrl;
      a.download = "glyphlab-specimen.png";
      a.click();

      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  function exportSVG() {
    const svgElement = document.getElementById("glyph-page");

    if (!svgElement) {
      return;
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);

    const blob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "glyphlab-specimen.svg";
    a.click();

    URL.revokeObjectURL(url);
  }

  function exportGlyphs() {
    const data = JSON.stringify(glyphs, null, 2);

    const blob = new Blob([data], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "glyphlab-characters.json";
    anchor.click();

    URL.revokeObjectURL(url);
  }

  function clearCurrentGlyph() {
    setGlyphs((prev) => ({
      ...prev,
      [currentChar]: {
        strokes: [],
      },
    }));
  }
  function getMousePos(e: React.MouseEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;

    if (!canvas) {
      return {
        x: 0,
        y: 0,
      };
    }

    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: snap((e.clientX - rect.left) * scaleX),
      y: snap((e.clientY - rect.top) * scaleY),
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (currentChar === " ") {
      return;
    }

    const point = getMousePos(e);

    // ==========================================
    // PEN TOOL
    // ==========================================

    if (currentTool === "pen") {
      // CLOSE SHAPE
      if (penPoints.length >= 3) {
        const first = penPoints[0];

        const dist = Math.hypot(point.x - first.x, point.y - first.y);

        if (dist < 20) {
          const newStroke: Stroke = {
            points: [...penPoints, first],
            mode: "pen",
          };

          setGlyphs((prev) => {
            const existingGlyph = prev[currentChar] || {
              strokes: [],
            };

            return {
              ...prev,
              [currentChar]: {
                strokes: [...existingGlyph.strokes, newStroke],
              },
            };
          });

          setPenPoints([]);

          return;
        }
      }

      // ADD NODE

      setPenPoints((prev) => [...prev, point]);

      return;
    }

    // ==========================================
    // ERASER TOOL
    // ==========================================

    if (currentTool === "erase") {
      setGlyphs((prev) => {
        const glyph = prev[currentChar];

        if (!glyph) {
          return prev;
        }

        const filtered = glyph.strokes.filter((stroke) => {
          return !stroke.points.some((p) => {
            return Math.hypot(p.x - point.x, p.y - point.y) < 20;
          });
        });

        return {
          ...prev,
          [currentChar]: {
            strokes: filtered,
          },
        };
      });

      return;
    }

    // ==========================================
    // FREEHAND DRAW TOOL
    // ==========================================

    if (currentTool === "draw") {
      setIsDrawing(true);

      setCurrentStroke([point]);

      return;
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (currentTool === "line") {
      return;
    }

    if (!isDrawing) {
      return;
    }

    setCurrentStroke((prev) => [...prev, getMousePos(e)]);
  }

  function handleMouseUp() {
    if (!isDrawing) {
      return;
    }

    setIsDrawing(false);

    const newStroke: Stroke = {
      points: currentStroke,
      mode: "freehand",
    };

    setGlyphs((prev) => {
      const existingGlyph = prev[currentChar] || {
        strokes: [],
      };

      return {
        ...prev,
        [currentChar]: {
          strokes: [...existingGlyph.strokes, newStroke],
        },
      };
    });

    setCurrentStroke([]);
  }

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    // ==========================================
    // CLEAR
    // ==========================================

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ==========================================
    // GRID
    // ==========================================

    ctx.strokeStyle = "rgba(255,255,255,0.055)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= canvas.width; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y <= canvas.height; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // ==========================================
    // CENTER GUIDES
    // ==========================================

    ctx.strokeStyle = "rgba(56,189,248,0.22)";

    ctx.beginPath();

    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);

    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);

    ctx.stroke();

    // ==========================================
    // BASE STROKE STYLE
    // ==========================================

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // ==========================================
    // SAVED GLYPH STROKES
    // ==========================================

    currentGlyph.strokes.forEach((stroke) => {
      const pathData = buildSmoothPathData(stroke);

      if (!pathData) {
        return;
      }

      const path = new Path2D(pathData);

      ctx.strokeStyle = "#f5f5f5";

      ctx.stroke(path);
    });

    // ==========================================
    // PEN TOOL PREVIEW
    // ==========================================

    if (penPoints.length > 0) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;

      ctx.beginPath();

      ctx.moveTo(penPoints[0].x, penPoints[0].y);

      for (let i = 1; i < penPoints.length; i++) {
        ctx.lineTo(penPoints[i].x, penPoints[i].y);
      }

      ctx.stroke();

      // DRAW NODES

      penPoints.forEach((p, index) => {
        ctx.beginPath();

        ctx.fillStyle = index === 0 ? "#f43f5e" : "#38bdf8";

        ctx.arc(p.x, p.y, index === 0 ? 6 : 4, 0, Math.PI * 2);

        ctx.fill();
      });
    }

    // ==========================================
    // FREEHAND PREVIEW
    // ==========================================

    if (currentStroke.length > 1) {
      const pathData = buildSmoothPathData({
        points: currentStroke,
      });

      if (pathData) {
        const path = new Path2D(pathData);

        ctx.strokeStyle = "#38bdf8";

        ctx.stroke(path);
      }
    }
  }, [currentGlyph, currentStroke, penPoints]);

  return (
    <div className="h-screen bg-stone-950 text-stone-100 flex flex-col overflow-hidden">
      <header className="h-14 border-b border-stone-800 flex items-center justify-between px-5 shrink-0">
        <div>
          <h1 className="text-base font-bold tracking-wide text-sky-400">
            GlyphLab
          </h1>
          <p className="text-[10px] text-stone-500">
            Experimental Asemic Font System
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportGlyphs}
            className="px-3 py-1 rounded bg-sky-500 text-black text-xs font-medium hover:bg-sky-400 transition"
          >
            Export JSON
          </button>

          <button
            onClick={exportPNG}
            className="px-3 py-1 rounded bg-emerald-500 text-black text-xs font-medium hover:bg-emerald-400 transition"
          >
            Export PNG
          </button>

          <button
            onClick={exportSVG}
            className="px-3 py-1 rounded bg-violet-500 text-white text-xs font-medium hover:bg-violet-400 transition"
          >
            Export SVG
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[260px] border-r border-stone-800 flex flex-col bg-stone-950 shrink-0 overflow-hidden">
          <div className="border-b border-stone-800 p-2 overflow-y-auto">
            <div className="grid grid-cols-8 gap-1">
              {CHARACTER_SET.map((char) => (
                <button
                  key={char}
                  onClick={() => setCurrentChar(char)}
                  className={`h-7 rounded border text-[10px] transition ${
                    currentChar === char
                      ? "border-sky-500 bg-sky-500/10 text-sky-400"
                      : "border-stone-800 bg-stone-900/40 text-stone-400 hover:border-stone-700"
                  }`}
                >
                  {char === " " ? "SP" : char}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 p-2 border-b border-stone-800 bg-stone-950">
            <button
              onClick={() => setCurrentTool("draw")}
              className={`px-3 py-1 rounded text-xs transition ${
                currentTool === "draw"
                  ? "bg-sky-500 text-black"
                  : "bg-stone-800 text-stone-300 hover:bg-stone-700"
              }`}
            >
              Draw
            </button>

            <button
              onClick={() => setCurrentTool("pen")}
              className={`px-3 py-1 rounded text-xs transition ${
                currentTool === "pen"
                  ? "bg-sky-500 text-black"
                  : "bg-stone-800 text-stone-300 hover:bg-stone-700"
              }`}
            >
              Pen
            </button>

            <button
              onClick={() => setCurrentTool("erase")}
              className={`px-3 py-1 rounded text-xs transition ${
                currentTool === "erase"
                  ? "bg-red-500 text-black"
                  : "bg-stone-800 text-stone-300 hover:bg-stone-700"
              }`}
            >
              Erase
            </button>

            <button
              onClick={() => setCurrentTool("arc")}
              className={`px-3 py-1 rounded text-xs transition ${
                currentTool === "arc"
                  ? "bg-violet-500 text-white"
                  : "bg-stone-800 text-stone-300 hover:bg-stone-700"
              }`}
            >
              Arc
            </button>
          </div>

          <div className="flex-1 border-b border-stone-800 flex items-center justify-center overflow-hidden bg-stone-950">
            <div className="w-full h-full flex items-center justify-center p-1">
              <canvas
                ref={canvasRef}
                width={EDITOR_CANVAS_SIZE}
                height={EDITOR_CANVAS_SIZE}
                className="border border-stone-800 rounded-lg bg-black w-full aspect-square max-h-full"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
          </div>
          <button
            onClick={clearCurrentGlyph}
            className="px-3 py-1 rounded bg-stone-800 text-stone-300 text-xs hover:bg-stone-700 transition"
          >
            Clear Glyph
          </button>
          <div className="h-10 border-b border-stone-800 px-3 flex items-center justify-between text-[10px] text-stone-500">
            <div>
              Char:
              <span className="ml-1 text-sky-400">
                {currentChar === " " ? "SPACE" : currentChar}
              </span>
            </div>

            <div>
              Strokes:
              <span className="ml-1 text-stone-300">
                {currentGlyph.strokes.length}
              </span>
            </div>
          </div>

          <div className="h-[170px] p-2">
            <textarea
              value={compositionText}
              onChange={(e) => setCompositionText(e.target.value)}
              className="w-full h-full bg-stone-900 border border-stone-800 rounded-lg p-3 outline-none resize-none text-xs text-stone-200"
            />
          </div>
        </div>

        <div className="flex-1 bg-stone-900 overflow-auto flex items-start justify-center p-1">
          {" "}
          <div className="bg-[#2b2b2b] shadow-2xl w-[850px] min-h-[1100px] p-6">
            {" "}
            <svg
              id="glyph-page"
              width="100%"
              height="1400"
              viewBox="0 0 1080 1920"
            >
              {pageRows.map((rowText, rowIndex) => {
                return rowText.split("").map((char, colIndex) => {
                  const offsetX = colIndex * PAGE_CELL_WIDTH;
                  const offsetY = rowIndex * PAGE_LINE_HEIGHT;

                  if (char === " ") {
                    return null;
                  }

                  const glyph = glyphs[char];

                  if (!glyph) {
                    return (
                      <text
                        key={`fallback-${rowIndex}-${colIndex}`}
                        x={offsetX + 12}
                        y={offsetY + 58}
                        fill="#5f5f5f"
                        fontSize="28"
                        fontFamily="monospace"
                      >
                        {char}
                      </text>
                    );
                  }

                  const bounds = getGlyphBounds(glyph);

                  if (!bounds) {
                    return null;
                  }

                  const scale = Math.min(
                    PAGE_GLYPH_BOX / bounds.width,
                    PAGE_GLYPH_BOX / bounds.height,
                    0.9,
                  );

                  const normalizedWidth = bounds.width * scale;
                  const normalizedHeight = bounds.height * scale;

                  const centerX =
                    offsetX + (PAGE_CELL_WIDTH - normalizedWidth) / 2;
                  const centerY =
                    offsetY + (PAGE_LINE_HEIGHT - normalizedHeight) / 2;

                  return (
                    <g
                      key={`glyph-${rowIndex}-${colIndex}-${char}`}
                      transform={`translate(${centerX}, ${centerY}) scale(${scale})`}
                    >
                      {glyph.strokes.map((stroke, strokeIndex) => {
                        const pathData = buildSmoothPathData(stroke, bounds);

                        if (!pathData) {
                          return null;
                        }

                        return (
                          <path
                            key={strokeIndex}
                            d={pathData}
                            fill="none"
                            stroke="#f5f5f5"
                            strokeWidth={Math.max(1.2, 2 / scale)}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })}
                    </g>
                  );
                });
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
