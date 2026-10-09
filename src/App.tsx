import { useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react"
import katex from "katex"
import "katex/dist/katex.min.css"
import { computeDiagnostics, computeStats, presets, signed } from "./statistics"
import type { Point, PresetKey } from "./statistics"

const correlationEquation = katex.renderToString(
  String.raw`r = \frac{1}{n-1}\sum \left(\frac{x_i-\bar{x}}{s_x}\right)\left(\frac{y_i-\bar{y}}{s_y}\right)`,
  {
    displayMode: true,
    throwOnError: false,
  },
)

type IconName = "scatter" | "book" | "arrow" | "reset" | "download" | "info" | "chevron" | "check" | "target" | "expand" | "close" | "spark" | "sliders"
function Icon({ name, size = 18 }: { name: IconName size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    scatter: (
      <>
        <path d="M4 3v17h17" />
        <circle cx="8" cy="14" r="1" />
        <circle cx="12" cy="10" r="1" />
        <circle cx="16" cy="11" r="1" />
        <circle cx="19" cy="5" r="1" />
        <circle cx="7" cy="7" r="1" />
      </>
    ),
    book: (
      <>
        <path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" />
      </>
    ),
    arrow: (
      <>
        <path d="m7 17 10-10M7 7h10v10" />
      </>
    ),
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v.2" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 6h4m4 0h8M4 12h9m4 0h3M4 18h2m4 0h10" />
        <circle cx="10" cy="6" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="8" cy="18" r="2" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

const plot = { left: 55, top: 24, width: 565, height: 360 }
const axisBounds = { min: -10, max: 30 }
const axisSpan = axisBounds.max - axisBounds.min
const axisTicks = Array.from(
  { length: axisSpan / 5 + 1 },
  (_, i) => axisBounds.min + i * 5,
)
const px = (x: number) =>
  plot.left + ((x - axisBounds.min) / axisSpan) * plot.width
const py = (y: number) =>
  plot.top + plot.height - ((y - axisBounds.min) / axisSpan) * plot.height
const clamp = (n: number) =>
  Math.max(axisBounds.min, Math.min(axisBounds.max, n))
const toData = (position: Point): Point => ({
  x: clamp(axisBounds.min + ((position.x - plot.left) / plot.width) * axisSpan),
  y: clamp(
    axisBounds.min +
      ((plot.top + plot.height - position.y) / plot.height) * axisSpan,
  ),
})
function plotPosition(svg: SVGSVGElement, clientX: number, clientY: number) {
  const matrix = svg.getScreenCTM()
  return matrix
    ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    : null
}
const equation = (stats: ReturnType<typeof computeStats>) =>
  `ŷ = ${stats.slope.toFixed(3)}x ${
    stats.intercept >= 0 ? "+" : "−"
  } ${Math.abs(stats.intercept).toFixed(3)}`

export default function App() {
  const [preset, setPreset] = useState<PresetKey>("moderate")
  const [points, setPoints] = useState<Point[]>(
    presets.moderate.points.map((p) => ({ ...p })),
  )
  const [candidate, setCandidate] = useState<Point>({
    ...presets.moderate.candidate,
  })
  const [heatmap, setHeatmap] = useState(true)
  const [opacity, setOpacity] = useState(45)
  const [guide, setGuide] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<"explorer" | "data">("explorer")
  const [exported, setExported] = useState(false)
  const drag = useRef<number | null>(null)
  const suppressAdd = useRef(false)
  const guideRef = useRef<HTMLDialogElement>(null)
  const base = useMemo(() => computeStats(points), [points])
  const active = useMemo(
    () => computeStats([...points, candidate]),
    [points, candidate],
  )
  const diagnostics = useMemo(
    () => computeDiagnostics(points, candidate),
    [points, candidate],
  )
  const delta = Math.abs(active.r) - Math.abs(base.r)
  const neutral = Math.abs(delta) < 0.0005
  const stronger = delta > 0
  const shiftLabel = neutral
    ? "Strength unchanged"
    : stronger
      ? "Strength increased"
      : "Strength decreased"
  const heatCells = useMemo(() => {
    const cells = []
    const resolution = 55
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const test = computeStats([
          ...points,
          {
            x: axisBounds.min + ((x + 0.5) / resolution) * axisSpan,
            y: axisBounds.min + ((y + 0.5) / resolution) * axisSpan,
          },
        ])
        const change = Math.abs(test.r) - Math.abs(base.r)
        cells.push(
          <rect
            key={`${x}-${y}`}
            x={plot.left + (x / resolution) * plot.width}
            y={plot.top + ((resolution - y - 1) / resolution) * plot.height}
            width={plot.width / resolution + 0.3}
            height={plot.height / resolution + 0.3}
            fill={change >= 0 ? "#80c4aa" : "#edaab3"}
            opacity={Math.min(0.75, 0.1 + Math.abs(change) * 3.5)}
          />,
        )
      }
    }
    return cells
  }, [points, base.r])

  useEffect(() => {
    if (guide) guideRef.current?.showModal()
    else guideRef.current?.close()
  }, [guide])
  useEffect(() => {
    if (!expanded) return
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false)
    }
    document.addEventListener("keydown", close)
    return () => document.removeEventListener("keydown", close)
  }, [expanded])

  function changePreset(key: PresetKey) {
    setPreset(key)
    setPoints(presets[key].points.map((p) => ({ ...p })))
    setCandidate({ ...presets[key].candidate })
  }
  function movePoint(index: number, point: Point) {
    if (index === -1) setCandidate(point)
    else
      setPoints((current) => current.map((p, i) => (i === index ? point : p)))
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (drag.current === null) return
    const position = plotPosition(
      event.currentTarget,
      event.clientX,
      event.clientY,
    )
    if (position) movePoint(drag.current, toData(position))
  }
  function addPoint(event: MouseEvent<SVGSVGElement>) {
    if (
      suppressAdd.current ||
      (event.target instanceof Element && event.target.closest(".chart-point"))
    )
      return
    const position = plotPosition(
      event.currentTarget,
      event.clientX,
      event.clientY,
    )
    if (
      !position ||
      position.x < plot.left ||
      position.x > plot.left + plot.width ||
      position.y < plot.top ||
      position.y > plot.top + plot.height
    )
      return
    setPoints((current) => [...current, toData(position)])
  }
  function removePoint(index: number) {
    if (index === -1) return
    setPoints((current) =>
      current.length > 2 ? current.filter((_, i) => i !== index) : current,
    )
  }
  function keyMove(
    event: KeyboardEvent<SVGGElement>,
    index: number,
    point: Point,
  ) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      removePoint(index)
      return
    }
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return
    event.preventDefault()
    const step = event.shiftKey ? 1 : 0.2
    movePoint(index, {
      x: clamp(
        point.x +
          (event.key === "ArrowRight"
            ? step
            : event.key === "ArrowLeft"
              ? -step
              : 0),
      ),
      y: clamp(
        point.y +
          (event.key === "ArrowUp"
            ? step
            : event.key === "ArrowDown"
              ? -step
              : 0),
      ),
    })
  }
  function exportData() {
    const csv = `point,x,y\n${points.map((p, i) => `Baseline ${i + 1},${p.x},${p.y}`).join("\n")}\nCandidate P1,${candidate.x},${candidate.y}\n\nmetric,baseline,active\nPearson r,${
      base.defined ? base.r : ""
    },${active.defined ? active.r : ""}\nR squared,${
      base.defined ? base.r2 : ""
    },${
      active.defined ? active.r2 : ""
    }\nslope,${base.slope},${active.slope}\nintercept,${base.intercept},${active.intercept}\n\ncandidate diagnostic,value\nstandardized residual,${diagnostics.standardized}\nleverage,${diagnostics.leverage}\nCook's distance,${diagnostics.cook}`
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `correlation-${preset}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setExported(true)
    window.setTimeout(() => setExported(false), 2500)
  }

  const diagnosticRows = [
    {
      title: "Outlier",
      yes: Math.abs(diagnostics.standardized) > 2,
      icon: "target" as IconName,
    },
    {
      title: "High leverage",
      yes: diagnostics.leverage > diagnostics.threshold,
      icon: "expand" as IconName,
    },
    {
      title: "Influential point",
      yes: diagnostics.cook > diagnostics.threshold,
      icon: "spark" as IconName,
    },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            setTab("explorer")
          }}
        >
          <span className="brand-icon">
            <Icon name="scatter" size={23} />
          </span>
          <span>
            Correlation<span className="brand-light">lab</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${tab === "explorer" ? "selected" : ""}`}
            onClick={() => setTab("explorer")}
          >
            <Icon name="scatter" />
            Correlation explorer
            <span className="nav-selected-dot" />
          </button>
          <button
            className={`nav-item ${tab === "data" ? "selected" : ""}`}
            onClick={() => setTab("data")}
          >
            <Icon name="sliders" />
            Dataset & values
          </button>
          <button className="nav-item" onClick={() => setGuide(true)}>
            <Icon name="book" />
            Learning guide
            <Icon name="chevron" size={14} />
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <Icon name="spark" size={20} />
          </span>
          <h3>
            A small point.
            <br />A big difference.
          </h3>
          <p>Explore how a single observation can change the whole picture.</p>
          <button onClick={() => setGuide(true)}>
            Learn the fundamentals
            <Icon name="arrow" size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className="small-logo">
            <Icon name="scatter" size={17} />
          </span>
          <div>
            Built for curious minds<span>Statistics, made tangible.</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace
            <Icon name="chevron" size={12} />
            <span>
              {tab === "explorer" ? "Correlation explorer" : "Dataset & values"}
            </span>
          </div>
          <span className="interactive-label">
            <span />
            Interactive learning tool
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">THE STATISTICS PLAYGROUND</div>
              <h1>
                Correlation coefficient explorer<span className="title-dot">.</span>
              </h1>
              <p>
                One point can change the story. Discover how correlation and
                regression respond.
              </p>
            </div>
            <button
              className="button secondary guide-button"
              onClick={() => setGuide(true)}
            >
              <Icon name="book" />
              Quick guide
            </button>
          </div>

          <section className="dataset-toolbar" aria-label="Dataset controls">
            <div className="preset-control">
              <span className="toolbar-icon">
                <Icon name="sliders" size={20} />
              </span>
              <label htmlFor="preset">
                Dataset preset<span>Choose your starting relationship</span>
              </label>
              <div className="select-wrap">
                <select
                  id="preset"
                  value={preset}
                  onChange={(e) => changePreset(e.target.value as PresetKey)}
                >
                  {Object.entries(presets).map(([key, p]) => (
                    <option key={key} value={key}>
                      {p.label} ({p.description})
                    </option>
                  ))}
                </select>
                <Icon name="chevron" size={14} />
              </div>
            </div>
            <div className="toolbar-right">
              <span className="observations">
                {points.length} baseline points <span>+ 1 candidate</span>
              </span>
              <span className="toolbar-divider" />
              <button
                className="button reset-button"
                onClick={() => setCandidate({ ...presets[preset].candidate })}
              >
                <Icon name="reset" size={16} />
                Reset P<sub>1</sub>
              </button>
            </div>
          </section>

          {tab === "data" ? (
            <section className="panel data-panel">
              <div className="panel-heading">
                <div>
                  <h2>Dataset & values</h2>
                  <p>Edit coordinates to see the model update instantly.</p>
                </div>
                <button className="button secondary" onClick={exportData}>
                  <Icon name="download" />
                  Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Observation</th>
                    <th>x coordinate</th>
                    <th>y coordinate</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points, candidate].map((p, i) => (
                    <tr key={i}>
                      <td>{i === points.length ? "P₁" : `P${i + 2}`}</td>
                      {(["x", "y"] as const).map((axis) => (
                        <td key={axis}>
                          <input
                            aria-label={`${
                              i === points.length
                                ? "Candidate"
                                : `Baseline ${i + 1}`
                            } ${axis}`}
                            type="number"
                            min={axisBounds.min}
                            max={axisBounds.max}
                            step="0.1"
                            value={Number(p[axis].toFixed(2))}
                            onChange={(e) => {
                              if (e.target.value !== "")
                                movePoint(i === points.length ? -1 : i, {
                                  ...p,
                                  [axis]: clamp(Number(e.target.value)),
                                })
                            }}
                          />
                        </td>
                      ))}
                      <td>
                        <span
                          className={`badge ${
                            i === points.length ? "amber-badge" : "blue-badge"
                          }`}
                        >
                          {i === points.length ? "Candidate" : "Baseline"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="button secondary"
                onClick={() => setTab("explorer")}
              >
                <Icon name="scatter" />
                Back to explorer
              </button>
            </section>
          ) : (
            <div className="workspace-grid">
              <section
                className={`panel plot-panel ${
                  expanded ? "plot-expanded" : ""
                }`}
              >
                <div className="panel-heading">
                  <div className="heading-with-icon">
                    <span className="section-icon">
                      <Icon name="scatter" />
                    </span>
                    <h2>Interactive scatter plot</h2>
                    <span className="live-badge">
                      <span />
                      LIVE
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    title={expanded ? "Close expanded plot" : "Expand plot"}
                    aria-label={
                      expanded ? "Close expanded plot" : "Expand plot"
                    }
                    onClick={() => setExpanded(!expanded)}
                  >
                    <Icon name={expanded ? "close" : "expand"} size={17} />
                  </button>
                </div>
                <div className="plot-description">
                  Click to add a blue point. Right-click a blue point to remove.
                  Drag any point to move.
                </div>
                <div className="equation-row">
                  <span>
                    <i className="line-swatch blue-line" />
                    Baseline <code>{equation(base)}</code>
                  </span>
                  <span>
                    <i className="line-swatch amber-line" />
                    Active <code>{equation(active)}</code>
                  </span>
                </div>
                <svg
                  className="scatter-chart"
                  viewBox="0 0 650 435"
                  aria-label="Interactive scatter plot. Click empty plot space to add a baseline point. Right-click a baseline point or press Delete to remove it. Use arrow keys to move a focused point."
                  onClick={addPoint}
                  onPointerDownCapture={() => {
                    suppressAdd.current = false
                  }}
                  onPointerMove={pointerMove}
                  onPointerUp={() => {
                    drag.current = null
                  }}
                  onPointerCancel={() => {
                    drag.current = null
                  }}
                >
                  <defs>
                    <clipPath id="plot-clip">
                      <rect
                        x={plot.left}
                        y={plot.top}
                        width={plot.width}
                        height={plot.height}
                      />
                    </clipPath>
                  </defs>
                  <rect
                    x={plot.left}
                    y={plot.top}
                    width={plot.width}
                    height={plot.height}
                    fill="#fafcfb"
                  />
                  <g clipPath="url(#plot-clip)">
                    {heatmap && <g opacity={opacity / 100}>{heatCells}</g>}
                    {axisTicks.map((value) => (
                      <g key={value} className="grid-lines">
                        <path
                          d={`M${px(value)} ${plot.top}V${plot.top + plot.height}`}
                        />
                        <path
                          d={`M${plot.left} ${py(value)}H${plot.left + plot.width}`}
                        />
                      </g>
                    ))}
                    <path
                      className="regression-line base-regression"
                      d={`M${px(axisBounds.min)} ${py(base.slope * axisBounds.min + base.intercept)}L${px(axisBounds.max)} ${py(base.slope * axisBounds.max + base.intercept)}`}
                    />
                    <path
                      className="regression-line active-regression"
                      d={`M${px(axisBounds.min)} ${py(active.slope * axisBounds.min + active.intercept)}L${px(axisBounds.max)} ${py(active.slope * axisBounds.max + active.intercept)}`}
                    />
                    <path
                      d={`M${px(candidate.x)} ${py(candidate.y)}V${py(active.slope * candidate.x + active.intercept)}`}
                      className="residual-line"
                    />
                  </g>
                  <path
                    className="axis-line"
                    d={`M${plot.left} ${plot.top}V${plot.top + plot.height}H${plot.left + plot.width}`}
                  />
                  {axisTicks.map((value) => (
                    <g key={value} className="axis-label">
                      <text
                        x={px(value)}
                        y={plot.top + plot.height + 22}
                        textAnchor="middle"
                      >
                        {value}
                      </text>
                      <text
                        x={plot.left - 14}
                        y={py(value) + 4}
                        textAnchor="end"
                      >
                        {value}
                      </text>
                    </g>
                  ))}
                  <text
                    x={plot.left + plot.width / 2}
                    y="430"
                    className="axis-title"
                    textAnchor="middle"
                  >
                    X variable
                  </text>
                  <text
                    transform="translate(15 205) rotate(-90)"
                    className="axis-title"
                    textAnchor="middle"
                  >
                    Y variable
                  </text>
                  {[...points, candidate].map((point, i) => {
                    const isCandidate = i === points.length
                    const index = isCandidate ? -1 : i
                    return (
                      <g
                        key={i}
                        className={`chart-point ${
                          isCandidate ? "candidate-point" : "baseline-point"
                        }`}
                        transform={`translate(${px(point.x)}, ${py(point.y)})`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${
                          isCandidate
                            ? "Candidate P1"
                            : `Baseline point ${i + 1}`
                        }, x ${point.x.toFixed(1)}, y ${point.y.toFixed(1)}. Use arrow keys to move.${
                          isCandidate
                            ? ""
                            : " Right-click or press Delete to remove (minimum 2 baseline points)."
                        }`}
                        onKeyDown={(event) => keyMove(event, index, point)}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return
                          event.preventDefault()
                          suppressAdd.current = true
                          drag.current = index
                          event.currentTarget.ownerSVGElement?.setPointerCapture(
                            event.pointerId,
                          )
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          removePoint(index)
                        }}
                      >
                        <title>
                          {isCandidate ? "P₁" : `Baseline ${i + 1}`}: (
                          {point.x.toFixed(1)}, {point.y.toFixed(1)})
                        </title>
                        <circle r="17" fill="transparent" />
                        {isCandidate && (
                          <circle className="candidate-halo" r="15" />
                        )}
                        <circle
                          className="point-dot"
                          r={isCandidate ? 8 : 5.5}
                        />
                        {isCandidate && (
                          <g
                            className="candidate-label"
                            transform={`translate(${
                              point.x > axisBounds.max - 3 ? -52 : 15
                            }, ${point.y > axisBounds.max - 2 ? 16 : -24})`}
                          >
                            <rect width="36" height="25" rx="6" />
                            <text x="18" y="17" textAnchor="middle">
                              P₁
                            </text>
                          </g>
                        )}
                      </g>
                    )
                  })}
                </svg>
                <div className="plot-legend">
                  <span>
                    <i className="dot blue-dot" />
                    Baseline points
                  </span>
                  <span>
                    <i className="dot amber-dot" />
                    Candidate P<sub>1</sub>
                  </span>
                  <span>
                    <i className="line-swatch blue-line" />
                    Baseline fit
                  </span>
                  <span>
                    <i className="line-swatch amber-line" />
                    Active fit
                  </span>
                </div>
                <div className="heatmap-controls">
                  <div className="heatmap-control-label">
                    <button
                      role="switch"
                      aria-checked={heatmap}
                      aria-label="Show sensitivity heatmap"
                      className={`switch ${heatmap ? "on" : ""}`}
                      onClick={() => setHeatmap(!heatmap)}
                    >
                      <span />
                    </button>
                    <span>Sensitivity heatmap</span>
                    <span
                      className="tooltip"
                      tabIndex={0}
                      aria-label="Heatmap indicates how adding a point at each location would change the magnitude of correlation."
                    >
                      <Icon name="info" size={14} />
                      <span>
                        Each region shows how adding P₁ there would change |r|.
                      </span>
                    </span>
                  </div>
                  <div className="heatmap-strength">
                    <label htmlFor="opacity">Opacity</label>
                    <input
                      id="opacity"
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={opacity}
                      disabled={!heatmap}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                    />
                    <span>{opacity}%</span>
                  </div>
                </div>
                <div className="heatmap-legend">
                  <span>
                    <i className="heat-swatch stronger-swatch" />
                    Stronger |r|
                  </span>
                  <div className="heat-gradient" />
                  <span>
                    <i className="heat-swatch weaker-swatch" />
                    Weaker |r|
                  </span>
                  <span className="heatmap-caption">
                    Color shows the effect of adding P<sub>1</sub>
                  </span>
                </div>
                <div className="plot-tip">
                  <Icon name="info" size={15} />
                  <span>
                    Keep at least 2 blue baseline points. The amber candidate P
                    <sub>1</sub> stays on the plot.
                  </span>
                </div>
              </section>

              <div className="results-column">
                <section className="panel impact-panel">
                  <div className="panel-heading">
                    <h2>Correlation impact</h2>
                    <span
                      className="tooltip"
                      tabIndex={0}
                      aria-label="Compare correlation coefficient before and after adding the candidate point."
                    >
                      <Icon name="info" size={16} />
                      <span>
                        Compare the baseline dataset with the dataset including
                        P₁.
                      </span>
                    </span>
                  </div>
                  <p className="section-description">
                    The same dataset. One extra observation.
                  </p>
                  <div className="metric-comparison">
                    <div className="metric baseline-metric">
                      <div className="metric-label">
                        <i className="dot blue-dot" />
                        BASELINE
                      </div>
                      <div className="metric-value">
                        {base.defined ? signed(base.r) : "N/A"}
                      </div>
                      <span className="metric-subtitle">
                        without P<sub>1</sub>
                      </span>
                      <div className="r-squared">
                        <span>R²</span>
                        <code>{base.defined ? base.r2.toFixed(3) : "N/A"}</code>
                      </div>
                    </div>
                    <div className="metric active-metric">
                      <div className="metric-label">
                        <i className="dot amber-dot" />
                        ACTIVE
                      </div>
                      <div className="metric-value">
                        {active.defined ? signed(active.r) : "N/A"}
                      </div>
                      <span className="metric-subtitle">
                        with P<sub>1</sub>
                      </span>
                      <div className="r-squared">
                        <span>R²</span>
                        <code>
                          {active.defined ? active.r2.toFixed(3) : "N/A"}
                        </code>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`shift-summary ${
                      neutral ? "neutral" : stronger ? "positive" : "negative"
                    }`}
                  >
                    <div>
                      <span>Change in magnitude</span>
                      <code>
                        Δ|r| = |r<sub>active</sub>| − |r<sub>base</sub>|
                      </code>
                    </div>
                    <strong>
                      {base.defined && active.defined ? signed(delta) : "N/A"}
                    </strong>
                  </div>
                  <div
                    className={`impact-insight ${
                      neutral ? "neutral" : stronger ? "positive" : "negative"
                    }`}
                  >
                    <span className="insight-icon">
                      <Icon name={neutral ? "info" : "arrow"} size={17} />
                    </span>
                    <div>
                      <strong>
                        {base.defined && active.defined
                          ? shiftLabel
                          : "Correlation undefined"}
                      </strong>
                      <p>
                        {!base.defined || !active.defined ? (
                          "Correlation needs nonzero variation in both variables."
                        ) : (
                          <>
                            P<sub>1</sub> at{" "}
                            <code>
                              ({candidate.x.toFixed(1)},{" "}
                              {candidate.y.toFixed(1)})
                            </code>{" "}
                            {neutral ? (
                              "leaves correlation magnitude unchanged."
                            ) : (
                              <>
                                {stronger ? "strengthens" : "weakens"} the
                                linear relationship.
                              </>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="panel diagnostic-panel">
                  <div className="panel-heading">
                    <h2>Point diagnostics</h2>
                    <span className="candidate-badge">
                      Candidate P<sub>1</sub>
                    </span>
                  </div>
                  <div className="diagnostic-list">
                    {diagnosticRows.map((row) => (
                      <div
                        className={`diagnostic-row ${row.yes ? "flagged" : ""}`}
                        key={row.title}
                      >
                        <div className="diagnostic-main">
                          <span className="diagnostic-icon">
                            <Icon name={row.icon} size={20} />
                          </span>
                          <h3>{row.title}</h3>
                          <span
                            className={`diagnostic-status ${
                              row.yes ? "status-yes" : "status-no"
                            }`}
                            aria-label={`${row.title}: ${
                              row.yes ? "Yes" : "No"
                            }`}
                          >
                            {row.yes ? "Yes" : "No"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}

          <section className="understanding-section">
            <div className="understanding-heading">
              <h2>A little context goes a long way</h2>
              <span>THE IDEAS BEHIND THE NUMBERS</span>
            </div>
            <div className="concept-grid">
              <article className="concept-card">
                <span className="concept-number">01</span>
                <div>
                  <h3>Correlation isn’t causation.</h3>
                  <p>
                    Pearson’s r measures the strength of a{" "}
                    <strong>linear relationship</strong>, not whether one
                    variable causes the other.
                  </p>
                </div>
              </article>
              <article className="concept-card">
                <span className="concept-number">02</span>
                <div>
                  <h3>Position matters.</h3>
                  <p>
                    A point can have <strong>high leverage</strong> without
                    being an outlier. Its x-position and residual tell different
                    stories.
                  </p>
                </div>
              </article>
              <article className="concept-card">
                <span className="concept-number">03</span>
                <div>
                  <h3>Look beyond a single number.</h3>
                  <p>
                    Pair r with the scatter plot and{" "}
                    <strong>regression diagnostics</strong> to understand the
                    full picture.
                  </p>
                </div>
              </article>
            </div>
          </section>
          <footer className="page-footer">
            <span>
              <span className="footer-dot" />
              All calculations happen live, right in your browser.
            </span>
            <button onClick={exportData}>
              <Icon name={exported ? "check" : "download"} size={15} />
              {exported ? "CSV exported" : "Export dataset"}
              <Icon name="arrow" size={14} />
            </button>
          </footer>
        </main>
      </div>
      <dialog
        ref={guideRef}
        className="guide-dialog"
        onCancel={() => setGuide(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setGuide(false)
        }}
        onClose={() => setGuide(false)}
      >
        <div className="dialog-content">
          <div className="panel-heading">
            <span className="eyebrow">YOUR QUICK GUIDE</span>
            <button
              className="icon-button"
              aria-label="Close guide"
              onClick={() => setGuide(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <h2>Make the numbers tangible.</h2>
          <p>Explore what happens when one new observation joins a dataset.</p>
          <ol>
            <li>
              <strong>Choose a starting relationship.</strong>
              <p>
                Switch between positive, negative, and near-zero datasets with
                the preset selector.
              </p>
            </li>
            <li>
              <strong>Move a point. Watch the story change.</strong>
              <p>
                Drag the amber P₁ or any blue baseline point. You can also focus
                a point and use the arrow keys (Shift for larger steps). Click
                empty graph space to add a blue baseline point. Right-click a
                blue point, or focus it and press Delete, to remove it. Keep at
                least two baseline points; the amber candidate P₁ cannot be
                removed.
              </p>
            </li>
            <li>
              <strong>Read the heatmap.</strong>
              <p>
                Green locations increase |r|. Rose locations decrease it. The
                map is computed from the baseline, before adding P₁.
              </p>
            </li>
            <li>
              <strong>Compare the diagnostics.</strong>
              <p>
                Outliers have large standardized residuals. Leverage measures
                unusual x-position. Cook’s distance measures influence on the
                fitted regression.
              </p>
            </li>
          </ol>
          <div className="guide-formula">
            <span>Correlation coefficient</span>
            <div
              className="correlation-equation"
              dangerouslySetInnerHTML={{ __html: correlationEquation }}
            />
            <p>
              −1 ≤ r ≤ +1. R² is the proportion of variation explained by the
              fitted linear model with an intercept.
            </p>
          </div>
          <button className="button primary" onClick={() => setGuide(false)}>
            Let’s explore
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </dialog>
    </div>
  )
}
